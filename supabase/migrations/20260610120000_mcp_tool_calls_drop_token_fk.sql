-- mcp_tool_calls.token_id stores either an mcp_api_tokens.id (PAT auth) or
-- an mcp_oauth_grants.id (OAuth auth, Claude.ai etc). OAuth grant IDs
-- aren't rows in mcp_api_tokens, so the FK rejected every
-- OAuth-authenticated telemetry insert since OAuth shipped. Drop the FK;
-- add a `token_source` discriminator so admin filters / per-source rollups
-- don't have to guess from token_id shape.
--
-- Side effect of dropping the FK: ON DELETE SET NULL no longer fires when
-- a PAT is deleted. For an append-only audit table that's intentional —
-- historical attribution beats a nulled-out token_id.

ALTER TABLE public.mcp_tool_calls
    DROP CONSTRAINT IF EXISTS mcp_tool_calls_token_id_fkey;

ALTER TABLE public.mcp_tool_calls
    ADD COLUMN IF NOT EXISTS token_source text;

ALTER TABLE public.mcp_tool_calls
    DROP CONSTRAINT IF EXISTS mcp_tool_calls_token_source_check;
ALTER TABLE public.mcp_tool_calls
    ADD CONSTRAINT mcp_tool_calls_token_source_check
    CHECK (token_source IS NULL OR token_source IN ('pat', 'oauth', 'chat'));
