-- Add a `module` discriminator to mcp_api_tokens so a token minted for one
-- MCP server (e.g. /api/cpm/mcp) cannot be replayed against another
-- (e.g. /api/investor/mcp). The route-specific auth resolver filters by
-- module, so tokens are now bound to the MCP endpoint they were issued for.

-- Add nullable first so the column can be backfilled before we lock it down.
ALTER TABLE public.mcp_api_tokens
    ADD COLUMN IF NOT EXISTS module text;

UPDATE public.mcp_api_tokens
    SET module = 'cpm'
    WHERE module IS NULL;

ALTER TABLE public.mcp_api_tokens
    ALTER COLUMN module SET NOT NULL;

-- No DEFAULT: every future insert must specify module explicitly so a
-- forgotten value fails loudly instead of silently landing in 'cpm'.
ALTER TABLE public.mcp_api_tokens
    ALTER COLUMN module DROP DEFAULT;

ALTER TABLE public.mcp_api_tokens
    DROP CONSTRAINT IF EXISTS mcp_api_tokens_module_check;

ALTER TABLE public.mcp_api_tokens
    ADD CONSTRAINT mcp_api_tokens_module_check
        CHECK (module IN ('cpm', 'investor'));
