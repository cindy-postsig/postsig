-- Seeds the portco KPI catalog as required reference data, alongside the
-- schema in 20260618120000. Idempotent upsert by code: re-running propagates
-- label/category/type/order edits and appends new fields. Add future fields
-- as new seed migrations.

INSERT INTO inv_kpi_catalog (code, label, category, value_type, placeholder, sort_order) VALUES
    -- Growth & Revenue
    ('revenue_q',          'Revenue',               'Growth & Revenue',        'currency', 'e.g. $1,350,000', 1),
    ('ytd_revenue',        'YTD Revenue',           'Growth & Revenue',        'currency', 'e.g. $4,400,000', 2),
    ('net_sales',          'Net Sales',             'Growth & Revenue',        'currency', 'e.g. $1,300,000', 3),
    ('bookings',           'Bookings',              'Growth & Revenue',        'currency', 'e.g. $2,000,000', 4),
    ('contract_revenue',   'Contract Revenue',      'Growth & Revenue',        'currency', 'e.g. $1,250,000', 5),
    ('arr',                'ARR',                   'Growth & Revenue',        'currency', 'e.g. $5,500,000', 6),
    ('mrr',                'MRR (Most Recent)',     'Growth & Revenue',        'currency', 'e.g. $458,000',   7),
    ('acv',                'ACV',                   'Growth & Revenue',        'currency', 'e.g. $39,000',    8),
    ('rev_growth',         'Revenue Growth',        'Growth & Revenue',        'percent',  'e.g. 12%',        9),
    ('cagr',               'CAGR (3yr)',            'Growth & Revenue',        'percent',  'e.g. 63%',        10),

    -- Profitability
    ('gross_profit',       'Gross Profit',          'Profitability',           'currency', 'e.g. $985,000',   11),
    ('gross_margin',       'Gross Margin',          'Profitability',           'percent',  'e.g. 73%',        12),
    ('cogs',               'COGS',                  'Profitability',           'currency', 'e.g. $365,000',   13),
    ('ebitda',             'EBITDA',                'Profitability',           'currency', 'e.g. -$440,000',  14),
    ('ytd_ebitda',         'YTD EBITDA',            'Profitability',           'currency', 'e.g. -$440,000',  15),
    ('net_income',         'Net Income',            'Profitability',           'currency', 'e.g. -$510,000',  16),
    ('noi',                'Net Operating Income',  'Profitability',           'currency', 'e.g. -$455,000',  17),
    ('pbt',                'PBT',                   'Profitability',           'currency', 'e.g. -$495,000',  18),
    ('opex',               'Total OpEx',            'Profitability',           'currency', 'e.g. $1,430,000', 19),
    ('rd_spend',           'R&D Spend',             'Profitability',           'currency', 'e.g. $640,000',   20),
    ('sm_ttm',             'S&M Spend (TTM)',       'Profitability',           'currency', 'e.g. $2,100,000', 21),

    -- Cash & Liquidity
    ('cash',               'Cash',                  'Cash & Liquidity',        'currency', 'e.g. $5,800,000', 22),
    ('burn',               'Net Burn Rate',         'Cash & Liquidity',        'currency', 'e.g. $620,000',   23),
    ('runway',             'Cash Runway (months)',  'Cash & Liquidity',        'number',   'e.g. 9',          24),
    ('net_cash_change',    'Net Change in Cash',    'Cash & Liquidity',        'currency', 'e.g. -$520,000',  25),
    ('cash_inflow',        'Total Cash Inflow',     'Cash & Liquidity',        'currency', 'e.g. $1,350,000', 26),
    ('cash_outflow',       'Total Cash Outflow',    'Cash & Liquidity',        'currency', 'e.g. $1,870,000', 27),
    ('cf_breakeven_date',  'Cash Flow Break Even',  'Cash & Liquidity',        'text',     'e.g. Q3 2027',    28),
    ('oob_date',           'Out of Business Date',  'Cash & Liquidity',        'text',     'e.g. Sep 2026',   29),
    ('oob_years',          'Out of Business (yrs)', 'Cash & Liquidity',        'number',   'e.g. 0.75',       30),
    ('debt_balance',       'Debt Balance',          'Cash & Liquidity',        'currency', 'e.g. $1,500,000', 31),
    ('debt_available',     'Debt Available',        'Cash & Liquidity',        'currency', 'e.g. $1,250,000', 32),
    ('non_dilutive',       'Non-dilutive Funding',  'Cash & Liquidity',        'currency', 'e.g. $850,000',   33),
    ('dollars_reserved',   'Dollars Reserved',      'Cash & Liquidity',        'currency', 'e.g. $465,000',   34),

    -- Unit Economics
    ('cac',                'CAC',                   'Unit Economics',          'currency', 'e.g. $1,750',     35),
    ('ltv',                'LTV',                   'Unit Economics',          'currency', 'e.g. $20,500',    36),
    ('clv',                'CLV',                   'Unit Economics',          'currency', 'e.g. $19,600',    37),
    ('ltv_cac',            'LTV/CAC',               'Unit Economics',          'number',   'e.g. 11.7',       38),
    ('clv_cac',            'CLV/CAC',               'Unit Economics',          'number',   'e.g. 11.2',       39),
    ('crc',                'CRC',                   'Unit Economics',          'currency', 'e.g. $555',       40),
    ('churn',              'Churn Rate',            'Unit Economics',          'percent',  'e.g. 1.9%',       41),
    ('logo_retention',     'Logo Retention',        'Unit Economics',          'percent',  'e.g. 96%',        42),
    ('nrr',                'NRR',                   'Unit Economics',          'percent',  'e.g. 124%',       43),

    -- Customers & Engagement
    ('customers',          'Customers',             'Customers & Engagement',  'number',   'e.g. 395',        44),
    ('healthplan_contracts','Healthplan Contracts', 'Customers & Engagement',  'number',   'e.g. 17',         45),
    ('dau',                'DAU',                   'Customers & Engagement',  'number',   'e.g. 13,800',     46),
    ('wau',                'WAU',                   'Customers & Engagement',  'number',   'e.g. 40,000',     47),
    ('mau',                'MAU',                   'Customers & Engagement',  'number',   'e.g. 59,000',     48),

    -- Capital & Valuation
    ('v409a_pps',          '409A (Price/Share)',    'Capital & Valuation',     'currency', 'e.g. $2.65',      49),
    ('v409a_total',        '409A (Total)',          'Capital & Valuation',     'currency', 'e.g. $135,000,000', 50),
    ('next_financing',     'Next Financing Date',   'Capital & Valuation',     'text',     'e.g. Q3 2026',    51),

    -- Team & Efficiency
    ('headcount',          'FT Headcount',          'Team & Efficiency',       'number',   'e.g. 45',         52),
    ('rev_per_head',       'Revenue / Headcount',   'Team & Efficiency',       'currency', 'e.g. $30,000',    53),

    -- Narrative
    ('accomplishments',    'Accomplishments',       'Narrative',               'textarea', 'e.g. Signed Acme Corp, launched Enterprise tier', 54),
    ('senior_hire',        'Senior Hire(s)',        'Narrative',               'textarea', 'e.g. VP Sales (ex-Snowflake)', 55),
    ('new_capital',        'New Capital Raised',    'Narrative',               'text',     'e.g. $5M Series A extension', 56)
ON CONFLICT (code) DO UPDATE SET
    label       = EXCLUDED.label,
    category    = EXCLUDED.category,
    value_type  = EXCLUDED.value_type,
    placeholder = EXCLUDED.placeholder,
    sort_order  = EXCLUDED.sort_order,
    is_active   = TRUE,
    updated_at  = NOW();
