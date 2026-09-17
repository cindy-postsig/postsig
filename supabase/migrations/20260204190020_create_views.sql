-- COMPUTED VIEWS
-- Note: Views join inv_company (ic) with global companies (gc) table.
-- Company name uses COALESCE(ic.name_override, gc.name) pattern.

-- Position view
CREATE OR REPLACE VIEW v_inv_position 
WITH (security_invoker = true) 
AS
SELECT
    t.organization_id,
    t.fund_id,
    f.name AS fund_name,
    t.company_id,
    ic.company_id AS global_company_id,
    COALESCE(ic.name_override, gc.name) AS company_name,
    gc.domain AS company_domain,
    ic.status AS company_status,
    t.security_id,
    s.name AS security_name,
    s.security_type,
    SUM(t.units) AS total_units,
    SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) AS total_cost,
    CASE WHEN SUM(t.units) > 0 THEN SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) / SUM(t.units) ELSE 0 END AS avg_cost_per_unit,
    MIN(t.transaction_date) AS first_acquired,
    MAX(t.transaction_date) AS last_transaction,
    t.currency
FROM inv_transaction t
JOIN inv_fund f ON f.id = t.fund_id
JOIN inv_company ic ON ic.id = t.company_id
JOIN inv_companies gc ON gc.id = ic.company_id
JOIN inv_security s ON s.id = t.security_id
GROUP BY t.organization_id, t.fund_id, f.name, t.company_id, ic.company_id, ic.name_override, gc.name, gc.domain, ic.status, t.security_id, s.name, s.security_type, t.currency
HAVING SUM(t.units) > 0;

-- Round totals view
CREATE OR REPLACE VIEW v_inv_round_totals 
WITH (security_invoker = true) 
AS
SELECT
    fr.id AS financing_round_id,
    fr.organization_id,
    fr.company_id,
    fr.name AS round_name,
    s.display_name AS stage,
    fr.pre_money_valuation,
    COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'purchase'), 0) AS total_raised,
    fr.pre_money_valuation + COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'purchase'), 0) AS post_money_valuation,
    COUNT(DISTINCT t.fund_id) AS our_funds_count,
    fr.final_close_date,
    fr.currency
FROM inv_financing_round fr
LEFT JOIN inv_stages s ON s.id = fr.stage_id
LEFT JOIN inv_transaction t ON t.financing_round_id = fr.id
GROUP BY fr.id, s.display_name;

-- Board view
CREATE OR REPLACE VIEW v_inv_board 
WITH (security_invoker = true) 
AS
SELECT
    bs.company_id,
    bs.organization_id,
    ic.company_id AS global_company_id,
    COALESCE(ic.name_override, gc.name) AS company_name,
    COUNT(*) FILTER (WHERE bs.seat_type != 'observer' AND bs.end_date IS NULL) AS board_size,
    COUNT(*) FILTER (WHERE bs.seat_type = 'observer' AND bs.end_date IS NULL) AS observer_count,
    COUNT(*) FILTER (WHERE bs.designating_fund_id IS NOT NULL AND bs.end_date IS NULL) AS our_seats,
    STRING_AGG(bs.holder_name, ', ') FILTER (WHERE bs.end_date IS NULL) AS current_members
FROM inv_board_seat bs
JOIN inv_company ic ON ic.id = bs.company_id
JOIN inv_companies gc ON gc.id = ic.company_id
GROUP BY bs.company_id, bs.organization_id, ic.company_id, ic.name_override, gc.name;

-- Fund summary view
CREATE OR REPLACE VIEW v_inv_fund_summary 
WITH (security_invoker = true) 
AS
SELECT
    p.organization_id,
    p.fund_id,
    p.fund_name,
    COUNT(DISTINCT p.company_id) AS companies_count,
    COUNT(DISTINCT p.security_id) AS positions_count,
    SUM(p.total_cost) AS total_invested,
    SUM(p.total_units) AS total_units,
    p.currency
FROM v_inv_position p
GROUP BY p.organization_id, p.fund_id, p.fund_name, p.currency;

-- Info rights schedule view
CREATE OR REPLACE VIEW v_inv_info_rights_schedule 
WITH (security_invoker = true) 
AS
SELECT
    ir.organization_id,
    ic.id AS company_id,
    ic.company_id AS global_company_id,
    COALESCE(ic.name_override, gc.name) AS company_name,
    gc.domain AS company_domain,
    ir.is_major_investor,
    ir.monthly_balance_sheet, ir.monthly_timing_days,
    ir.quarterly_balance_sheet, ir.quarterly_timing_days,
    ir.year_end_balance_sheet, ir.year_end_timing_days,
    ir.audited_year_end,
    ir.cap_table_access,
    ir.reporting_contact_name,
    ir.reporting_contact_email
FROM inv_information_rights ir
JOIN inv_company ic ON ic.id = ir.company_id
JOIN inv_companies gc ON gc.id = ic.company_id
WHERE (ir.expiration_date IS NULL OR ir.expiration_date > CURRENT_DATE)
    AND ir.effective_date <= CURRENT_DATE;

-- Co-investor network view
CREATE OR REPLACE VIEW v_inv_co_investor_network 
WITH (security_invoker = true) 
AS
SELECT
    ci.organization_id,
    ci.investor_name,
    ci.investor_type,
    COUNT(DISTINCT ci.financing_round_id) AS rounds_participated,
    COUNT(DISTINCT fr.company_id) AS companies_coinvested,
    SUM(ci.amount_invested) AS total_coinvested,
    COUNT(*) FILTER (WHERE ci.relationship IN ('lead', 'co_lead')) AS times_led,
    ARRAY_AGG(DISTINCT COALESCE(ic.name_override, gc.name)) AS company_names,
    MAX(fr.final_close_date) AS last_coinvestment_date
FROM inv_co_investor ci
JOIN inv_financing_round fr ON fr.id = ci.financing_round_id
JOIN inv_company ic ON ic.id = fr.company_id
JOIN inv_companies gc ON gc.id = ic.company_id
GROUP BY ci.organization_id, ci.investor_name, ci.investor_type;

-- Company valuation summary view (covers my_fmv, multiple, total_equity_financing)
CREATE OR REPLACE VIEW v_inv_company_valuation 
WITH (security_invoker = true) 
AS
SELECT
    ic.id AS company_id,
    ic.organization_id,
    ic.company_id AS global_company_id,
    COALESCE(ic.name_override, gc.name) AS company_name,
    gc.domain AS company_domain,
    gc.industry,
    gc.headquarters,
    ic.status,
    ic.sector,
    -- Latest cap table snapshot data
    cs.snapshot_date,
    cs.share_price AS current_price_unit,
    cs.our_total_shares AS my_units,
    cs.our_fd_ownership_percent AS my_fd_pct,
    cs.our_ownership_percent AS ownership_pct,
    cs.fully_diluted_total,
    cs.implied_valuation AS post_money_valuation,
    -- Computed FMV
    cs.share_price * cs.our_total_shares AS my_fmv,
    -- Aggregate cost from positions
    pos.total_cost AS aggregate_cost,
    -- Multiple
    CASE WHEN pos.total_cost > 0
         THEN (cs.share_price * cs.our_total_shares) / pos.total_cost
         ELSE NULL END AS multiple,
    -- Total equity financing across all rounds
    rounds.total_equity_financing,
    -- Last transaction
    pos.last_transaction AS last_transaction_date
FROM inv_company ic
JOIN inv_companies gc ON gc.id = ic.company_id
LEFT JOIN LATERAL (
    SELECT * FROM inv_cap_table_snapshot
    WHERE company_id = ic.id
    ORDER BY snapshot_date DESC
    LIMIT 1
) cs ON TRUE
LEFT JOIN (
    SELECT company_id, SUM(total_cost) AS total_cost, MAX(last_transaction) AS last_transaction
    FROM v_inv_position
    GROUP BY company_id
) pos ON pos.company_id = ic.id
LEFT JOIN (
    SELECT fr.company_id, SUM(t.amount) FILTER (WHERE t.transaction_type = 'purchase') AS total_equity_financing
    FROM inv_financing_round fr
    LEFT JOIN inv_transaction t ON t.financing_round_id = fr.id
    GROUP BY fr.company_id
) rounds ON rounds.company_id = ic.id;
