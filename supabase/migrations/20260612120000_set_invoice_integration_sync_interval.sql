UPDATE public.integration_connections
SET
    sync_interval_minutes = 120,
    updated_at = now()
WHERE provider IN ('xero', 'ramp')
  AND sync_interval_minutes = 30;
