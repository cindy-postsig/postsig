-- Add transition events to admin_activity_logs:
--   DOCUMENT_PUBLISHED — status_id flipped to 4 (CPM) or 5 (Investor)
--   AI_FAILED          — ai_extraction_status flipped to ai_failed/ext_failed
--   MARKED_INVALID     — ai_extraction_status flipped to h_failed
--
-- Why this migration exists:
-- These events were added in the f73db79 hotfix that landed directly on
-- main but never reached development before the RPC in
-- 20260513150000_admin_activity_logs_inline.sql was authored. Without this
-- migration the events go dark once the development -> release merge ships.
--
-- Design (post-perf-tuning):
--   1. `audit_updates` (MATERIALIZED) — one scan of audit_log UPDATE rows
--      narrowed by timestamp, resource_type, not soft-deleted, and a target
--      end-state present in new_data. 30-day floor on timestamp when no
--      `p_date_from` is supplied. MATERIALIZED prevents the planner from
--      pushing outer `filtered` predicates into the scan.
--   2. `contract_filenames` — single scan of contract_docs to get the
--      latest file_path per contract_id. Avoids the per-row correlated
--      subquery that previously made the function time out — contract_docs
--      has no index on (contract_id), so each subquery was a seq scan.
--      Investor docs already carry their filename in new_data.metadata.
--   3. `transitions` — single scan of `audit_updates` using
--      `unnest(array_remove(array[…], null))` to emit 0–3 transition rows
--      per audit_log row inside a `CROSS JOIN LATERAL`. Replaces a previous
--      structure that scanned the candidate set three times via UNION ALL.

-- Return type changes (adding counterparty/doc_type/file_name), so we
-- must drop the prior signature; `create or replace function` rejects
-- return-type changes.
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
  with
  -- Reference data for enriching the `detail` column with counterparty
  -- (vendor/company) and document type names. Hoisted to the top so any
  -- CTE below can reference them — Postgres CTEs only see earlier ones.
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
    where a.action in ('INVITATION_DECLINED', 'USER_REGISTRATION')
       or (a.action = 'CREATE' and a.resource_type = 'chat_sessions')
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
  ),
  -- MATERIALIZED prevents the planner from pushing outer `filtered`
  -- predicates (which reference bound parameters like $6) into the
  -- auth.audit_log_entries scan. Without this, parameterized calls choose
  -- a Nested Loop on this CTE and the function runs ~10s instead of ~400ms.
  app_visits as materialized (
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
  ),
  -- Candidate UPDATE rows for transition detection. Hard 30-day cap on
  -- timestamp: `greatest(p_date_from, now() - interval '30 days')` returns
  -- p_date_from when it's more recent than the cap, else the cap. Null
  -- p_date_from falls through (GREATEST ignores nulls), so the unfiltered
  -- call also gets 30 days. The current UI's longest preset is 30d and
  -- "All Time" sends no dateFrom, so there's no caller path that wants
  -- more — making this a hard cap rules out perf cliffs from future
  -- callers. Pre-narrows to rows whose new_data shows one of the target
  -- end-states; old/new diff is enforced per-row in `transitions` below.
  audit_updates as materialized (
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
      and al."timestamp" >= greatest(p_date_from, now() - interval '30 days')
      and coalesce(al.new_data->>'is_deleted', 'false') <> 'true'
      and (
        al.new_data->>'status_id' in ('4', '5')
        or al.new_data->>'ai_extraction_status' in ('ai_failed', 'ext_failed', 'h_failed')
      )
  ),
  -- One pass over contract_docs to get the latest filename per contract.
  -- Replaces a per-row correlated subquery; contract_docs has no index on
  -- (contract_id) so the per-row form was scanning the table N times.
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
  -- One pass over module_document_files to get the latest file_name per
  -- module_document_id. For Investor transitions, new_data.metadata only
  -- carries `original_filename` for some document_group_types — others
  -- (e.g., 'transaction') don't, so we fall back to the upload's file_name.
  module_document_filenames as (
    select distinct on (mdf.module_document_id)
      mdf.module_document_id,
      mdf.file_name
    from public.module_document_files mdf
    where mdf.file_name is not null
    order by mdf.module_document_id, mdf.created_at desc
  ),
  -- One scan of audit_updates; for each row emit 0–3 transition events via
  -- unnest of an array with nulls removed. The diff (old vs new) is checked
  -- inside the case expressions, so non-transitioning UPDATEs drop out here.
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
      x.contract_status,
      case
        when x.action = 'INVITATION_DECLINED' then coalesce(x.metadata->>'reason', '')
        else ''
      end                                 as detail,
      nullif(x.new_data->>'counterparty', '')  as counterparty,
      nullif(x.new_data->>'docType', '')       as doc_type,
      nullif(x.new_data->>'fileName', '')      as file_name,
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
  ),
  filtered as (
    select *
    from enriched e
    where (p_date_from is null or e.ts >= p_date_from)
      and (p_date_to   is null or e.ts <= p_date_to)
      and (p_action    is null or e.action = p_action)
      and (
        p_module is null
        or coalesce(e.module, '') ilike '%' || p_module || '%'
      )
      and (p_organization_id is null or e.organization_id = p_organization_id)
      and (p_user_id is null or e.user_id = p_user_id)
      -- Scope by the *resource owner* (organization), not the actor. A
      -- Postsig staffer publishing a client org's document is still a
      -- client-org activity, so internal-user identity must not
      -- reclassify the row. is_internal_user is left available for
      -- display (badges, etc.) but is intentionally not part of the
      -- filter predicate.
      and (
        p_org_type = 'all'
        or (p_org_type = 'test'   and e.is_demo_org)
        or (p_org_type = 'client' and not e.is_demo_org)
      )
      and (
        p_search is null
        or btrim(p_search) = ''
        or coalesce(e.organization_name, '') ilike '%' || p_search || '%'
        or coalesce(e.user_name, '')         ilike '%' || p_search || '%'
        or coalesce(e.action, '')            ilike '%' || p_search || '%'
        or coalesce(e.module, '')            ilike '%' || p_search || '%'
        or coalesce(e.detail, '')            ilike '%' || p_search || '%'
        or coalesce(e.counterparty, '')      ilike '%' || p_search || '%'
        or coalesce(e.doc_type, '')          ilike '%' || p_search || '%'
        or coalesce(e.file_name, '')         ilike '%' || p_search || '%'
        or coalesce(e.contract_status, '')   ilike '%' || p_search || '%'
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
