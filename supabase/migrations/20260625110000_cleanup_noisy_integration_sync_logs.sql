-- Remove noisy integration sync logs while preserving rows used for contract
-- audit history.

create or replace function public.cleanup_noisy_integration_sync_logs()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.integration_sync_logs
  where created_at < now() - interval '3 days'
    and coalesce(details->>'event', '') not in (
      'external_invoice_status_changed',
      'invoice_status_updated'
    );
end;
$$;

revoke all on function public.cleanup_noisy_integration_sync_logs() from public;
revoke all on function public.cleanup_noisy_integration_sync_logs() from authenticated;
grant execute on function public.cleanup_noisy_integration_sync_logs() to service_role;

-- Idempotent: unschedule any existing job with the same name before creating it.
do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
  from cron.job
  where jobname = 'cleanup-noisy-integration-sync-logs';

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end;
$$;

-- Daily at 03:15 UTC. This keeps recent operational sync history for the UI
-- while preserving audit-significant rows indefinitely.
select cron.schedule(
  'cleanup-noisy-integration-sync-logs',
  '15 3 * * *',
  $$select public.cleanup_noisy_integration_sync_logs();$$
);
