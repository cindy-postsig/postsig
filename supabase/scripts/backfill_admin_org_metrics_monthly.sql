-- Historical backfill for admin_org_metrics_monthly.
--
-- Run MANUALLY (e.g. Supabase SQL editor) — this is intentionally NOT a
-- migration. It replays the per-month refresh function over every month in
-- the chosen window, populating the historical snapshot rows the forward
-- cron does not produce.
--
-- Idempotent: re-running upserts (does not duplicate). Safe to re-run after
-- adjusting the start month or after corrections to source data.
--
-- Accuracy caveat: TCV and active-vendor history is best-effort before
-- ~2025-10. The audit_log only records contract archival (status active →
-- inactive) from around then; earlier inactivations are inferred from the
-- contract's term end / supersession / updated_at, so months before that
-- window may over-count contracts that were cancelled without one of those
-- signals. FMV and total_invested reconstruct exactly (cap-table snapshots
-- and the transaction ledger are point-in-time by date).
--
-- Adjust the start month below to the earliest month you want on the charts.

do $$
declare
  m date;
  start_month date := date '2023-01-01';   -- earliest month to backfill
  written integer;
begin
  for m in
    select generate_series(
      date_trunc('month', start_month),
      date_trunc('month', current_date),
      interval '1 month'
    )::date
  loop
    select public.admin_refresh_org_metrics_monthly(m) into written;
    raise notice 'admin_org_metrics_monthly: % → % rows', m, written;
  end loop;
end;
$$;
