-- MCP API tokens for the Model Context Protocol server.
-- Each token authenticates a single user and carries scopes ('read', 'write').
-- Token plaintext is never stored; we keep a SHA-256 hash and a short prefix
-- for identification.

CREATE TABLE IF NOT EXISTS public.mcp_api_tokens (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name            text NOT NULL,
    token_hash      text NOT NULL UNIQUE,
    token_prefix    text NOT NULL,
    scopes          text[] NOT NULL DEFAULT ARRAY['read']::text[],
    created_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz,
    last_used_at    timestamptz,
    revoked_at      timestamptz,
    CONSTRAINT mcp_api_tokens_scopes_check
        CHECK (scopes <@ ARRAY['read', 'write']::text[] AND cardinality(scopes) >= 1)
);

CREATE INDEX IF NOT EXISTS mcp_api_tokens_user_id_idx
    ON public.mcp_api_tokens (user_id);

CREATE INDEX IF NOT EXISTS mcp_api_tokens_organization_id_idx
    ON public.mcp_api_tokens (organization_id);

CREATE INDEX IF NOT EXISTS mcp_api_tokens_token_hash_idx
    ON public.mcp_api_tokens (token_hash)
    WHERE revoked_at IS NULL;

ALTER TABLE public.mcp_api_tokens ENABLE ROW LEVEL SECURITY;

-- Users can see their own tokens within their organization.
CREATE POLICY "mcp_api_tokens_select" ON public.mcp_api_tokens
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        AND organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
    );

-- Users mint and revoke their own tokens.
CREATE POLICY "mcp_api_tokens_insert" ON public.mcp_api_tokens
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
    );

-- UPDATE also pins organization_id to the caller's org. Without this a user
-- could change their own token's organization_id to another org's UUID; the
-- application-layer check would catch a stale token at use time, but RLS
-- should reject the mutation regardless (defense in depth).
CREATE POLICY "mcp_api_tokens_update" ON public.mcp_api_tokens
    FOR UPDATE
    TO authenticated
    USING (
        user_id = auth.uid()
        AND organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
    )
    WITH CHECK (
        user_id = auth.uid()
        AND organization_id IN (
            SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
        )
    );

CREATE POLICY "mcp_api_tokens_delete" ON public.mcp_api_tokens
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "mcp_api_tokens_anon_deny" ON public.mcp_api_tokens
    FOR ALL
    TO anon
    USING (false);

CREATE TRIGGER audit_mcp_api_tokens_trigger
    AFTER INSERT OR DELETE OR UPDATE
    ON public.mcp_api_tokens
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();
