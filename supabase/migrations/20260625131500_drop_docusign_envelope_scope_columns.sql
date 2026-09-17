ALTER TABLE public.integration_connections
    DROP COLUMN IF EXISTS ingest_completed_envelopes,
    DROP COLUMN IF EXISTS track_in_progress_envelopes;
