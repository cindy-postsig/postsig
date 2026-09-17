-- Per-user, per-OAuth-client scope grants for MCP. Supabase's OAuth server
-- only validates standard OIDC scopes, so module-specific read/write live
-- here instead of in the issued JWT. The JWT is just an identity assertion
-- (sub + client_id); the grant row decides what that client is allowed to do.

CREATE TABLE IF NOT EXISTS public.mcp_oauth_grants (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Supabase oauth_clients.id (uuid). No FK because auth schema is owned by
    -- gotrue and can't be referenced from public without privilege escalation.
    client_id    uuid NOT NULL,
    module       text NOT NULL,
    scopes       text[] NOT NULL DEFAULT ARRAY[]::text[],
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    revoked_at   timestamptz,
    CONSTRAINT mcp_oauth_grants_module_check
        CHECK (module IN ('cpm', 'investor')),
    CONSTRAINT mcp_oauth_grants_unique_user_client_module
        UNIQUE (user_id, client_id, module)
);

CREATE INDEX IF NOT EXISTS mcp_oauth_grants_user_id_idx
    ON public.mcp_oauth_grants (user_id);

CREATE INDEX IF NOT EXISTS mcp_oauth_grants_client_id_idx
    ON public.mcp_oauth_grants (client_id);

ALTER TABLE public.mcp_oauth_grants ENABLE ROW LEVEL SECURITY;

-- Service role only. The validator runs as service role; user-facing reads
-- (for the future settings page) will go through a server action that
-- filters by auth.uid() server-side.
REVOKE ALL ON public.mcp_oauth_grants FROM anon, authenticated;
