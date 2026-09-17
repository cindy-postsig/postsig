-- Distinct-value views for the admin MCP-logs filter dropdowns.
-- Pushing DISTINCT to the DB avoids fetching every mcp_tool_calls row
-- just to dedupe in application code, which gets expensive as customer
-- LLM traffic ramps.

CREATE OR REPLACE VIEW public.mcp_distinct_tool_names AS
SELECT DISTINCT tool_name
FROM public.mcp_tool_calls
ORDER BY tool_name;

CREATE OR REPLACE VIEW public.mcp_distinct_orgs AS
SELECT DISTINCT
    o.id,
    o.name,
    o.is_demo_org
FROM public.mcp_tool_calls c
JOIN public.organizations o ON o.id = c.organization_id
ORDER BY o.name;

-- Force SECURITY INVOKER explicitly (default in PG 15+, future-proof) so
-- the views apply caller RLS against the underlying tables. Then lock
-- direct PostgREST access to service_role only — these views are admin
-- dropdowns, not user-facing.
ALTER VIEW public.mcp_distinct_tool_names SET (security_invoker = true);
ALTER VIEW public.mcp_distinct_orgs        SET (security_invoker = true);

REVOKE ALL ON public.mcp_distinct_tool_names FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.mcp_distinct_orgs        FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mcp_distinct_tool_names TO service_role;
GRANT SELECT ON public.mcp_distinct_orgs        TO service_role;
