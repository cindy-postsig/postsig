-- Add APP_VISIT (per-user/day from auth.refresh_tokens) and INVITATION_SENT
-- (from app_invites) entries to admin_activity_logs, so the org-scoped and
-- user-scoped Activity tabs surface both alongside the existing events.
--
-- Signature unchanged (same args/return shape), so CREATE OR REPLACE is
-- enough and the migration is safe to re-run.

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
  contract_status   text,
  module            text,
  total_count       bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with audit as (
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
        )
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
    left join public.contracts c on c.id = cd.contract_id
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
      jsonb_build_object('fileName', mdf.file_name)  as new_data,
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
    left join public.module_documents md on md.id = mdf.module_document_id
    where md.is_deleted is not true
  ),
  app_visits as (
    -- Source from auth.audit_log_entries (append-only, never overwritten),
    -- one row per (user, calendar day), timestamped at the EARLIEST event of
    -- the day so the value reads as "when they first appeared that day".
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
    -- Use the invite row id (not token) for source_id/resource_id so the
    -- activity feed never leaks a token that could be cross-referenced with
    -- app_invites.
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
      case x.action
        when 'INVITATION_DECLINED'        then coalesce(x.metadata->>'reason', '')
        when 'CONTRACT_DOCUMENT_UPLOADED' then coalesce(x.new_data->>'fileName', '')
        else ''
      end                                 as detail,
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
      and (
        p_org_type = 'all'
        or (p_org_type = 'test'   and (e.is_demo_org or e.is_internal_user))
        or (p_org_type = 'client' and not e.is_demo_org and not e.is_internal_user)
      )
      and (
        p_search is null
        or btrim(p_search) = ''
        or coalesce(e.organization_name, '') ilike '%' || p_search || '%'
        or coalesce(e.user_name, '')         ilike '%' || p_search || '%'
        or coalesce(e.action, '')            ilike '%' || p_search || '%'
        or coalesce(e.module, '')            ilike '%' || p_search || '%'
        or coalesce(e.detail, '')            ilike '%' || p_search || '%'
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
