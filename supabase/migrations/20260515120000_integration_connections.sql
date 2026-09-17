-- Create integration provider enum
CREATE TYPE "public"."integration_provider" AS ENUM ('xero', 'ramp');

-- Create integration_connections table
CREATE TABLE "public"."integration_connections" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "provider" integration_provider NOT NULL,
    "nango_connection_id" text NOT NULL,
    "status" text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected')),
    "connected_at" timestamptz,
    "disconnected_at" timestamptz,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "public"."integration_connections" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX integration_connections_pkey ON public.integration_connections USING btree (id);
CREATE UNIQUE INDEX integration_connections_org_provider_unique ON public.integration_connections USING btree (organization_id, provider);
CREATE INDEX integration_connections_organization_id_idx ON public.integration_connections USING btree (organization_id);
CREATE INDEX integration_connections_user_id_idx ON public.integration_connections USING btree (user_id);

ALTER TABLE "public"."integration_connections" ADD CONSTRAINT "integration_connections_pkey" PRIMARY KEY USING INDEX "integration_connections_pkey";

ALTER TABLE "public"."integration_connections"
    ADD CONSTRAINT "integration_connections_organization_id_fkey"
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE "public"."integration_connections" VALIDATE CONSTRAINT "integration_connections_organization_id_fkey";

ALTER TABLE "public"."integration_connections"
    ADD CONSTRAINT "integration_connections_user_id_fkey"
    FOREIGN KEY (user_id) REFERENCES auth.users(id) NOT VALID;
ALTER TABLE "public"."integration_connections" VALIDATE CONSTRAINT "integration_connections_user_id_fkey";

-- RLS: SELECT — all org members can read
CREATE POLICY "integration_connections_select" ON "public"."integration_connections"
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
    );

-- RLS: INSERT — admin only
CREATE POLICY "integration_connections_insert" ON "public"."integration_connections"
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = 12
        )
    );

-- RLS: UPDATE — admin only
CREATE POLICY "integration_connections_update" ON "public"."integration_connections"
    FOR UPDATE TO authenticated
    USING (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = 12
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = 12
        )
    );

-- RLS: DELETE — admin only
CREATE POLICY "integration_connections_delete" ON "public"."integration_connections"
    FOR DELETE TO authenticated
    USING (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = 12
        )
    );

-- Deny anon
CREATE POLICY "integration_connections_anon_deny" ON "public"."integration_connections"
    FOR ALL TO anon
    USING (false);

-- updated_at trigger
CREATE TRIGGER update_integration_connections_updated_at
    BEFORE UPDATE ON public.integration_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Audit trigger
CREATE TRIGGER audit_integration_connections_trigger
    AFTER INSERT OR DELETE OR UPDATE ON public.integration_connections
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
