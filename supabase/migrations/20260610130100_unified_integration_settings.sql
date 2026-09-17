-- Unify integration settings/status for DocuSign, Xero, and Ramp.

ALTER TABLE public.integration_connections
    ALTER COLUMN nango_connection_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS auth_provider text NOT NULL DEFAULT 'nango',
    ADD COLUMN IF NOT EXISTS provider_account_id text,
    ADD COLUMN IF NOT EXISTS account_name text,
    ADD COLUMN IF NOT EXISTS health_status text NOT NULL DEFAULT 'healthy',
    ADD COLUMN IF NOT EXISTS health_reason text,
    ADD COLUMN IF NOT EXISTS health_detected_at timestamptz,
    ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
    ADD COLUMN IF NOT EXISTS last_successful_sync_at timestamptz,
    ADD COLUMN IF NOT EXISTS last_failed_sync_at timestamptz,
    ADD COLUMN IF NOT EXISTS sync_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS sync_interval_minutes integer NOT NULL DEFAULT 120,
    ADD COLUMN IF NOT EXISTS import_new_invoices boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS track_unpaid_invoices boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS ingest_completed_envelopes boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS track_in_progress_envelopes boolean NOT NULL DEFAULT false;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'integration_connections_auth_provider_check'
    ) THEN
        ALTER TABLE public.integration_connections
            ADD CONSTRAINT integration_connections_auth_provider_check
            CHECK (auth_provider IN ('nango', 'native_oauth'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'integration_connections_health_status_check'
    ) THEN
        ALTER TABLE public.integration_connections
            ADD CONSTRAINT integration_connections_health_status_check
            CHECK (health_status IN ('healthy', 'needs_reconnect', 'disconnected'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'integration_connections_sync_interval_check'
    ) THEN
        ALTER TABLE public.integration_connections
            ADD CONSTRAINT integration_connections_sync_interval_check
            CHECK (sync_interval_minutes > 0);
    END IF;
END $$;

UPDATE public.integration_connections
SET
    auth_provider = CASE
        WHEN provider = 'docusign' THEN 'native_oauth'
        ELSE 'nango'
    END,
    health_status = CASE
        WHEN status = 'connected' THEN 'healthy'
        ELSE 'disconnected'
    END,
    health_reason = CASE
        WHEN status = 'connected' THEN NULL
        ELSE COALESCE(health_reason, 'Disconnected')
    END,
    health_detected_at = CASE
        WHEN status = 'connected' THEN NULL
        ELSE COALESCE(health_detected_at, disconnected_at, updated_at)
    END,
    sync_interval_minutes = CASE
        WHEN provider = 'docusign' THEN 15
        ELSE 120
    END;

INSERT INTO public.integration_connections (
    organization_id,
    user_id,
    provider,
    nango_connection_id,
    auth_provider,
    provider_account_id,
    account_name,
    status,
    health_status,
    connected_at,
    disconnected_at,
    sync_enabled,
    sync_interval_minutes,
    ingest_completed_envelopes,
    track_in_progress_envelopes,
    created_at,
    updated_at
)
SELECT
    u.organization_id,
    u.id,
    'docusign'::public.integration_provider,
    NULL,
    'native_oauth',
    u.docusign_account_id,
    NULL,
    CASE WHEN COALESCE(u.docusign_connected, false) THEN 'connected' ELSE 'disconnected' END,
    CASE WHEN COALESCE(u.docusign_connected, false) THEN 'healthy' ELSE 'disconnected' END,
    CASE WHEN COALESCE(u.docusign_connected, false) THEN COALESCE(u.updated_at, now()) ELSE NULL END,
    CASE WHEN COALESCE(u.docusign_connected, false) THEN NULL ELSE COALESCE(u.updated_at, now()) END,
    true,
    15,
    true,
    false,
    now(),
    now()
FROM public.users u
WHERE u.docusign_account_id IS NOT NULL
ON CONFLICT (user_id, provider)
DO UPDATE SET
    provider_account_id = EXCLUDED.provider_account_id,
    auth_provider = 'native_oauth',
    status = EXCLUDED.status,
    health_status = EXCLUDED.health_status,
    connected_at = COALESCE(public.integration_connections.connected_at, EXCLUDED.connected_at),
    disconnected_at = EXCLUDED.disconnected_at,
    sync_interval_minutes = 15,
    updated_at = now();

CREATE INDEX IF NOT EXISTS integration_connections_user_status_idx
    ON public.integration_connections USING btree (user_id, status);

CREATE INDEX IF NOT EXISTS integration_connections_user_health_idx
    ON public.integration_connections USING btree (user_id, health_status);
