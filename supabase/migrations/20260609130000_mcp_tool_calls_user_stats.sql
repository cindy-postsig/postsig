-- Per-user MCP tool-call rollup powering the "Users" panel on the admin
-- MCP-logs page. Mirrors the param signature of mcp_tool_calls_stats but
-- groups by user_id instead of tool_name, so the admin app can read both
-- aggregations with the same filter set.
--
-- Returns one row per user in the active filter window with the user's
-- most-active org in that window attached (so users that span orgs still
-- render a sensible row, instead of one-row-per-(user,org) noise).

CREATE OR REPLACE FUNCTION public.mcp_tool_calls_user_stats(
    p_date_from        timestamptz DEFAULT NULL,
    p_date_to          timestamptz DEFAULT NULL,
    p_user_id          uuid        DEFAULT NULL,
    p_organization_id  uuid        DEFAULT NULL,
    p_status           text        DEFAULT NULL,
    p_search           text        DEFAULT NULL,
    p_org_type         text        DEFAULT NULL
)
RETURNS TABLE (
    user_id              uuid,
    user_name            text,
    organization_id      uuid,
    organization_name    text,
    calls                bigint,
    error_count          bigint,
    distinct_tools       bigint,
    avg_duration_ms      numeric,
    total_request_bytes  bigint,
    total_response_bytes bigint,
    last_call_at         timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    WITH filtered AS (
        SELECT c.*
        FROM public.mcp_tool_calls c
        LEFT JOIN public.organizations o ON o.id = c.organization_id
        WHERE
            (p_date_from IS NULL       OR c.started_at      >= p_date_from)
            AND (p_date_to IS NULL     OR c.started_at      <= p_date_to)
            AND (p_user_id IS NULL     OR c.user_id          = p_user_id)
            AND (p_organization_id IS NULL OR c.organization_id = p_organization_id)
            AND (p_status IS NULL      OR c.status           = p_status)
            AND (p_search IS NULL      OR c.tool_name ILIKE '%' || p_search || '%')
            AND (
                p_org_type IS NULL OR p_org_type = 'all'
                OR (p_org_type = 'client' AND o.is_demo_org IS FALSE)
                OR (p_org_type = 'test'   AND o.is_demo_org IS TRUE)
            )
    ),
    ranked_org AS (
        SELECT
            f.user_id,
            f.organization_id,
            row_number() OVER (
                PARTITION BY f.user_id
                ORDER BY count(*) DESC, f.organization_id
            ) AS rn
        FROM filtered f
        GROUP BY f.user_id, f.organization_id
    )
    SELECT
        f.user_id,
        u.name                                              AS user_name,
        r.organization_id,
        o.name                                              AS organization_name,
        count(*)::bigint                                    AS calls,
        count(*) FILTER (WHERE f.status = 'error')::bigint  AS error_count,
        count(DISTINCT f.tool_name)::bigint                 AS distinct_tools,
        round(avg(f.duration_ms)::numeric, 2)               AS avg_duration_ms,
        sum(f.request_bytes)::bigint                        AS total_request_bytes,
        sum(f.response_bytes)::bigint                       AS total_response_bytes,
        max(f.started_at)                                   AS last_call_at
    FROM filtered f
    LEFT JOIN public.users u          ON u.id = f.user_id
    LEFT JOIN ranked_org r            ON r.user_id = f.user_id AND r.rn = 1
    LEFT JOIN public.organizations o  ON o.id = r.organization_id
    GROUP BY f.user_id, u.name, r.organization_id, o.name
    ORDER BY calls DESC;
$$;

-- Match the lockdown on the sibling stats/timeseries RPCs: SECURITY DEFINER
-- would otherwise bypass mcp_tool_calls RLS for any authenticated/anon caller.
REVOKE ALL ON FUNCTION public.mcp_tool_calls_user_stats(
    timestamptz, timestamptz, uuid, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_tool_calls_user_stats(
    timestamptz, timestamptz, uuid, uuid, text, text, text
) TO service_role;
