ALTER TABLE public.integration_sync_logs
    ADD COLUMN IF NOT EXISTS details jsonb;
