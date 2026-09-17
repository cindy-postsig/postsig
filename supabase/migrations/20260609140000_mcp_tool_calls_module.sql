-- Adds `module` to mcp_tool_calls so each call is attributed to its MCP
-- server (CPM vs Investor) and the admin UI can filter on it. Existing
-- rows stay NULL (we'll backfill from organization/tool patterns if/when
-- needed). All three aggregation RPCs gain a matching `p_module` filter
-- so the dashboard, all-calls table, and per-user rollup share semantics.

ALTER TABLE public.mcp_tool_calls
    ADD COLUMN IF NOT EXISTS module text;

ALTER TABLE public.mcp_tool_calls
    DROP CONSTRAINT IF EXISTS mcp_tool_calls_module_check;
ALTER TABLE public.mcp_tool_calls
    ADD CONSTRAINT mcp_tool_calls_module_check
    CHECK (module IS NULL OR module IN ('cpm', 'investor'));

-- Filter dropdowns are quick, but stats roll-ups scan by (module,
-- started_at). Index covers both standalone module filtering and
-- module+time-window queries without a separate partial index.
CREATE INDEX IF NOT EXISTS mcp_tool_calls_module_started_at_idx
    ON public.mcp_tool_calls (module, started_at DESC);

-- DROP + CREATE because we're widening the signature with p_module.
-- CREATE OR REPLACE FUNCTION can't change argument lists.
DROP FUNCTION IF EXISTS public.mcp_tool_calls_stats(
    timestamptz, timestamptz, uuid, uuid, text, text, text
);

CREATE FUNCTION public.mcp_tool_calls_stats(
    p_date_from        timestamptz DEFAULT NULL,
    p_date_to          timestamptz DEFAULT NULL,
    p_user_id          uuid        DEFAULT NULL,
    p_organization_id  uuid        DEFAULT NULL,
    p_status           text        DEFAULT NULL,
    p_search           text        DEFAULT NULL,
    p_org_type         text        DEFAULT NULL,
    p_module           text        DEFAULT NULL
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
        AND (p_module IS NULL      OR c.module           = p_module)
        AND (
            p_org_type IS NULL OR p_org_type = 'all'
            OR (p_org_type = 'client' AND o.is_demo_org IS FALSE)
            OR (p_org_type = 'test'   AND o.is_demo_org IS TRUE)
        )
    GROUP BY c.tool_name
    ORDER BY calls DESC;
$$;

DROP FUNCTION IF EXISTS public.mcp_tool_calls_timeseries(
    timestamptz, timestamptz, uuid, uuid, text, text, text
);

CREATE FUNCTION public.mcp_tool_calls_timeseries(
    p_date_from        timestamptz DEFAULT NULL,
    p_date_to          timestamptz DEFAULT NULL,
    p_user_id          uuid        DEFAULT NULL,
    p_organization_id  uuid        DEFAULT NULL,
    p_status           text        DEFAULT NULL,
    p_tool_name        text        DEFAULT NULL,
    p_org_type         text        DEFAULT NULL,
    p_module           text        DEFAULT NULL
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
        AND (p_module IS NULL      OR c.module           = p_module)
        AND (
            p_org_type IS NULL OR p_org_type = 'all'
            OR (p_org_type = 'client' AND o.is_demo_org IS FALSE)
            OR (p_org_type = 'test'   AND o.is_demo_org IS TRUE)
        )
    GROUP BY day
    ORDER BY day;
$$;

DROP FUNCTION IF EXISTS public.mcp_tool_calls_user_stats(
    timestamptz, timestamptz, uuid, uuid, text, text, text
);

CREATE FUNCTION public.mcp_tool_calls_user_stats(
    p_date_from        timestamptz DEFAULT NULL,
    p_date_to          timestamptz DEFAULT NULL,
    p_user_id          uuid        DEFAULT NULL,
    p_organization_id  uuid        DEFAULT NULL,
    p_status           text        DEFAULT NULL,
    p_search           text        DEFAULT NULL,
    p_org_type         text        DEFAULT NULL,
    p_module           text        DEFAULT NULL
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
            AND (p_module IS NULL      OR c.module           = p_module)
            AND (
                p_org_type IS NULL OR p_org_type = 'all'
                OR (p_org_type = 'client' AND COALESCE(o.is_demo_org, false) = false)
                OR (p_org_type = 'test'   AND COALESCE(o.is_demo_org, false) = true)
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

-- Re-lock all three to service_role: SECURITY DEFINER bypasses RLS.
REVOKE ALL ON FUNCTION public.mcp_tool_calls_stats(
    timestamptz, timestamptz, uuid, uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_tool_calls_stats(
    timestamptz, timestamptz, uuid, uuid, text, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.mcp_tool_calls_timeseries(
    timestamptz, timestamptz, uuid, uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_tool_calls_timeseries(
    timestamptz, timestamptz, uuid, uuid, text, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.mcp_tool_calls_user_stats(
    timestamptz, timestamptz, uuid, uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_tool_calls_user_stats(
    timestamptz, timestamptz, uuid, uuid, text, text, text, text
) TO service_role;
