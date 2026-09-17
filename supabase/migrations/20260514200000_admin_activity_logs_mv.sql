-- Materialize admin_activity_logs.
--
-- Previously the RPC computed 6 source CTEs + 4 lookup CTEs + enrichment
-- on every call. For a typical /admin/logs render that's a lot of work
-- to repeat — especially with the ilike-across-9-columns search predicate
-- in the final filter. The unioned, enriched activity-log set only
-- changes when new audit rows are written, so we precompute it into a
-- materialized view and have the RPC just SELECT from it.
--
-- Design:
--   * `admin_activity_logs_mv` holds the last 60 days of unioned +
--     enriched activity, plus a `search_doc tsvector` generated from
--     the searchable columns. GIN-indexed for full-text search.
--   * Concurrent refresh requires a unique index — we use (source,
--     source_id), which the existing CTEs already produce uniquely.
--   * `admin_activity_logs_refresh()` is a SECURITY DEFINER wrapper so
--     the cron job (and a future "refresh now" admin button) can call
--     it without owning the view.
--   * pg_cron job runs every 5 minutes — staleness budget for the
--     admin activity log. Tuned conservatively to keep DB load low;
--     bump down to 1m if staffers complain about seeing their own
--     actions late.
--   * The RPC `admin_activity_logs(...)` keeps its parameter signature
--     and return shape, so postsig-admin needs no code change. The
--     body becomes a thin SELECT from the view with WHERE clauses
--     and the tsvector search predicate.

-- pg_cron is preloaded on Supabase (managed and local), but the extension
-- itself isn't installed in fresh databases — installing it here makes the
-- `cron.schedule` / `cron.job` references below work in CI too.
create extension if not exists pg_cron;

-------------------------------------------------------------------------------
-- 1. Materialized view
-------------------------------------------------------------------------------

drop materialized view if exists public.admin_activity_logs_mv;

create materialized view public.admin_activity_logs_mv as
  with
  vendor_names as (
    select id, name from public.vendors
  ),
  contract_type_names as (
    select id, name from public.contract_types
  ),
  company_names as (
    select id, name from public.companies
  ),
  document_type_names as (
    select id, name from public.document_types
  ),
  audit as (
    select
      'audit'::text                                  as source,
      a.id::text                                     as source_id,
      a."timestamp"                                  as ts,
      a.action,
      a.resource_type,
      a.resource_id,
      coalesce(a.organization_id, u.organization_id, inv_u.organization_id) as organization_id,
      coalesce(a.user_id, inv.user_id)               as user_id,
      a.metadata,
      a.new_data,
      null::text                                     as contract_status,
      null::text                                     as module_override
    from public.audit_log a
    left join public.users u            on u.id = a.user_id
    left join public.app_invites inv    on inv.token = a.resource_id
                                  and a.action = 'INVITATION_DECLINED'
                                  and a.user_id is null
    left join public.users inv_u        on inv_u.id = inv.user_id
    where (a.action in ('INVITATION_DECLINED', 'USER_REGISTRATION')
       or (a.action = 'CREATE' and a.resource_type = 'chat_sessions'))
      and a."timestamp" >= now() - interval '60 days'
  ),
  cpm_uploads as (
    select
      'contract_docs'::text                          as source,
      cd.id::text                                    as source_id,
      cd.created_at                                  as ts,
      'CONTRACT_DOCUMENT_UPLOADED'::text             as action,
      'contracts'::text                              as resource_type,
      c.id::text                                     as resource_id,
      c.organization_id,
      cd.user_id,
      null::jsonb                                    as metadata,
      jsonb_build_object(
        'fileName',
        coalesce(
          nullif(reverse(split_part(reverse(cd.file_path), '/', 1)), ''),
          cd.file_path
        ),
        'counterparty', vn.name,
        'docType',      ctn.name
      )                                              as new_data,
      case
        when c.is_duplicate then 'Duplicate'
        when c.ai_extraction_status in ('ai_failed','ext_failed','h_failed') then 'Failed'
        when c.ai_extraction_status in ('rerunning','rerun_queued') then 'Reprocessing'
        when c.status_id = 4 then 'Published'
        when c.status_id = 1 then 'New'
        when c.status_id = 2 then 'In Progress'
        when c.status_id = 3 then 'Submitted'
        when c.status_id = 5 then 'Uploaded'
        else ''
      end                                            as contract_status,
      'CPM'::text                                    as module_override
    from public.contract_docs cd
    left join public.contracts c          on c.id = cd.contract_id
    left join vendor_names vn             on vn.id = c.vendor_id
    left join contract_type_names ctn     on ctn.id = c.type_id
    where cd.file_path is not null
      and cd.created_at >= now() - interval '60 days'
  ),
  investor_uploads as (
    select
      'module_document_files'::text                  as source,
      mdf.id::text                                   as source_id,
      mdf.created_at                                 as ts,
      'CONTRACT_DOCUMENT_UPLOADED'::text             as action,
      'module_documents'::text                       as resource_type,
      md.id::text                                    as resource_id,
      md.organization_id,
      md.user_id,
      null::jsonb                                    as metadata,
      jsonb_build_object(
        'fileName',     mdf.file_name,
        'counterparty', cn.name,
        'docType',      dtn.name
      )                                              as new_data,
      case
        when md.metadata->>'error_code' = 'DUPLICATE_FILE' then 'Duplicate'
        when md.metadata->>'error_code' is not null then 'Failed'
        when md.ai_extraction_status in ('ai_failed','ext_failed') then 'Failed'
        when md.ai_extraction_status in ('ai_success','ext_success') then 'Published'
        when md.ai_extraction_status in ('rerunning','rerun_queued') then 'Reprocessing'
        when md.status_id is not null then 'In Progress'
        else 'Uploaded'
      end                                            as contract_status,
      'Investor'::text                               as module_override
    from public.module_document_files mdf
    left join public.module_documents md  on md.id = mdf.module_document_id
    left join company_names cn            on cn.id = md.company_id
    left join document_type_names dtn     on dtn.id = md.document_type_id
    where md.is_deleted is not true
      and mdf.created_at >= now() - interval '60 days'
  ),
  app_visits as (
    select distinct on (
      ((ale.payload->>'actor_id'))::uuid,
      date_trunc('day', ale.created_at)
    )
      'app_visit'::text                              as source,
      ((ale.payload->>'actor_id')
        || ':' || to_char(ale.created_at at time zone 'UTC', 'YYYY-MM-DD'))
                                                     as source_id,
      ale.created_at                                 as ts,
      'APP_VISIT'::text                              as action,
      'auth'::text                                   as resource_type,
      null::text                                     as resource_id,
      u.organization_id,
      ((ale.payload->>'actor_id'))::uuid             as user_id,
      null::jsonb                                    as metadata,
      null::jsonb                                    as new_data,
      null::text                                     as contract_status,
      null::text                                     as module_override
    from auth.audit_log_entries ale
    left join public.users u
      on u.id::text = ale.payload->>'actor_id'
    where ale.payload->>'action' in ('token_refreshed', 'login')
      and ale.payload->>'actor_id' is not null
      and ale.created_at >= now() - interval '60 days'
    order by
      ((ale.payload->>'actor_id'))::uuid,
      date_trunc('day', ale.created_at),
      ale.created_at asc
  ),
  invites_sent as (
    select
      'app_invites'::text                            as source,
      inv.id::text                                   as source_id,
      inv.invited_at                                 as ts,
      'INVITATION_SENT'::text                        as action,
      'app_invites'::text                            as resource_type,
      inv.id::text                                   as resource_id,
      coalesce(inv.organization_id, u.organization_id) as organization_id,
      inv.user_id                                    as user_id,
      null::jsonb                                    as metadata,
      null::jsonb                                    as new_data,
      null::text                                     as contract_status,
      null::text                                     as module_override
    from public.app_invites inv
    left join public.users u on u.id = inv.user_id
    where inv.invited_at is not null
      and inv.invited_at >= now() - interval '60 days'
  ),
  audit_updates as (
    select
      al.id,
      al."timestamp"      as ts,
      al.resource_type,
      al.resource_id,
      al.organization_id,
      al.user_id,
      al.old_data,
      al.new_data
    from public.audit_log al
    where al.action = 'UPDATE'
      and al.resource_type in ('contracts', 'module_documents')
      and al."timestamp" >= now() - interval '60 days'
      and coalesce(al.new_data->>'is_deleted', 'false') <> 'true'
      and (
        al.new_data->>'status_id' in ('4', '5')
        or al.new_data->>'ai_extraction_status' in ('ai_failed', 'ext_failed', 'h_failed')
      )
  ),
  contract_filenames as (
    select distinct on (cd.contract_id)
      cd.contract_id,
      coalesce(
        nullif(reverse(split_part(reverse(cd.file_path), '/', 1)), ''),
        cd.file_path
      ) as file_name
    from public.contract_docs cd
    where cd.file_path is not null
    order by cd.contract_id, cd.created_at desc
  ),
  module_document_filenames as (
    select distinct on (mdf.module_document_id)
      mdf.module_document_id,
      mdf.file_name
    from public.module_document_files mdf
    where mdf.file_name is not null
    order by mdf.module_document_id, mdf.created_at desc
  ),
  transitions as (
    select
      'transition'::text                             as source,
      (au.id::text || ':' || t.action_name)          as source_id,
      au.ts,
      t.action_name                                  as action,
      au.resource_type,
      coalesce(au.new_data->>'id', au.resource_id)   as resource_id,
      coalesce((au.new_data->>'organization_id')::uuid, au.organization_id) as organization_id,
      coalesce(au.user_id, nullif(au.old_data->>'locked_by','')::uuid) as user_id,
      null::jsonb                                    as metadata,
      jsonb_build_object(
        'fileName',
        coalesce(
          case au.resource_type
            when 'module_documents' then
              coalesce(au.new_data->'metadata'->>'original_filename', mdfn.file_name)
            else cf.file_name
          end,
          ''
        ),
        'counterparty',
        case au.resource_type
          when 'module_documents' then cn.name
          else vn.name
        end,
        'docType',
        case au.resource_type
          when 'module_documents' then dtn.name
          else ctn.name
        end
      )                                              as new_data,
      null::text                                     as contract_status,
      case au.resource_type when 'contracts' then 'CPM' else 'Investor' end as module_override
    from audit_updates au
    cross join lateral (
      select unnest(array_remove(array[
        case
          when (au.resource_type = 'contracts'
                and au.new_data->>'status_id' = '4'
                and coalesce(au.old_data->>'status_id', '') <> '4')
            or (au.resource_type = 'module_documents'
                and au.new_data->>'status_id' = '5'
                and coalesce(au.old_data->>'status_id', '') <> '5')
          then 'DOCUMENT_PUBLISHED'
        end,
        case
          when au.new_data->>'ai_extraction_status' in ('ai_failed', 'ext_failed')
           and coalesce(au.old_data->>'ai_extraction_status', '') not in ('ai_failed', 'ext_failed')
          then 'AI_FAILED'
        end,
        case
          when au.new_data->>'ai_extraction_status' = 'h_failed'
           and coalesce(au.old_data->>'ai_extraction_status', '') <> 'h_failed'
          then 'MARKED_INVALID'
        end
      ], null)) as action_name
    ) t
    left join contract_filenames cf
      on au.resource_type = 'contracts'
      and cf.contract_id = nullif(au.new_data->>'id','')::int
    left join module_document_filenames mdfn
      on au.resource_type = 'module_documents'
      and mdfn.module_document_id = nullif(au.new_data->>'id','')::bigint
    left join vendor_names vn
      on au.resource_type = 'contracts'
      and vn.id = nullif(au.new_data->>'vendor_id','')::int
    left join contract_type_names ctn
      on au.resource_type = 'contracts'
      and ctn.id = nullif(au.new_data->>'type_id','')::bigint
    left join company_names cn
      on au.resource_type = 'module_documents'
      and cn.id = nullif(au.new_data->>'company_id','')::bigint
    left join document_type_names dtn
      on au.resource_type = 'module_documents'
      and dtn.id = nullif(au.new_data->>'document_type_id','')::bigint
  ),
  unioned as (
    select * from audit
    union all
    select * from cpm_uploads
    union all
    select * from investor_uploads
    union all
    select * from app_visits
    union all
    select * from invites_sent
    union all
    select * from transitions
  ),
  org_modules as (
    select
      om.organization_id,
      string_agg(
        case lower(am.code)
          when 'cpm' then 'CPM'
          when 'investor' then 'Investor'
          else upper(am.code)
        end,
        ', '
        order by am.code
      ) as modules_label
    from public.organization_modules om
    join public.app_modules am on am.id = om.module_id
    where om.is_enabled = true
    group by om.organization_id
  ),
  enriched as (
    select
      x.source,
      x.source_id,
      x.ts,
      x.action,
      x.resource_type,
      x.resource_id,
      x.organization_id,
      o.name                              as organization_name,
      coalesce(o.is_demo_org, false)      as is_demo_org,
      x.user_id,
      u.name                              as user_name,
      u.email                             as user_email,
      coalesce(u.email like '%@postsig.com', false) as is_internal_user,
      x.metadata                          as raw_metadata,
      case
        when x.action = 'INVITATION_DECLINED' then coalesce(x.metadata->>'reason', '')
        else ''
      end                                 as detail,
      nullif(x.new_data->>'counterparty', '')  as counterparty,
      nullif(x.new_data->>'docType', '')       as doc_type,
      nullif(x.new_data->>'fileName', '')      as file_name,
      x.contract_status,
      coalesce(
        x.module_override,
        case
          when x.action in (
            'USER_REGISTRATION',
            'INVITATION_SENT',
            'INVITATION_DECLINED'
          )
            then om.modules_label
          else null
        end
      )                                   as module
    from unioned x
    left join public.organizations o on o.id = x.organization_id
    left join public.users u         on u.id = x.user_id
    left join org_modules om         on om.organization_id = x.organization_id
  )
  select
    e.source,
    e.source_id,
    e.ts,
    e.action,
    e.resource_type,
    e.resource_id,
    e.organization_id,
    e.organization_name,
    e.is_demo_org,
    e.user_id,
    e.user_name,
    e.user_email,
    e.is_internal_user,
    e.raw_metadata,
    e.detail,
    e.counterparty,
    e.doc_type,
    e.file_name,
    e.contract_status,
    e.module,
    -- Single tsvector covering everything the UI search box looks at,
    -- so the function's WHERE-clause becomes one GIN-indexed match
    -- instead of nine ilike scans.
    to_tsvector(
      'simple',
      coalesce(e.organization_name, '') || ' ' ||
      coalesce(e.user_name, '')         || ' ' ||
      coalesce(e.action, '')            || ' ' ||
      coalesce(e.module, '')            || ' ' ||
      coalesce(e.detail, '')            || ' ' ||
      coalesce(e.counterparty, '')      || ' ' ||
      coalesce(e.doc_type, '')          || ' ' ||
      coalesce(e.file_name, '')         || ' ' ||
      coalesce(e.contract_status, '')
    ) as search_doc
  from enriched e;

-------------------------------------------------------------------------------
-- 2. Indexes
-------------------------------------------------------------------------------

-- Unique index is required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
-- (source, source_id) is naturally unique across all source CTEs because
-- the transitions branch already disambiguates by including the action
-- name in source_id (`<audit_id>:DOCUMENT_PUBLISHED` etc.).
create unique index admin_activity_logs_mv_pk
  on public.admin_activity_logs_mv (source, source_id);

-- Covers the default page query (ORDER BY ts DESC + LIMIT).
create index admin_activity_logs_mv_ts_idx
  on public.admin_activity_logs_mv (ts desc);

-- Action filter; very common.
create index admin_activity_logs_mv_action_ts_idx
  on public.admin_activity_logs_mv (action, ts desc);

-- Org/user scoped variants on the org and user profile pages.
create index admin_activity_logs_mv_org_ts_idx
  on public.admin_activity_logs_mv (organization_id, ts desc)
  where organization_id is not null;

create index admin_activity_logs_mv_user_ts_idx
  on public.admin_activity_logs_mv (user_id, ts desc)
  where user_id is not null;

-- Full-text search index. GIN on tsvector is the indexable form of the
-- old `ilike '%X%'` chain; lookup is sub-linear and consistent regardless
-- of search term length.
create index admin_activity_logs_mv_search_idx
  on public.admin_activity_logs_mv using gin (search_doc);

-------------------------------------------------------------------------------
-- 3. Refresh wrapper + cron schedule
-------------------------------------------------------------------------------

-- SECURITY DEFINER so the cron job (running as the cron role) can refresh
-- without being granted ownership of the view. CONCURRENTLY avoids
-- blocking SELECT queries during refresh; the unique index above makes
-- that possible.
create or replace function public.admin_activity_logs_refresh()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently public.admin_activity_logs_mv;
end;
$$;

revoke all on function public.admin_activity_logs_refresh() from public;
revoke all on function public.admin_activity_logs_refresh() from authenticated;
grant execute on function public.admin_activity_logs_refresh() to service_role;

-- Idempotent: unschedule any existing job with the same name before
-- creating, so re-running the migration doesn't pile up duplicate jobs.
do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'refresh-admin-activity-logs';
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end;
$$;

-- Every 5 minutes. Bump down to '* * * * *' (1m) if staleness becomes
-- a complaint; the view is small enough that minute-cadence is viable.
select cron.schedule(
  'refresh-admin-activity-logs',
  '*/5 * * * *',
  $$select public.admin_activity_logs_refresh();$$
);

-------------------------------------------------------------------------------
-- 4. Rewrite the RPC to read from the materialized view
-------------------------------------------------------------------------------

-- Same parameter signature and return type as the prior function, so
-- postsig-admin needs no code change. The body is now a thin SELECT.

drop function if exists public.admin_activity_logs(
  timestamptz, timestamptz, text, text, uuid, uuid, text, text, int, int
);

create or replace function public.admin_activity_logs(
  p_date_from   timestamptz default null,
  p_date_to     timestamptz default null,
  p_action      text        default null,
  p_module      text        default null,
  p_organization_id uuid    default null,
  p_user_id     uuid        default null,
  p_org_type    text        default 'all',
  p_search      text        default null,
  p_limit       int         default 50,
  p_offset      int         default 0
)
returns table (
  source            text,
  source_id         text,
  ts                timestamptz,
  action            text,
  resource_type     text,
  resource_id       text,
  organization_id   uuid,
  organization_name text,
  is_demo_org       boolean,
  user_id           uuid,
  user_name         text,
  user_email        text,
  is_internal_user  boolean,
  detail            text,
  counterparty      text,
  doc_type          text,
  file_name         text,
  contract_status   text,
  module            text,
  total_count       bigint
)
language sql
stable
as $$
  with filtered as (
    select *
    from public.admin_activity_logs_mv mv
    where (p_date_from is null or mv.ts >= p_date_from)
      and (p_date_to   is null or mv.ts <= p_date_to)
      and (p_action    is null or mv.action = p_action)
      and (
        p_module is null
        or coalesce(mv.module, '') ilike '%' || p_module || '%'
      )
      and (p_organization_id is null or mv.organization_id = p_organization_id)
      and (p_user_id is null or mv.user_id = p_user_id)
      and (
        p_org_type = 'all'
        or (p_org_type = 'test'   and mv.is_demo_org)
        or (p_org_type = 'client' and not mv.is_demo_org)
      )
      and (
        p_search is null
        or btrim(p_search) = ''
        or mv.search_doc @@ websearch_to_tsquery('simple', p_search)
      )
  )
  select
    f.source,
    f.source_id,
    f.ts,
    f.action,
    f.resource_type,
    f.resource_id,
    f.organization_id,
    f.organization_name,
    f.is_demo_org,
    f.user_id,
    f.user_name,
    f.user_email,
    f.is_internal_user,
    f.detail,
    f.counterparty,
    f.doc_type,
    f.file_name,
    f.contract_status,
    f.module,
    count(*) over ()                                                   as total_count
  from filtered f
  order by f.ts desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.admin_activity_logs(
  timestamptz, timestamptz, text, text, uuid, uuid, text, text, int, int
) from public;
revoke all on function public.admin_activity_logs(
  timestamptz, timestamptz, text, text, uuid, uuid, text, text, int, int
) from authenticated;
grant execute on function public.admin_activity_logs(
  timestamptz, timestamptz, text, text, uuid, uuid, text, text, int, int
) to service_role;

-------------------------------------------------------------------------------
-- 5. Initial populate
-------------------------------------------------------------------------------

-- The CREATE MATERIALIZED VIEW above already populated the view, but be
-- explicit about it. (REFRESH without CONCURRENTLY for the initial run,
-- since concurrent refresh requires an existing populated view.)
refresh materialized view public.admin_activity_logs_mv;
