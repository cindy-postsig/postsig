-- Per-invocation telemetry for the MCP server. One row per tool call.
-- Used for billing rollups (org/token), quality monitoring (status, samples),
-- and deriving `last used` for the API-tokens UI without writing back to
-- mcp_api_tokens on every request.
--
-- No audit trigger here on purpose: this table IS the usage record for tool
-- calls, and a row-level audit of every INSERT would double write volume
-- while adding zero compliance signal. Inserts are append-only via the
-- service role; the table is otherwise immutable.

CREATE TABLE IF NOT EXISTS public.mcp_tool_calls (
    id              bigserial PRIMARY KEY,
    started_at      timestamptz NOT NULL DEFAULT now(),
    duration_ms     integer NOT NULL,
    user_id         uuid NOT NULL,
    organization_id uuid NOT NULL,
    token_id        uuid,
    tool_name       text NOT NULL,
    scope           text,
    status          text NOT NULL,
    error_code      text,
    request_bytes   integer NOT NULL,
    response_bytes  integer NOT NULL,
    input_sample    jsonb,
    output_sample   jsonb,
    CONSTRAINT mcp_tool_calls_status_check
        CHECK (status IN ('success', 'error')),
    CONSTRAINT mcp_tool_calls_scope_check
        CHECK (scope IS NULL OR scope IN ('read', 'write'))
);

ALTER TABLE public.mcp_tool_calls
    ADD CONSTRAINT mcp_tool_calls_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.mcp_tool_calls
    ADD CONSTRAINT mcp_tool_calls_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.mcp_tool_calls
    ADD CONSTRAINT mcp_tool_calls_token_id_fkey
    FOREIGN KEY (token_id) REFERENCES public.mcp_api_tokens(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS mcp_tool_calls_org_started_at_idx
    ON public.mcp_tool_calls (organization_id, started_at DESC);

CREATE INDEX IF NOT EXISTS mcp_tool_calls_token_started_at_idx
    ON public.mcp_tool_calls (token_id, started_at DESC);

CREATE INDEX IF NOT EXISTS mcp_tool_calls_user_started_at_idx
    ON public.mcp_tool_calls (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS mcp_tool_calls_tool_started_at_idx
    ON public.mcp_tool_calls (tool_name, started_at DESC);

ALTER TABLE public.mcp_tool_calls ENABLE ROW LEVEL SECURITY;

-- Users see their own calls; org admins (role 12) see everything in their org.
CREATE POLICY "mcp_tool_calls_select" ON public.mcp_tool_calls
    FOR SELECT
    TO authenticated
    USING (
        organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
        AND (
            user_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM user_roles2 ur
                WHERE ur.user_id = auth.uid() AND ur.role_id = 12
            )
        )
    );

-- Service role inserts; no client-side inserts.
CREATE POLICY "mcp_tool_calls_insert" ON public.mcp_tool_calls
    FOR INSERT
    TO public
    WITH CHECK (
        ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role') = 'service_role'
    );

-- Telemetry is immutable.
CREATE POLICY "mcp_tool_calls_no_update" ON public.mcp_tool_calls
    FOR UPDATE
    TO public
    USING (false);

CREATE POLICY "mcp_tool_calls_no_delete" ON public.mcp_tool_calls
    FOR DELETE
    TO public
    USING (false);

CREATE POLICY "mcp_tool_calls_anon_deny" ON public.mcp_tool_calls
    FOR ALL
    TO anon
    USING (false);

-- last_used_at on mcp_api_tokens is now derived from this table.
-- See app/lib/mcp/auth.ts: the per-request UPDATE has been removed.
ALTER TABLE public.mcp_api_tokens DROP COLUMN IF EXISTS last_used_at;
