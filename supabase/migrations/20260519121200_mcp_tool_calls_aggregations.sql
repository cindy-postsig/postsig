-- Aggregation functions powering the admin MCP-logs page:
--   - mcp_tool_calls_stats:      per-tool roll-up (calls, errors, avg/total bytes, avg duration)
--   - mcp_tool_calls_timeseries: per-day roll-up for the chart
--
-- These are SQL functions (RPCs), not views or materialized views. The filters
-- are user-supplied on every page interaction, so caching aggregates wouldn't
-- help; the cost lives in the GROUP BY scan over the indexed source table.
-- If/when volume justifies it, add a nightly-refreshed daily MV and point the
-- timeseries action at it instead.
--
-- org_type follows the admin_activity_logs convention:
--   'client' → organizations.is_demo_org = false
--   'test'   → organizations.is_demo_org = true
--   'all' or NULL → no filter

CREATE OR REPLACE FUNCTION public.mcp_tool_calls_stats(
    p_date_from        timestamptz DEFAULT NULL,
    p_date_to          timestamptz DEFAULT NULL,
    p_user_id          uuid        DEFAULT NULL,
    p_organization_id  uuid        DEFAULT NULL,
    p_status           text        DEFAULT NULL,
    p_search           text        DEFAULT NULL,
    p_org_type         text        DEFAULT NULL
)
RETURNS TABLE (
    tool_name            text,
    calls                bigint,
    error_count          bigint,
    avg_duration_ms      numeric,
    avg_request_bytes    numeric,
    avg_response_bytes   numeric,
    total_response_bytes bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT
        c.tool_name,
        count(*)::bigint                                  AS calls,
        count(*) FILTER (WHERE c.status = 'error')::bigint AS error_count,
        round(avg(c.duration_ms)::numeric, 2)             AS avg_duration_ms,
        round(avg(c.request_bytes)::numeric, 2)           AS avg_request_bytes,
        round(avg(c.response_bytes)::numeric, 2)          AS avg_response_bytes,
        sum(c.response_bytes)::bigint                     AS total_response_bytes
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
            OR (p_org_type = 'client' AND COALESCE(o.is_demo_org, false) = false)
            OR (p_org_type = 'test'   AND COALESCE(o.is_demo_org, false) = true)
        )
    GROUP BY c.tool_name
    ORDER BY calls DESC;
$$;

CREATE OR REPLACE FUNCTION public.mcp_tool_calls_timeseries(
    p_date_from        timestamptz DEFAULT NULL,
    p_date_to          timestamptz DEFAULT NULL,
    p_user_id          uuid        DEFAULT NULL,
    p_organization_id  uuid        DEFAULT NULL,
    p_status           text        DEFAULT NULL,
    p_tool_name        text        DEFAULT NULL,
    p_org_type         text        DEFAULT NULL
)
RETURNS TABLE (
    day          date,
    calls        bigint,
    error_count  bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT
        date_trunc('day', c.started_at AT TIME ZONE 'UTC')::date AS day,
        count(*)::bigint                                   AS calls,
        count(*) FILTER (WHERE c.status = 'error')::bigint AS error_count
    FROM public.mcp_tool_calls c
    LEFT JOIN public.organizations o ON o.id = c.organization_id
    WHERE
        (p_date_from IS NULL       OR c.started_at      >= p_date_from)
        AND (p_date_to IS NULL     OR c.started_at      <= p_date_to)
        AND (p_user_id IS NULL     OR c.user_id          = p_user_id)
        AND (p_organization_id IS NULL OR c.organization_id = p_organization_id)
        AND (p_status IS NULL      OR c.status           = p_status)
        AND (p_tool_name IS NULL   OR c.tool_name        = p_tool_name)
        AND (
            p_org_type IS NULL OR p_org_type = 'all'
            OR (p_org_type = 'client' AND COALESCE(o.is_demo_org, false) = false)
            OR (p_org_type = 'test'   AND COALESCE(o.is_demo_org, false) = true)
        )
    GROUP BY day
    ORDER BY day;
$$;

-- Lock both RPCs to service_role. They are SECURITY DEFINER and would
-- otherwise bypass mcp_tool_calls RLS for any authenticated/anon caller.
REVOKE ALL ON FUNCTION public.mcp_tool_calls_stats(
    timestamptz, timestamptz, uuid, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_tool_calls_stats(
    timestamptz, timestamptz, uuid, uuid, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.mcp_tool_calls_timeseries(
    timestamptz, timestamptz, uuid, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_tool_calls_timeseries(
    timestamptz, timestamptz, uuid, uuid, text, text, text
) TO service_role;
