-- Extend retention of noisy integration sync logs from 3 days to 7 days.

create or replace function public.cleanup_noisy_integration_sync_logs()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.integration_sync_logs
  where created_at < now() - interval '7 days'
    and coalesce(details->>'event', '') not in (
      'external_invoice_status_changed',
      'invoice_status_updated'
    );
end;
$$;
