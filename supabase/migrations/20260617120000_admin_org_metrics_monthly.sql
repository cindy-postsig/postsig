-- Per-(organization × month) stock-metric snapshot for the admin Reports
-- section (PSK: customer reporting / renewal negotiation).
--
-- The existing admin_org_module_monthly_mv tracks *flow* (uploads/new entities
-- per month). This table is the parallel for the *stock* / valuation metrics
-- read "as of the end of month M":
--   CPM      : total_contracts, active_vendors, tcv
--   Investor : total_documents, portfolio_companies, fmv, total_invested
--
-- It is an append-only snapshot TABLE (not a materialized view) because TCV /
-- FMV history must be reconstructed per month — it can't be expressed as a
-- single GROUP BY over current rows the way an MV refresh needs.
--
-- Population is split, deliberately:
--   * This migration creates the table + the per-month refresh function + a
--     daily forward cron that keeps the current and just-closed month fresh.
--   * Historical backfill is run MANUALLY/separately (per-month, to avoid the
--     SQL-editor statement timeout) — see
--     postsig-admin/scripts/backfill-org-metrics.mjs (or
--     supabase/scripts/backfill_admin_org_metrics_monthly.sql). Migrations do
--     NOT run the backfill.
--
-- Metric definitions (kept in lockstep with the live getOrgOverviews used by
-- the report's KPI tiles + per-customer table, so chart == tiles/table):
--   * total_contracts / total_documents — cumulative per-module UPLOADS from
--     admin_org_module_monthly_mv (the "Uploaded" basis), through month M.
--   * active_vendors  — distinct vendors on status = 'active' contracts.
--   * tcv             — sum(vendor_products_details.fees) over PUBLISHED
--                       contracts (status_id >= 4 and <> 5, not duplicate,
--                       ai_extraction_status not 'h_failed'); whole agreement,
--                       cumulative by contract created_at.
--   * portfolio_companies — distinct investor companies (module_documents).
--   * fmv             — ownership × implied_valuation from each company's
--                       latest cap-table snapshot on/before end-of-M,
--                       preferring a round-tied snapshot (financing_round_id
--                       not null) over a same-date bulk import.
--   * total_invested  — -sum(inv_transaction.amount) for inflow types
--                       on/before end-of-M.
--
-- A row is emitted for month M only once the org has real IN-APP activity by
-- then (an upload, a contract, or a portfolio document — all created_at-dated).
-- FMV and total_invested are valuation/transaction-dated and routinely predate
-- the org adopting the Investor module, so they neither open a month on their
-- own NOR populate until the org has investor footprint (an uploaded investor
-- doc / portfolio company) by M — otherwise a CPM-only org-month would carry
-- phantom portfolio value. Net: an org's first investor chart point is its
-- first investor upload, with FMV "as of" that month — not a 2024 phantom.
-- Demo/test orgs (is_demo_org) are excluded from the snapshot entirely.
--
-- pg_cron is already installed on this DB (see prior admin MV migrations);
-- `create extension` is intentionally omitted (it errors on Supabase remote
-- with "dependent privileges exist" even under IF NOT EXISTS).

-------------------------------------------------------------------------------
-- 1. Snapshot table
-------------------------------------------------------------------------------

create table if not exists public.admin_org_metrics_monthly (
  organization_id         uuid        not null,
  organization_name       text,
  is_demo_org             boolean     not null default false,
  month_start             date        not null,
  cpm_total_contracts     integer     not null default 0,
  cpm_active_vendors      integer     not null default 0,
  cpm_tcv                 numeric     not null default 0,
  inv_total_documents     integer     not null default 0,
  inv_portfolio_companies integer     not null default 0,
  inv_fmv                 numeric     not null default 0,
  inv_total_invested      numeric     not null default 0,
  computed_at             timestamptz not null default now(),
  primary key (organization_id, month_start)
);

-- Cross-org per-month aggregation (the all-customer growth line).
create index if not exists admin_org_metrics_monthly_month_idx
  on public.admin_org_metrics_monthly (month_start);

-- RLS-enabled with no policy denies anon/authenticated; service_role (the
-- admin app's server client) bypasses RLS.
alter table public.admin_org_metrics_monthly enable row level security;
grant select, insert, update, delete
  on public.admin_org_metrics_monthly to service_role;

-------------------------------------------------------------------------------
-- 2. Per-month refresh function
-------------------------------------------------------------------------------
-- Recomputes and upserts one month's snapshot for every non-demo org with
-- activity that month. Idempotent; returns the number of rows written.

create or replace function public.admin_refresh_org_metrics_monthly(p_month date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ms date        := date_trunc('month', p_month)::date;
  me timestamptz := (date_trunc('month', p_month) + interval '1 month');
  n  integer;
begin
  -- Fully recompute this month: clear it first so orgs that no longer qualify
  -- (e.g. rows manufactured by historically-dated FMV/invested before the org
  -- ever used the app) are removed on re-run, not just upserted over.
  delete from public.admin_org_metrics_monthly where month_start = ms;

  insert into public.admin_org_metrics_monthly (
    organization_id, organization_name, is_demo_org, month_start,
    cpm_total_contracts, cpm_active_vendors, cpm_tcv,
    inv_total_documents, inv_portfolio_companies, inv_fmv, inv_total_invested,
    computed_at
  )
  with
  -- Cumulative uploads through month ms, per module — matches the tile's
  -- admin_org_module_uploads_mv basis ("Uploaded").
  uploads as (
    select
      m.organization_id,
      coalesce(sum(m.uploaded) filter (where m.module = 'CPM'), 0)::int
        as cpm_uploaded,
      coalesce(sum(m.uploaded) filter (where m.module = 'Investor'), 0)::int
        as inv_uploaded
    from public.admin_org_module_monthly_mv m
    where m.month_start < (ms + interval '1 month')::date
    group by m.organization_id
  ),
  fee as (
    select v.contract_id as cid, sum(v.fees) as tcv
    from public.vendor_products_details v
    group by v.contract_id
  ),
  cpm as (
    select
      c.organization_id,
      count(distinct c.vendor_id) filter (
        where c.status = 'active' and c.vendor_id is not null
      )::int as active_vendors,
      coalesce(sum(fee.tcv) filter (
        where c.status_id >= 4
          and c.status_id <> 5
          and c.ai_extraction_status is distinct from 'h_failed'
      ), 0) as tcv
    from public.contracts c
    left join fee on fee.cid = c.id
    where c.organization_id is not null
      and c.is_duplicate is not true
      and c.created_at is not null
      and c.created_at < me
    group by c.organization_id
  ),
  inv_fmv as (
    select
      s.organization_id,
      coalesce(sum(s.our_fd_ownership_percent * s.implied_valuation), 0) as fmv
    from (
      select distinct on (snap.company_id)
        snap.organization_id,
        snap.company_id,
        snap.our_fd_ownership_percent,
        snap.implied_valuation
      from public.inv_cap_table_snapshot snap
      where snap.snapshot_date < me
      order by
        snap.company_id,
        snap.snapshot_date desc,
        (snap.financing_round_id is not null) desc,  -- prefer round-tied
        snap.id desc
    ) s
    group by s.organization_id
  ),
  inv_invested as (
    select
      t.organization_id,
      coalesce(- sum(t.amount), 0) as total_invested
    from public.inv_transaction t
    where t.transaction_date < me
      and t.transaction_type in (
        'purchase', 'exercise', 'secondary_purchase', 'issuance'
      )
    group by t.organization_id
  ),
  inv_companies as (
    select
      md.organization_id,
      count(distinct md.company_id)::int as portfolio_companies
    from public.module_documents md
    where md.module_id = 2          -- INVESTOR_MODULE_ID
      and md.is_deleted is not true
      and md.organization_id is not null
      and md.user_id is not null
      and md.company_id is not null
      and md.created_at < me
    group by md.organization_id
  )
  select
    o.id,
    o.name,
    coalesce(o.is_demo_org, false),
    ms,
    coalesce(u.cpm_uploaded, 0),
    coalesce(cpm.active_vendors, 0),
    coalesce(cpm.tcv, 0),
    coalesce(u.inv_uploaded, 0),
    coalesce(d.portfolio_companies, 0),
    -- FMV / invested are valuation/transaction-dated, so they exist long before
    -- the org adopts the Investor module. Suppress them until the org has real
    -- investor footprint (an uploaded investor doc / portfolio company) by M,
    -- so a CPM-only org-month doesn't carry phantom portfolio value.
    case
      when coalesce(u.inv_uploaded, 0) > 0 or coalesce(d.portfolio_companies, 0) > 0
      then coalesce(f.fmv, 0) else 0
    end,
    case
      when coalesce(u.inv_uploaded, 0) > 0 or coalesce(d.portfolio_companies, 0) > 0
      then coalesce(i.total_invested, 0) else 0
    end,
    now()
  from public.organizations o
  left join uploads      u on u.organization_id   = o.id
  left join cpm            on cpm.organization_id = o.id
  left join inv_fmv      f on f.organization_id   = o.id
  left join inv_invested i on i.organization_id   = o.id
  left join inv_companies d on d.organization_id  = o.id
  -- Anchor each org-month to real in-app activity, NOT to FMV/invested.
  -- FMV (cap-table snapshot_date) and total_invested (transaction_date) are
  -- historically dated — they predate when the org started using us — so
  -- gating on them backfills phantom pre-join months. Uploads, contracts, and
  -- portfolio documents are all created_at-dated (= app activity), so an org's
  -- series begins at its first upload; FMV/invested still ride along as the
  -- as-of stock value from that point on.
  where coalesce(o.is_demo_org, false) = false
    and (
         coalesce(u.cpm_uploaded, 0)        <> 0
      or coalesce(cpm.tcv, 0)               <> 0
      or coalesce(cpm.active_vendors, 0)    <> 0
      or coalesce(u.inv_uploaded, 0)        <> 0
      or coalesce(d.portfolio_companies, 0) <> 0
    );

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.admin_refresh_org_metrics_monthly(date) from public;
revoke all on function public.admin_refresh_org_metrics_monthly(date) from authenticated;
grant execute on function public.admin_refresh_org_metrics_monthly(date) to service_role;

-------------------------------------------------------------------------------
-- 3. Forward cron — keep the current + just-closed month fresh
-------------------------------------------------------------------------------
-- Only the current month's snapshot moves day to day; once a month closes it
-- is effectively frozen. We also refresh the previous month so late-arriving
-- data for the just-closed month is captured. Daily is ample for a monthly
-- snapshot. This is forward maintenance, NOT historical backfill.

do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'refresh-admin-org-metrics-monthly';
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end;
$$;

select cron.schedule(
  'refresh-admin-org-metrics-monthly',
  '20 6 * * *',
  $$
    select public.admin_refresh_org_metrics_monthly(current_date);
    select public.admin_refresh_org_metrics_monthly(
      (current_date - interval '1 month')::date
    );
  $$
);
