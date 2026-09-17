-- Annual KPI roll-up needs to know how each metric collapses across the quarters
-- of a fiscal year: flows (revenue, spend, cash movements) sum, while stocks /
-- snapshots (ARR, cash balance, headcount, ratios) take the latest quarter.
-- The catalog had no such flag, so the FY column couldn't be computed from data.

ALTER TABLE inv_kpi_catalog
    ADD COLUMN IF NOT EXISTS is_flow BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN inv_kpi_catalog.is_flow IS
    'Flow metric (sum across the periods of a fiscal year) vs. stock/snapshot '
    '(take the latest period). Drives the annual KPI roll-up. YTD/TTM fields are '
    'already cumulative and stay FALSE.';

UPDATE inv_kpi_catalog SET is_flow = TRUE WHERE code IN (
    'revenue_q', 'net_sales', 'bookings', 'contract_revenue',
    'gross_profit', 'cogs', 'ebitda', 'net_income', 'noi', 'pbt', 'opex', 'rd_spend',
    'net_cash_change', 'cash_inflow', 'cash_outflow'
);
