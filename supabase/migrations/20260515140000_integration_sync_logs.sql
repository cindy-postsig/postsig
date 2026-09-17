-- integration_sync_logs table
CREATE TABLE "public"."integration_sync_logs" (
    "id" bigserial NOT NULL,
    "organization_id" uuid NOT NULL,
    "provider" integration_provider NOT NULL,
    "sync_type" text NOT NULL CHECK (sync_type IN ('inbound', 'outbound')),
    "status" text NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
    "records_processed" integer NOT NULL DEFAULT 0,
    "error_details" jsonb,
    "started_at" timestamptz NOT NULL DEFAULT now(),
    "completed_at" timestamptz,
    "created_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "public"."integration_sync_logs" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX integration_sync_logs_pkey ON public.integration_sync_logs USING btree (id);
CREATE INDEX integration_sync_logs_org_idx ON public.integration_sync_logs USING btree (organization_id);
CREATE INDEX integration_sync_logs_provider_idx ON public.integration_sync_logs USING btree (provider);
CREATE INDEX integration_sync_logs_started_at_idx ON public.integration_sync_logs USING btree (started_at DESC);

ALTER TABLE "public"."integration_sync_logs"
    ADD CONSTRAINT "integration_sync_logs_pkey" PRIMARY KEY USING INDEX "integration_sync_logs_pkey";

ALTER TABLE "public"."integration_sync_logs"
    ADD CONSTRAINT "integration_sync_logs_organization_id_fkey"
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE "public"."integration_sync_logs" VALIDATE CONSTRAINT "integration_sync_logs_organization_id_fkey";

-- RLS: admins and managers can read logs for their org
CREATE POLICY "integration_sync_logs_select" ON "public"."integration_sync_logs"
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = ANY(ARRAY[11, 12])
        )
    );

-- Deny anon
CREATE POLICY "integration_sync_logs_anon_deny" ON "public"."integration_sync_logs"
    FOR ALL TO anon
    USING (false);
