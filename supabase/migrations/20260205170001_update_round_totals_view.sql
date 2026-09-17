-- Update v_inv_round_totals to use fr.total_raised instead of transaction sum
-- Depends on: 20260205170000_add_total_raised_to_financing_round.sql
--
-- BEHAVIORAL CHANGES:
-- 1. total_raised now returns NULL (not 0) when no CSV data exists (intentional)
-- 2. post_money_valuation now returns a value even if pre_money_valuation is NULL

DROP VIEW IF EXISTS v_inv_round_totals;

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
    fr.total_raised,
    COALESCE(fr.pre_money_valuation, 0) + COALESCE(fr.total_raised, 0) AS post_money_valuation,
    COUNT(DISTINCT t.fund_id) AS our_funds_count,
    fr.final_close_date,
    fr.currency
FROM inv_financing_round fr
LEFT JOIN inv_stages s ON s.id = fr.stage_id
LEFT JOIN inv_transaction t ON t.financing_round_id = fr.id
GROUP BY fr.id, s.display_name;
