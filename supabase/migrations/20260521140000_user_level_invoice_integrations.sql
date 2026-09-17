-- Move Nango invoice integrations from one connection per organization to one
-- connection per eligible user and provider.

UPDATE public.integration_connections
SET
    status = 'disconnected',
    disconnected_at = COALESCE(disconnected_at, now()),
    updated_at = now()
WHERE status = 'connected';

DROP INDEX IF EXISTS public.integration_connections_org_provider_unique;

CREATE UNIQUE INDEX integration_connections_user_provider_unique
    ON public.integration_connections USING btree (user_id, provider);

ALTER TABLE public.contracts
    ADD COLUMN external_integration_connection_id uuid;

ALTER TABLE public.contracts
    ADD CONSTRAINT contracts_external_integration_connection_id_fkey
    FOREIGN KEY (external_integration_connection_id)
    REFERENCES public.integration_connections(id)
    ON DELETE SET NULL
    NOT VALID;

ALTER TABLE public.contracts
    VALIDATE CONSTRAINT contracts_external_integration_connection_id_fkey;

CREATE INDEX contracts_external_integration_connection_id_idx
    ON public.contracts USING btree (external_integration_connection_id)
    WHERE external_integration_connection_id IS NOT NULL;

ALTER TABLE public.contract_versions
    ADD COLUMN external_integration_connection_id uuid;

ALTER TABLE public.integration_sync_logs
    ADD COLUMN user_id uuid,
    ADD COLUMN integration_connection_id uuid;

ALTER TABLE public.integration_sync_logs
    ADD CONSTRAINT integration_sync_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) NOT VALID;

ALTER TABLE public.integration_sync_logs
    VALIDATE CONSTRAINT integration_sync_logs_user_id_fkey;

ALTER TABLE public.integration_sync_logs
    ADD CONSTRAINT integration_sync_logs_integration_connection_id_fkey
    FOREIGN KEY (integration_connection_id)
    REFERENCES public.integration_connections(id)
    ON DELETE SET NULL
    NOT VALID;

ALTER TABLE public.integration_sync_logs
    VALIDATE CONSTRAINT integration_sync_logs_integration_connection_id_fkey;

CREATE INDEX integration_sync_logs_user_id_idx
    ON public.integration_sync_logs USING btree (user_id);

CREATE INDEX integration_sync_logs_connection_id_idx
    ON public.integration_sync_logs USING btree (integration_connection_id);

DROP POLICY IF EXISTS "integration_connections_select"
    ON public.integration_connections;
DROP POLICY IF EXISTS "integration_connections_insert"
    ON public.integration_connections;
DROP POLICY IF EXISTS "integration_connections_update"
    ON public.integration_connections;
DROP POLICY IF EXISTS "integration_connections_delete"
    ON public.integration_connections;

-- Roles 11 and 12 are the client manager/admin roles already used for
-- integration sync log access in this schema.
CREATE POLICY "integration_connections_select" ON public.integration_connections
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = ANY(ARRAY[11, 12])
        )
    );

CREATE POLICY "integration_connections_insert" ON public.integration_connections
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND organization_id IN (
            SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM public.user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = ANY(ARRAY[11, 12])
        )
    );

CREATE POLICY "integration_connections_update" ON public.integration_connections
    FOR UPDATE TO authenticated
    USING (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = ANY(ARRAY[11, 12])
        )
    )
    WITH CHECK (
        user_id = auth.uid()
        AND organization_id IN (
            SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM public.user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = ANY(ARRAY[11, 12])
        )
    );

CREATE POLICY "integration_connections_delete" ON public.integration_connections
    FOR DELETE TO authenticated
    USING (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = ANY(ARRAY[11, 12])
        )
    );

-- Admins (role 12) can read all connections in their org (e.g., for an admin dashboard).
DROP POLICY IF EXISTS "integration_connections_admin_select"
    ON public.integration_connections;

CREATE POLICY "integration_connections_admin_select" ON public.integration_connections
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM public.user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = 12
        )
    );

-- Ensure anon users are still denied.
DROP POLICY IF EXISTS "integration_connections_anon_deny"
    ON public.integration_connections;

CREATE POLICY "integration_connections_anon_deny" ON public.integration_connections
    FOR ALL TO anon
    USING (false);
