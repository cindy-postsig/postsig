-- Fix investor_portfolio_metrics view to preserve security_id and avoid misassociation
-- The previous implementation dropped security_id in position_totals and rejoined
-- investor_security using entity_id + series_name which can match multiple securities.
-- This fix preserves security_id through the CTE and joins directly to latest_terms.

DROP VIEW IF EXISTS public.investor_portfolio_metrics;

CREATE OR REPLACE VIEW public.investor_portfolio_metrics AS
WITH position_totals AS (
    SELECT
        ipl.party_id,
        ip.organization_id,
        ip.name AS party_name,
        ipl.security_id,
        isec.entity_id,
        me.name AS entity_name,
        isec.security_type,
        isec.series_name,
        SUM(ipl.units) AS total_units,
        SUM(ipl.total_cost) AS aggregate_cost,
        MIN(ipl.acquired_date) AS first_acquired_date,
        MAX(ipl.acquired_date) AS last_acquired_date,
        ipl.currency
    FROM investor_position_lot ipl
    JOIN investor_party ip ON ip.id = ipl.party_id
    JOIN investor_security isec ON isec.id = ipl.security_id
    JOIN module_entities me ON me.id = isec.entity_id
    GROUP BY
        ipl.party_id,
        ip.organization_id,
        ip.name,
        ipl.security_id,
        isec.entity_id,
        me.name,
        isec.security_type,
        isec.series_name,
        ipl.currency
),
entity_totals AS (
    SELECT
        entity_id,
        SUM(total_units) AS fully_diluted_total
    FROM position_totals
    GROUP BY entity_id
),
latest_terms AS (
    SELECT DISTINCT ON (security_id)
        security_id,
        original_issue_price
    FROM investor_security_terms_version
    ORDER BY security_id, effective_date DESC NULLS LAST, created_at DESC
),
latest_closing AS (
    SELECT DISTINCT ON (ife.entity_id)
        ife.entity_id,
        ic.post_money_valuation,
        ic.close_date AS last_transaction_date
    FROM investor_closing ic
    JOIN investor_financing_event ife ON ife.id = ic.event_id
    ORDER BY ife.entity_id, ic.close_date DESC NULLS LAST, ic.created_at DESC
)
SELECT
    pt.party_id,
    pt.organization_id,
    pt.party_name,
    pt.security_id,
    pt.entity_id,
    pt.entity_name,
    pt.security_type,
    pt.series_name,
    pt.total_units,
    pt.aggregate_cost,
    pt.first_acquired_date,
    pt.last_acquired_date,
    pt.currency,
    et.fully_diluted_total,
    CASE
        WHEN et.fully_diluted_total > 0
        THEN (pt.total_units / et.fully_diluted_total) * 100
        ELSE 0
    END AS fully_diluted_percent,
    lt.original_issue_price AS current_price_per_unit,
    pt.total_units * COALESCE(lt.original_issue_price, 0) AS implied_value,
    CASE
        WHEN pt.aggregate_cost > 0
        THEN (pt.total_units * COALESCE(lt.original_issue_price, 0)) / pt.aggregate_cost
        ELSE 0
    END AS multiple,
    lc.post_money_valuation,
    lc.last_transaction_date
FROM position_totals pt
LEFT JOIN entity_totals et ON et.entity_id = pt.entity_id
LEFT JOIN latest_terms lt ON lt.security_id = pt.security_id
LEFT JOIN latest_closing lc ON lc.entity_id = pt.entity_id;

COMMENT ON VIEW public.investor_portfolio_metrics IS 'Aggregated portfolio metrics per party per entity per security (grouped by security_id for unique matching)';

-- Enable security_invoker so RLS on underlying tables is enforced for the querying user
-- Without this, the view would run with the view owner's privileges, potentially bypassing RLS
ALTER VIEW public.investor_portfolio_metrics SET (security_invoker = true);

-- Grant permissions on the view
GRANT SELECT ON public.investor_portfolio_metrics TO authenticated;
GRANT SELECT ON public.investor_portfolio_metrics TO service_role;
GRANT SELECT ON public.investor_portfolio_metrics TO postgres;
