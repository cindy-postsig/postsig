-- investor_portfolio_metrics view
-- Aggregates investor_position_lot for total shares, aggregate cost, fully_diluted_percent, implied_value, multiple
CREATE OR REPLACE VIEW public.investor_portfolio_metrics AS
WITH position_totals AS (
    SELECT
        ipl.party_id,
        ip.organization_id,
        ip.name AS party_name,
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
LEFT JOIN investor_security isec ON isec.entity_id = pt.entity_id AND isec.series_name = pt.series_name
LEFT JOIN latest_terms lt ON lt.security_id = isec.id
LEFT JOIN latest_closing lc ON lc.entity_id = pt.entity_id;

COMMENT ON VIEW public.investor_portfolio_metrics IS 'Aggregated portfolio metrics per party per entity per security';


-- investor_party_summary view
-- Aggregates investor participation across rounds, shows rights status
CREATE OR REPLACE VIEW public.investor_party_summary AS
WITH party_participation AS (
    SELECT
        icp.party_id,
        ip.organization_id,
        ip.name AS party_name,
        ip.party_type,
        ip.email,
        ife.entity_id,
        me.name AS entity_name,
        COUNT(DISTINCT ife.id) AS rounds_participated,
        COUNT(DISTINCT ic.id) AS closings_participated,
        SUM(icp.amount_paid) AS total_invested,
        MIN(ic.close_date) AS first_investment_date,
        MAX(ic.close_date) AS last_investment_date,
        ARRAY_AGG(DISTINCT ife.round_name) FILTER (WHERE ife.round_name IS NOT NULL) AS rounds
    FROM investor_closing_participant icp
    JOIN investor_party ip ON ip.id = icp.party_id
    JOIN investor_closing ic ON ic.id = icp.closing_id
    JOIN investor_financing_event ife ON ife.id = ic.event_id
    JOIN module_entities me ON me.id = ife.entity_id
    GROUP BY
        icp.party_id,
        ip.organization_id,
        ip.name,
        ip.party_type,
        ip.email,
        ife.entity_id,
        me.name
),
party_rights AS (
    SELECT DISTINCT ON (isec.entity_id, ipl.party_id)
        ipl.party_id,
        isec.entity_id,
        istv.terms->>'major_investor' AS major_investor,
        istv.terms->>'information_rights' AS information_rights,
        istv.terms->>'pro_rata_rights' AS pro_rata_rights,
        istv.terms->>'qsbs_qualified' AS qsbs_qualified,
        istv.anti_dilution_type,
        istv.liquidation_preference_multiple
    FROM investor_position_lot ipl
    JOIN investor_security isec ON isec.id = ipl.security_id
    LEFT JOIN investor_security_terms_version istv ON istv.security_id = isec.id
    ORDER BY isec.entity_id, ipl.party_id, istv.effective_date DESC NULLS LAST
),
board_seats AS (
    SELECT
        ibr.party_id,
        ibr.entity_id,
        COUNT(*) FILTER (WHERE ibr.end_date IS NULL OR ibr.end_date > CURRENT_DATE) AS active_board_seats,
        ARRAY_AGG(DISTINCT ibr.seat_type) FILTER (WHERE ibr.end_date IS NULL OR ibr.end_date > CURRENT_DATE) AS seat_types
    FROM investor_board_representation ibr
    GROUP BY ibr.party_id, ibr.entity_id
)
SELECT
    pp.party_id,
    pp.organization_id,
    pp.party_name,
    pp.party_type,
    pp.email,
    pp.entity_id,
    pp.entity_name,
    pp.rounds_participated,
    pp.closings_participated,
    pp.total_invested,
    pp.first_investment_date,
    pp.last_investment_date,
    pp.rounds,
    pr.major_investor,
    pr.information_rights,
    pr.pro_rata_rights,
    pr.qsbs_qualified,
    pr.anti_dilution_type,
    pr.liquidation_preference_multiple,
    COALESCE(bs.active_board_seats, 0) AS active_board_seats,
    bs.seat_types
FROM party_participation pp
LEFT JOIN party_rights pr ON pr.party_id = pp.party_id AND pr.entity_id = pp.entity_id
LEFT JOIN board_seats bs ON bs.party_id = pp.party_id AND bs.entity_id = pp.entity_id;

COMMENT ON VIEW public.investor_party_summary IS 'Summary of investor participation and rights across portfolio companies';


-- Additional performance indexes for common query patterns

-- Composite index for position lot queries by party and security
CREATE INDEX IF NOT EXISTS investor_position_lot_party_security_idx
    ON public.investor_position_lot USING btree (party_id, security_id);

-- Composite index for closing participant queries
CREATE INDEX IF NOT EXISTS investor_closing_participant_closing_party_idx
    ON public.investor_closing_participant USING btree (closing_id, party_id);

-- Composite index for security terms by security and effective date
CREATE INDEX IF NOT EXISTS investor_security_terms_version_security_effective_idx
    ON public.investor_security_terms_version USING btree (security_id, effective_date DESC NULLS LAST);

-- Composite index for financing events by entity
CREATE INDEX IF NOT EXISTS investor_financing_event_entity_announced_idx
    ON public.investor_financing_event USING btree (entity_id, announced_date DESC NULLS LAST);

-- Composite index for closings by event and date
CREATE INDEX IF NOT EXISTS investor_closing_event_date_idx
    ON public.investor_closing USING btree (event_id, close_date DESC NULLS LAST);

-- Composite index for board representation queries
CREATE INDEX IF NOT EXISTS investor_board_representation_entity_party_idx
    ON public.investor_board_representation USING btree (entity_id, party_id);

-- Composite index for convertible instruments by entity and status
CREATE INDEX IF NOT EXISTS investor_convertible_instruments_entity_status_idx
    ON public.investor_convertible_instruments USING btree (entity_id, status);


-- Grant permissions on views
GRANT SELECT ON public.investor_portfolio_metrics TO authenticated;
GRANT SELECT ON public.investor_portfolio_metrics TO service_role;
GRANT SELECT ON public.investor_portfolio_metrics TO postgres;

GRANT SELECT ON public.investor_party_summary TO authenticated;
GRANT SELECT ON public.investor_party_summary TO service_role;
GRANT SELECT ON public.investor_party_summary TO postgres;
