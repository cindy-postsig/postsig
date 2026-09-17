UPDATE public.integration_connections
SET
    sync_interval_minutes = 60,
    updated_at = now()
WHERE provider = 'docusign'
  AND sync_interval_minutes = 15;
