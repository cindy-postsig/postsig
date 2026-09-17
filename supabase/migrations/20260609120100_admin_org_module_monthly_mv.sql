-- Per-(organization × module × month) upload + growth rollup.
--
-- Powers the org-profile monthly trend chart (PSK-1531): tracks three
-- metrics over time for usage tracking / dynamic pricing analysis —
--   * uploaded     : docs uploaded that month
--   * published    : of those uploads, the count now in Published state
--                    (final form per cpmStatusLabel / investorStatusLabel)
--   * new_entities : distinct vendors (CPM) / companies (Investor)
--                    first-seen for this org in this month — the TS layer
--                    run-sums this into a cumulative line on the chart
--
-- The org-profile's *current totals* (KPI tiles) keep reading from
-- admin_org_module_uploads_mv, which is point-in-time. This MV is the
-- history-by-month parallel.
--
-- Grain: one sparse row per (organization_id, module, month_start).
-- Months with zero activity for an org are absent — the consumer fills
-- gaps with zeros over its rendered window.
--
-- Coverage: all-time. For ~50 orgs × 2 modules × 5 yrs that's at most a
-- few thousand rows in practice (sparser than the worst case), so we
-- don't bound the history at MV-build time. The UI bounds the visible
-- window at read time.
--
-- Month bucket anchored to America/New_York, matching the upload-rollup
-- MV's "today" anchor.

-- pg_cron is already installed on this DB (see prior admin MV migrations).
-- Re-running `create extension if not exists` here errors on Supabase
-- remote with "dependent privileges exist" even when the IF NOT EXISTS
-- branch is taken, so the call is omitted.

-------------------------------------------------------------------------------
-- 1. Materialized view
-------------------------------------------------------------------------------

drop materialized view if exists public.admin_org_module_monthly_mv;

create materialized view public.admin_org_module_monthly_mv as
  with
  -- Per-row uploads, bucketed via the shared bucket fns (see
  -- 20260609120000_admin_upload_bucket_fns.sql).
  cpm_uploads as (
    select
      c.organization_id,
      'CPM'::text                                                       as module,
      date_trunc(
        'month', cd.created_at at time zone 'America/New_York'
      )::date                                                           as month_start,
      public.admin_upload_bucket_cpm(
        c.is_duplicate, c.ai_extraction_status::text, c.status_id
      )                                                                 as bucket
    from public.contract_docs cd
    join public.contracts c on c.id = cd.contract_id
    where cd.file_path is not null
      and c.organization_id is not null
  ),
  investor_uploads as (
    select
      md.organization_id,
      'Investor'::text                                                  as module,
      date_trunc(
        'month', mdf.created_at at time zone 'America/New_York'
      )::date                                                           as month_start,
      public.admin_upload_bucket_investor(
        md.status_id,
        md.metadata->'failure'->'error'->>'code',
        md.ai_extraction_status::text
      )                                                                 as bucket
    from public.module_document_files mdf
    join public.module_documents md on md.id = mdf.module_document_id
    where md.is_deleted is not true
      and md.organization_id is not null
  ),
  uploads_rollup as (
    select
      organization_id,
      module,
      month_start,
      count(*)::int                                          as uploaded,
      count(*) filter (where bucket = 'Published')::int      as published,
      0::int                                                 as new_entities
    from (
      select * from cpm_uploads
      union all
      select * from investor_uploads
    ) u
    group by organization_id, module, month_start
  ),
  -- First-seen month per (org, vendor) / (org, company). These define
  -- the "new this month" growth signal that the TS layer runs-sums into
  -- the cumulative vendors/portcos line. Filters mirror getOrgOverview's
  -- distinct-counting (org-overview-actions.ts) so the cumulative end of
  -- the chart agrees with the KPI tile.
  cpm_first_seen as (
    select
      organization_id,
      vendor_id,
      min(created_at)                                        as first_ts
    from public.contracts
    where organization_id is not null
      and vendor_id is not null
    group by organization_id, vendor_id
  ),
  investor_first_seen as (
    select
      organization_id,
      company_id,
      min(created_at)                                        as first_ts
    from public.module_documents
    where organization_id is not null
      and company_id is not null
      and module_id = 2          -- INVESTOR_MODULE_ID
      and is_deleted is not true
      and user_id is not null
    group by organization_id, company_id
  ),
  new_entities_rollup as (
    select
      organization_id,
      'CPM'::text                                            as module,
      date_trunc(
        'month', first_ts at time zone 'America/New_York'
      )::date                                                as month_start,
      0::int                                                 as uploaded,
      0::int                                                 as published,
      count(*)::int                                          as new_entities
    from cpm_first_seen
    group by
      organization_id,
      date_trunc('month', first_ts at time zone 'America/New_York')::date
    union all
    select
      organization_id,
      'Investor'::text                                       as module,
      date_trunc(
        'month', first_ts at time zone 'America/New_York'
      )::date                                                as month_start,
      0::int                                                 as uploaded,
      0::int                                                 as published,
      count(*)::int                                          as new_entities
    from investor_first_seen
    group by
      organization_id,
      date_trunc('month', first_ts at time zone 'America/New_York')::date
  ),
  combined as (
    select * from uploads_rollup
    union all
    select * from new_entities_rollup
  )
  select
    c.organization_id,
    o.name                                                   as organization_name,
    coalesce(o.is_demo_org, false)                           as is_demo_org,
    c.module,
    c.month_start,
    sum(c.uploaded)::int                                     as uploaded,
    sum(c.published)::int                                    as published,
    sum(c.new_entities)::int                                 as new_entities
  from combined c
  left join public.organizations o on o.id = c.organization_id
  where c.organization_id is not null
    and c.month_start is not null
  group by
    c.organization_id, o.name, o.is_demo_org, c.module, c.month_start;

-------------------------------------------------------------------------------
-- 2. Indexes
-------------------------------------------------------------------------------

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
-- (organization_id, module, month_start) is the natural primary key.
create unique index admin_org_module_monthly_mv_pk
  on public.admin_org_module_monthly_mv
  (organization_id, module, month_start);

-- Time-range scans (the chart fetches a contiguous trailing window).
create index admin_org_module_monthly_mv_month_idx
  on public.admin_org_module_monthly_mv (month_start desc);

-------------------------------------------------------------------------------
-- 3. Refresh wrapper + cron schedule
-------------------------------------------------------------------------------

create or replace function public.admin_org_module_monthly_refresh()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently public.admin_org_module_monthly_mv;
end;
$$;

revoke all on function public.admin_org_module_monthly_refresh() from public;
revoke all on function public.admin_org_module_monthly_refresh() from authenticated;
grant execute on function public.admin_org_module_monthly_refresh() to service_role;

-- Idempotent (re)schedule.
do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'refresh-admin-org-module-monthly';
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end;
$$;

-- Monthly buckets only roll over once a month, but the current-month
-- bucket updates continuously. Same 5-min cadence as the other admin
-- MVs — keeps the staleness budget consistent across the admin app.
select cron.schedule(
  'refresh-admin-org-module-monthly',
  '*/5 * * * *',
  $$select public.admin_org_module_monthly_refresh();$$
);

-------------------------------------------------------------------------------
-- 4. Initial populate
-------------------------------------------------------------------------------

-- Lock-down to service_role lives in the next migration
-- (20260609120200_lock_admin_org_module_monthly_mv.sql). Doing CREATE
-- MATERIALIZED VIEW and REVOKE ... FROM anon, authenticated in the same
-- transaction errors with "dependent privileges exist" against Supabase
-- remote — the auto-grant event trigger leaves grant-chain dependencies
-- that can only be revoked in a fresh transaction. The existing
-- admin_org_module_uploads_mv follows the same split-migration pattern.

refresh materialized view public.admin_org_module_monthly_mv;
