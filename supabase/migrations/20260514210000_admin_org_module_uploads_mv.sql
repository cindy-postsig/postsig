-- Materialize per-(organization × module) upload rollups.
--
-- Powers /admin/uploads, dashboard "uploads today" / "active orgs" tiles,
-- and the org-profile KPI cards. Replaces the in-JS aggregation in
-- aggregateUploadsByOrgModule / getRecentUploads / getOrgOverview, which
-- previously fetched every contract_docs + module_document_files row to
-- the app server and reduced them client-side.
--
-- One row per (organization_id, module) pair — even with hundreds of
-- orgs this is tiny, so all-time history is fine and refresh is cheap.
-- The bucketing logic mirrors lib/upload-status.ts (cpmStatusLabel /
-- investorStatusLabel) so the MV produces the same numbers the current
-- code produces.
--
-- "Today" is anchored to America/New_York, matching the rest of the
-- upload metrics. The value is computed at refresh time, so after ET
-- midnight there's up to a 5-min lag before "uploaded_today" rolls over.
--
-- Trial flag is intentionally NOT stored on the row — it's derived from
-- public.organizations + organization_modules at query time. The orgs
-- table is small enough that the join is cheap, and leaving trial out
-- of the MV avoids re-materializing whenever trial settings change.

-- pg_cron is preloaded on Supabase (managed and local), but the extension
-- itself isn't installed in fresh databases — installing it here makes the
-- `cron.schedule` / `cron.job` references below work in CI too.
create extension if not exists pg_cron;

-------------------------------------------------------------------------------
-- 1. Materialized view
-------------------------------------------------------------------------------

drop materialized view if exists public.admin_org_module_uploads_mv;

create materialized view public.admin_org_module_uploads_mv as
  with et_today as (
    -- ET midnight as a UTC instant. Recomputed at every refresh.
    select (
      date_trunc('day', now() at time zone 'America/New_York')
        at time zone 'America/New_York'
    ) as ts
  ),
  cpm as (
    select
      c.organization_id,
      'CPM'::text                                                     as module,
      -- Bucket each contract_docs row by its parent contract's current
      -- state. Mirrors cpmStatusLabel in lib/upload-status.ts: duplicate
      -- > h_failed > status_id>=4 (published) > pending.
      case
        when c.is_duplicate then 'Duplicate'
        when c.ai_extraction_status = 'h_failed' then 'Failed'
        when c.status_id is not null
             and c.status_id >= 4
             and c.status_id <> 5 then 'Published'
        else 'Pending'
      end                                                             as bucket,
      cd.created_at                                                   as ts
    from public.contract_docs cd
    join public.contracts c on c.id = cd.contract_id
    where cd.file_path is not null
  ),
  investor as (
    select
      md.organization_id,
      'Investor'::text                                                as module,
      -- Mirrors investorStatusLabel: status_id=5 always wins, then
      -- failure error codes, then h_failed, then pending.
      case
        when md.status_id = 5 then 'Published'
        when md.metadata->'failure'->'error'->>'code' = 'DUPLICATE_FILE'
          then 'Duplicate'
        when md.metadata->'failure'->'error'->>'code' in (
          'UNSUPPORTED_FILE_TYPE',
          'DUPLICATE_FILE',
          'FILE_SIZE_EXCEEDED'
        ) then 'Failed'
        when md.ai_extraction_status = 'h_failed' then 'Failed'
        else 'Pending'
      end                                                             as bucket,
      mdf.created_at                                                  as ts
    from public.module_document_files mdf
    join public.module_documents md on md.id = mdf.module_document_id
    where md.is_deleted is not true
  ),
  unioned as (
    select * from cpm
    union all
    select * from investor
  )
  select
    u.organization_id,
    o.name                                                            as organization_name,
    coalesce(o.is_demo_org, false)                                    as is_demo_org,
    u.module,
    count(*)::int                                                     as uploaded,
    count(*) filter (where u.ts >= (select ts from et_today))::int    as uploaded_today,
    count(*) filter (where u.bucket = 'Published')::int               as published,
    count(*) filter (where u.bucket = 'Pending')::int                 as pending,
    count(*) filter (where u.bucket = 'Failed')::int                  as failed,
    count(*) filter (where u.bucket = 'Duplicate')::int               as duplicate,
    max(u.ts)                                                         as latest_ts
  from unioned u
  left join public.organizations o on o.id = u.organization_id
  where u.organization_id is not null
  group by u.organization_id, o.name, o.is_demo_org, u.module;

-------------------------------------------------------------------------------
-- 2. Indexes
-------------------------------------------------------------------------------

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
-- (organization_id, module) is the natural primary key.
create unique index admin_org_module_uploads_mv_pk
  on public.admin_org_module_uploads_mv (organization_id, module);

-- Filter by module on /admin/uploads.
create index admin_org_module_uploads_mv_module_idx
  on public.admin_org_module_uploads_mv (module);

-- Sort by recent activity (default for /admin/uploads). Index supports
-- ORDER BY latest_ts DESC + LIMIT for paginated reads.
create index admin_org_module_uploads_mv_latest_idx
  on public.admin_org_module_uploads_mv (latest_ts desc nulls last);

-------------------------------------------------------------------------------
-- 3. Refresh wrapper + cron schedule
-------------------------------------------------------------------------------

create or replace function public.admin_org_module_uploads_refresh()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently public.admin_org_module_uploads_mv;
end;
$$;

revoke all on function public.admin_org_module_uploads_refresh() from public;
revoke all on function public.admin_org_module_uploads_refresh() from authenticated;
grant execute on function public.admin_org_module_uploads_refresh() to service_role;

-- Idempotent (re)schedule.
do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'refresh-admin-org-module-uploads';
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end;
$$;

-- Same 5-min cadence as the activity logs MV — same staleness budget
-- for the dashboard / uploads page.
select cron.schedule(
  'refresh-admin-org-module-uploads',
  '*/5 * * * *',
  $$select public.admin_org_module_uploads_refresh();$$
);

-------------------------------------------------------------------------------
-- 4. Initial populate
-------------------------------------------------------------------------------

refresh materialized view public.admin_org_module_uploads_mv;
