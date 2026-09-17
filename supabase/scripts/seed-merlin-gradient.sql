BEGIN;

-- Define once, use everywhere
SET local app.org_id = '731e5529-2a14-4e16-b901-945d4fc56768';  -- merlin
SET local app.company_id = '86';
SET local app.fund_id = '4';  -- fund ID

-- Chain 1: financing_round -> round_terms, cap_table_snapshot, co_investor, information_rights
WITH new_round AS (
  INSERT INTO public.inv_financing_round (
    organization_id,
    company_id,
    external_id,
    name,
    stage_id,
    announced_date,
    initial_close_date,
    final_close_date,
    pre_money_valuation,
    currency,
    notes,
    metadata,
    total_raised
  ) VALUES (
    current_setting('app.org_id')::uuid,        -- organization_id (uuid, required)
    current_setting('app.company_id')::bigint,   -- company_id (bigint, required, FK -> inv_company)
    'ext-series-seed',                              -- external_id (text, optional, unique per org)
    'Series Seed Stock Financing',                  -- name (text, required)
    2,                                           -- stage_id (bigint, optional, FK -> inv_stages)
    '2026-03-16',                                -- announced_date (date, optional)
    '2026-03-16',                                -- initial_close_date (date, optional)
    '2026-03-16',                                -- final_close_date (date, optional, must be >= initial_close_date)
    0,                                    -- pre_money_valuation (numeric(20,2), optional)
    'USD',                                       -- currency (char(3), default 'USD')
    NULL,                                        -- notes (text, optional)
    '{}',                                        -- metadata (jsonb, default '{}')
    9570001.55                                      -- total_raised (numeric(20,2), optional)
  )
  RETURNING id
),
round_terms AS (
  INSERT INTO public.inv_round_terms (
    organization_id,
    financing_round_id,
    external_id,
    effective_date,
    superseded_date,
    major_investor_threshold_amount,
    major_investor_threshold_shares,
    major_investor_threshold_ownership_pct,
    named_major_investors,
    pro_rata_rights_all,
    pro_rata_rights_major,
    standard_pro_rata_formulation,
    drag_along,
    pay_to_play,
    do_insurance,
    rofr_cosale,
    investors_subject_to_rofr,
    registration_rights_preferred,
    redemption_rights,
    employee_vesting_protocol,
    founder_vesting_applied,
    milestone_closings,
    subsequent_closing_window_days,
    required_closing_payments,
    investor_counsel_fee_cap,
    issuer_pays_investor_counsel,
    qsbs_covenant_given,
    qsbs_rep_made,
    pre_money_fd_shares,
    post_money_fd_shares,
    option_pool_percent,
    raw_terms
  ) VALUES (
    current_setting('app.org_id')::uuid,         -- organization_id (uuid, required)
    (SELECT id FROM new_round),                  -- financing_round_id (bigint, required, FK -> inv_financing_round)
    NULL,                                        -- external_id (text, optional)
    '2026-03-16',                                -- effective_date (date, required)
    NULL,                                        -- superseded_date (date, optional, must be > effective_date)
    NULL,                                        -- major_investor_threshold_amount (numeric(20,2), optional)
    0,                                      -- major_investor_threshold_shares (bigint, optional)
    0.04,                                        -- major_investor_threshold_ownership_pct (numeric(7,6), optional)
    NULL,                                        -- named_major_investors (text[], optional)
    true,                                        -- pro_rata_rights_all (boolean, optional)
    true,                                        -- pro_rata_rights_major (boolean, optional)
    NULL,                                        -- standard_pro_rata_formulation (boolean, optional)
    NULL,                                        -- drag_along (boolean, optional)
    NULL,                                        -- pay_to_play (boolean, optional)
    NULL,                                        -- do_insurance (boolean, optional)
    true,                                        -- rofr_cosale (boolean, optional)
    true,                                        -- investors_subject_to_rofr (boolean, optional)
    true,                                        -- registration_rights_preferred (boolean, optional)
    NULL,                                        -- redemption_rights (boolean, optional)
    NULL,                                        -- employee_vesting_protocol (boolean, optional)
    NULL,                                        -- founder_vesting_applied (boolean, optional)
    NULL,                                        -- milestone_closings (boolean, optional)
    90,                                        -- subsequent_closing_window_days (smallint, optional)
    true,                                       -- required_closing_payments (boolean, default false)
    30000,                                       -- investor_counsel_fee_cap (numeric(20,2), optional)
    true,                                        -- issuer_pays_investor_counsel (boolean, optional)
    true,                                        -- qsbs_covenant_given (boolean, optional)
    NULL,                                        -- qsbs_rep_made (boolean, optional)
    NULL,                                        -- pre_money_fd_shares (bigint, optional)
    NULL,                                        -- post_money_fd_shares (bigint, optional)
    NULL,                                        -- option_pool_percent (numeric(5,4), optional)
    '{}'                                         -- raw_terms (jsonb, default '{}')
  )
  RETURNING id
),
cap_snapshot AS (
  INSERT INTO public.inv_cap_table_snapshot (
    organization_id,
    company_id,
    financing_round_id,
    external_id,
    snapshot_date,
    snapshot_type_id,
    common_authorized,
    common_outstanding,
    preferred_authorized,
    preferred_outstanding,
    total_outstanding,
    fully_diluted_total,
    option_pool_authorized,
    option_pool_outstanding,
    option_pool_available,
    option_pool_fd_percent,
    our_common_shares,
    our_preferred_shares,
    our_total_shares,
    our_ownership_percent,
    our_fd_ownership_percent,
    our_preferred_pct,
    our_voting_pct,
    share_price,
    implied_valuation,
    cap_table_detail,
    conversion_shares_issued,
    new_money_shares_issued,
    pre_money_preferred_outstanding
  ) VALUES (
    current_setting('app.org_id')::uuid,           -- organization_id (uuid, required)
    current_setting('app.company_id')::bigint,     -- company_id (bigint, required, FK -> inv_company)
    (SELECT id FROM new_round),                    -- financing_round_id (bigint, optional, FK -> inv_financing_round)
    'ext-series-seed',                                -- external_id (text, optional)
    '2026-03-16',                                  -- snapshot_date (date, required, unique per company+type)
    1,                                             -- snapshot_type_id (bigint, optional, FK -> inv_snapshot_types)
    26785396,                                          -- common_authorized (bigint, optional)
    15000000,                                          -- common_outstanding (bigint, optional)
    9508637,                                          -- preferred_authorized (bigint, optional)
    9508637,                                          -- preferred_outstanding (bigint, optional)
    26785400,                                          -- total_outstanding (bigint, optional)
    26785400,                                             -- fully_diluted_total (bigint, required)
    2276759,                                          -- option_pool_authorized (bigint, optional)
    0,                                       -- option_pool_outstanding (bigint, optional)
    2276759,                                          -- option_pool_available (bigint, optional)
    NULL,                                          -- option_pool_fd_percent (numeric(7,6), optional)
    NULL,                                          -- our_common_shares (bigint, optional)
    2544565,                                          -- our_preferred_shares (bigint, optional)
    2544565,                                       -- our_total_shares (bigint, optional)
    NULL,                                          -- our_ownership_percent (numeric(7,6), optional)
    0.095,                                        -- our_fd_ownership_percent (numeric(7,6), optional)
    0.2676,                                        -- our_preferred_pct (numeric(7,6), optional)
    NULL,                                          -- our_voting_pct (numeric(7,6), optional)
    1.0827,                                   -- share_price (numeric(20,8), optional)
    29000000,                                      -- implied_valuation (numeric(20,2), optional)
    '{}',                                          -- cap_table_detail (jsonb, default '{}')
    NULL,                                          -- conversion_shares_issued (bigint, optional)
    8839015,                                          -- new_money_shares_issued (bigint, optional)
    NULL                                           -- pre_money_preferred_outstanding (bigint, optional)
  )
  RETURNING id
),
co_investor AS (
  INSERT INTO public.inv_co_investor (
    organization_id,
    financing_round_id,
    external_id,
    investor_name,
    investor_type,
    relationship,
    has_board_seat,
    is_major_investor,
    amount_invested,
    currency,
    contact_name,
    contact_email,
    metadata
  ) VALUES (
    current_setting('app.org_id')::uuid,         -- organization_id (uuid, required)
    (SELECT id FROM new_round),                  -- financing_round_id (bigint, required, FK -> inv_financing_round)
    NULL,                                        -- external_id (text, optional)
    'Bessemer Venture Partners XII L.P.',                          -- investor_name (text, required, unique per round)
    'Fund',                                        -- investor_type (text, optional)
    'participant',                                      -- relationship (text, default 'participant': lead|co_lead|participant|follow_on)
    false,                                       -- has_board_seat (boolean, default false)
    NULL,                                        -- is_major_investor (boolean, default false)
    1349145.97,                                        -- amount_invested (numeric(20,2), optional)
    'USD',                                       -- currency (char(3), default 'USD')
    NULL,                                        -- contact_name (text, optional)
    NULL,                                        -- contact_email (text, optional)
    '{}'                                         -- metadata (jsonb, default '{}')
  ),
  (
    current_setting('app.org_id')::uuid,         -- organization_id (uuid, required)
    (SELECT id FROM new_round),                  -- financing_round_id (bigint, required, FK -> inv_financing_round)
    NULL,                                        -- external_id (text, optional)
    'Bessemer Venture Partners XII Institutional L.P.',                          -- investor_name (text, required, unique per round)
    'Fund',                                        -- investor_type (text, optional)
    'participant',                                      -- relationship (text, default 'participant': lead|co_lead|participant|follow_on)
    false,                                       -- has_board_seat (boolean, default false)
    NULL,                                        -- is_major_investor (boolean, default false)
    3816164.54,                                        -- amount_invested (numeric(20,2), optional)
    'USD',                                       -- currency (char(3), default 'USD')
    NULL,                                        -- contact_name (text, optional)
    NULL,                                        -- contact_email (text, optional)
    '{}'                                         -- metadata (jsonb, default '{}')
  ),
  (
    current_setting('app.org_id')::uuid,         -- organization_id (uuid, required)
    (SELECT id FROM new_round),                  -- financing_round_id (bigint, required, FK -> inv_financing_round)
    NULL,                                        -- external_id (text, optional)
    'Bessemer Venture Partners XII Advisors & Influencers, L.P.',                          -- investor_name (text, required, unique per round)
    'Fund',                                        -- investor_type (text, optional)
    'participant',                                      -- relationship (text, default 'participant': lead|co_lead|participant|follow_on)
    false,                                       -- has_board_seat (boolean, default false)
    NULL,                                        -- is_major_investor (boolean, default false)
    54690.43,                                        -- amount_invested (numeric(20,2), optional)
    'USD',                                       -- currency (char(3), default 'USD')
    NULL,                                        -- contact_name (text, optional)
    NULL,                                        -- contact_email (text, optional)
    '{}'                                         -- metadata (jsonb, default '{}')
  ),
  (
    current_setting('app.org_id')::uuid,         -- organization_id (uuid, required)
    (SELECT id FROM new_round),                  -- financing_round_id (bigint, required, FK -> inv_financing_round)
    NULL,                                        -- external_id (text, optional)
    'MAPLE CAPITAL II L.P.',                          -- investor_name (text, required, unique per round)
    'Fund',                                        -- investor_type (text, optional)
    'participant',                                      -- relationship (text, default 'participant': lead|co_lead|participant|follow_on)
    false,                                       -- has_board_seat (boolean, default false)
    NULL,                                        -- is_major_investor (boolean, default false)
    1595000.08,                                        -- amount_invested (numeric(20,2), optional)
    'USD',                                       -- currency (char(3), default 'USD')
    NULL,                                        -- contact_name (text, optional)
    NULL,                                        -- contact_email (text, optional)
    '{}'                                         -- metadata (jsonb, default '{}')
  )
  RETURNING id
)
INSERT INTO public.inv_information_rights (
  organization_id,
  company_id,
  financing_round_id,
  external_id,
  effective_date,
  expiration_date,
  major_investor_threshold,
  is_major_investor,
  monthly_balance_sheet,
  monthly_cap_table,
  monthly_income_cash_flows,
  monthly_stockholders_equity,
  monthly_timing_days,
  quarterly_balance_sheet,
  quarterly_cap_table,
  quarterly_income_cash_flows,
  quarterly_stockholders_equity,
  quarterly_timing_days,
  year_end_balance_sheet,
  year_end_cap_table,
  year_end_income_cash_flows,
  year_end_stockholders_equity,
  year_end_budget_business_plan,
  year_end_timing_days,
  audited_monthly,
  audited_quarterly,
  audited_year_end,
  info_rights_for_all,
  info_rights_for_major,
  cap_table_access,
  inspection_rights,
  reporting_contact_name,
  reporting_contact_email,
  notes,
  metadata
) VALUES (
  current_setting('app.org_id')::uuid,         -- organization_id (uuid, required)
  current_setting('app.company_id')::bigint,   -- company_id (bigint, required, FK -> inv_company)
  (SELECT id FROM new_round),                  -- financing_round_id (bigint, optional, FK -> inv_financing_round)
  NULL,                                        -- external_id (text, optional)
  '2026-03-16',                                -- effective_date (date, required)
  NULL,                                        -- expiration_date (date, optional)
  NULL,                                      -- major_investor_threshold (numeric(20,2), optional)
  false,                                       -- is_major_investor (boolean, default false)
  false,                                       -- monthly_balance_sheet (boolean, default false)
  false,                                       -- monthly_cap_table (boolean, default false)
  false,                                       -- monthly_income_cash_flows (boolean, default false)
  false,                                       -- monthly_stockholders_equity (boolean, default false)
  NULL,                                        -- monthly_timing_days (smallint, optional)
  false,                                       -- quarterly_balance_sheet (boolean, default false)
  false,                                       -- quarterly_cap_table (boolean, default false)
  false,                                       -- quarterly_income_cash_flows (boolean, default false)
  false,                                       -- quarterly_stockholders_equity (boolean, default false)
  NULL,                                        -- quarterly_timing_days (smallint, optional)
  false,                                        -- year_end_balance_sheet (boolean, default false)
  false,                                        -- year_end_cap_table (boolean, default false)
  false,                                       -- year_end_income_cash_flows (boolean, default false)
  false,                                        -- year_end_stockholders_equity (boolean, default false)
  false,                                       -- year_end_budget_business_plan (boolean, default false)
  NULL,                                        -- year_end_timing_days (smallint, optional)
  false,                                       -- audited_monthly (boolean, default false)
  false,                                       -- audited_quarterly (boolean, default false)
  false,                                       -- audited_year_end (boolean, default false)
  true,                                        -- info_rights_for_all (boolean, default false)
  true,                                        -- info_rights_for_major (boolean, default true)
  false,                                       -- cap_table_access (boolean, default false)
  false,                                       -- inspection_rights (boolean, default false)
  NULL,                                        -- reporting_contact_name (text, optional)
  NULL,                                        -- reporting_contact_email (text, optional)
  NULL,                                        -- notes (text, optional)
  '{}'                                         -- metadata (jsonb, default '{}')
)
RETURNING id;

-- Chain 2: security -> security_terms
WITH new_security AS (
  INSERT INTO public.inv_security (
    organization_id,
    company_id,
    external_id,
    name,
    security_type,
    series_name,
    is_valuation_reference,
    metadata
  ) VALUES (
    current_setting('app.org_id')::uuid,         -- organization_id (uuid, required)
    current_setting('app.company_id')::bigint,   -- company_id (bigint, required, FK -> inv_company)
    NULL,                                        -- external_id (text, optional, unique per org)
    'Series Seed Preferred',                        -- name (text, required, unique per company)
    'preferred',                                 -- security_type (text, required: common|preferred|safe|convertible_note|warrant|option)
    NULL,                                        -- series_name (text, optional)
    true,                                       -- is_valuation_reference (boolean, default false)
    '{}'                                         -- metadata (jsonb, default '{}')
  )
  RETURNING id
)
INSERT INTO public.inv_security_terms (
  organization_id,
  security_id,
  external_id,
  effective_date,
  superseded_date,
  original_issue_price,
  conversion_price,
  conversion_ratio,
  par_value,
  authorized_shares,
  issued_shares,
  outstanding_shares,
  liquidation_multiplier,
  liquidation_seniority,
  participation_type,
  participation_cap,
  dividend_rate,
  dividend_cumulative,
  dividend_accruing,
  dividend_seniority,
  anti_dilution_type,
  valuation_cap,
  discount_rate,
  interest_rate,
  interest_type,
  maturity_date,
  qualified_financing_threshold,
  raw_terms,
  aggregate_liq_pref
) VALUES (
  current_setting('app.org_id')::uuid,         -- organization_id (uuid, required)
  (SELECT id FROM new_security),               -- security_id (bigint, required, FK -> inv_security)
  NULL,                                        -- external_id (text, optional, unique per org)
  '2026-03-16',                                -- effective_date (date, required)
  NULL,                                        -- superseded_date (date, optional, must be > effective_date)
  NULL,                                        -- original_issue_price (numeric(20,8), optional)
  NULL,                                        -- conversion_price (numeric(20,8), optional)
  1.0,                                         -- conversion_ratio (numeric(20,10), default 1.0)
  NULL,                                        -- par_value (numeric(20,10), optional)
  NULL,                                        -- authorized_shares (bigint, optional)
  NULL,                                        -- issued_shares (bigint, optional)
  NULL,                                        -- outstanding_shares (bigint, optional)
  1.0,                                         -- liquidation_multiplier (numeric(5,2), default 1.0)
  NULL,                                        -- liquidation_seniority (smallint, optional)
  'none',                                      -- participation_type (text, default 'none': none|full|capped)
  NULL,                                        -- participation_cap (numeric(5,2), optional, relevant when type=capped)
  1,                                        -- dividend_rate (numeric(8,6), optional)
  false,                                       -- dividend_cumulative (boolean, default false)
  false,                                       -- dividend_accruing (boolean, default false)
  NULL,                                        -- dividend_seniority (smallint, optional)
  'none',                                      -- anti_dilution_type (text, default 'none': none|broad_based|narrow_based|full_ratchet)
  NULL,                                        -- valuation_cap (numeric(20,2), optional)
  NULL,                                        -- discount_rate (numeric(5,4), optional)
  NULL,                                        -- interest_rate (numeric(5,4), optional)
  NULL,                                        -- interest_type (text, optional)
  NULL,                                        -- maturity_date (date, optional)
  NULL,                                        -- qualified_financing_threshold (numeric(20,2), optional)
  '{}',                                        -- raw_terms (jsonb, default '{}')
  NULL                                         -- aggregate_liq_pref (numeric, optional)
)
RETURNING id;

-- Chain 3: equity_plan -> equity_plan_snapshot
WITH new_equity_plan AS (
  INSERT INTO public.inv_equity_plan (
    organization_id,
    company_id,
    external_id,
    name,
    plan_type,
    adoption_date,
    expiration_date,
    metadata
  ) VALUES (
    current_setting('app.org_id')::uuid,         -- organization_id (uuid, required)
    current_setting('app.company_id')::bigint,   -- company_id (bigint, required, FK -> inv_company)
    NULL,                                        -- external_id (text, optional)
    'Stock Plan',    -- name (text, required, unique per company)
    'iso',                                       -- plan_type (text, default 'iso')
    '2026-03-16',                                -- adoption_date (date, optional)
    NULL,                                        -- expiration_date (date, optional)
    '{}'                                         -- metadata (jsonb, default '{}')
  )
  RETURNING id
)
INSERT INTO public.inv_equity_plan_snapshot (
  organization_id,
  plan_id,
  external_id,
  effective_date,
  authorized_shares,
  issued_shares,
  outstanding_options,
  exercised_shares,
  cancelled_shares,
  pool_percent_fd,
  metadata
) VALUES (
  current_setting('app.org_id')::uuid,         -- organization_id (uuid, required)
  (SELECT id FROM new_equity_plan),            -- plan_id (bigint, required, FK -> inv_equity_plan)
  NULL,                                        -- external_id (text, optional)
  '2026-03-16',                                -- effective_date (date, required, unique per plan)
  2276759,                                     -- authorized_shares (bigint, optional)
  0,                                     -- issued_shares (bigint, optional)
  2276759,                                     -- outstanding_options (bigint, optional)
  NULL,                                        -- exercised_shares (bigint, optional)
  NULL,                                        -- cancelled_shares (bigint, optional)
  NULL,                                        -- pool_percent_fd (numeric(7,6), optional)
  '{}'                                         -- metadata (jsonb, default '{}')
)
RETURNING id;

 -- Chain 4: transactions (add before COMMIT)
  INSERT INTO public.inv_transaction (
    organization_id,
    fund_id,
    company_id,
    security_id,
    financing_round_id,
    transaction_type,
    transaction_date,
    units,
    amount,
    currency
  ) VALUES
    (
      current_setting('app.org_id')::uuid,
      current_setting('app.fund_id')::bigint,
      current_setting('app.company_id')::bigint,
      (SELECT id FROM inv_security WHERE company_id = current_setting('app.company_id')::bigint AND
   name = 'Series Seed Preferred'),
      (SELECT id FROM inv_financing_round WHERE company_id =
  current_setting('app.company_id')::bigint AND external_id = 'ext-series-seed'),
      'purchase',
      '2026-03-16',
      2544565.000000,
      2755000.53,
      'USD'
    )
  RETURNING id;
COMMIT;
