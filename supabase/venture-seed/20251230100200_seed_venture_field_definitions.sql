-- Migration: Seed master_field_definitions for venture module
-- These define the fields that can be extracted from venture documents

--------------------------------------------------------------------------------
-- Core Company Fields
--------------------------------------------------------------------------------
INSERT INTO master_field_definitions (field_key, default_label, default_data_type, category, default_select_options) VALUES
-- Investment Status
('stage', 'Investment Stage', 'select', 'core', '["Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Series D+", "Dissolved", "Acquired"]'),
('investment_status', 'Investment Status', 'select', 'core', '["Active", "Exited"]'),
('entity_type', 'Entity Type', 'text', 'core', NULL),
('cash_position', 'Cash Position', 'select', 'core', '["0-3 months", "4-6 months", "7-12 months", "12+ months"]'),
('currently_raising', 'Currently Raising', 'boolean', 'core', NULL),
('next_board_meeting', 'Next Board Meeting', 'date', 'core', NULL),
('fund', 'Fund', 'text', 'core', NULL),
('tags', 'Tags', 'json', 'core', NULL)
ON CONFLICT (field_key) DO NOTHING;

--------------------------------------------------------------------------------
-- Valuation & Financials
--------------------------------------------------------------------------------
INSERT INTO master_field_definitions (field_key, default_label, default_data_type, category) VALUES
('valuation', 'Valuation', 'currency', 'financials'),
('post_money_valuation', 'Post Money Valuation', 'currency', 'financials'),
('total_equity_financing', 'Total Equity Financing', 'currency', 'financials'),
('current_price_per_unit', 'Current Price Per Unit', 'currency', 'financials'),
('last_transaction_date', 'Last Transaction Date', 'date', 'financials')
ON CONFLICT (field_key) DO NOTHING;

--------------------------------------------------------------------------------
-- Ownership & Economics
--------------------------------------------------------------------------------
INSERT INTO master_field_definitions (field_key, default_label, default_data_type, category) VALUES
('my_total_fmv', 'My Total FMV', 'currency', 'ownership'),
('my_ownership', 'My Ownership %', 'percentage', 'ownership'),
('my_fully_diluted_percent', 'Fully Diluted %', 'percentage', 'ownership'),
('my_aggregate_cost', 'My Aggregate Cost', 'currency', 'ownership'),
('implied_value', 'Implied Value', 'currency', 'ownership'),
('multiple', 'Multiple', 'number', 'ownership')
ON CONFLICT (field_key) DO NOTHING;

--------------------------------------------------------------------------------
-- Entry Transaction Fields
--------------------------------------------------------------------------------
INSERT INTO master_field_definitions (field_key, default_label, default_data_type, category) VALUES
('my_entry_date', 'My Entry Date', 'date', 'entry'),
('stage_at_entry', 'Stage at Entry', 'select', 'entry'),
('my_entry_cost', 'My Entry Cost', 'currency', 'entry'),
('post_money_at_entry', 'Post Money at Entry', 'currency', 'entry')
ON CONFLICT (field_key) DO NOTHING;

--------------------------------------------------------------------------------
-- Governance
--------------------------------------------------------------------------------
INSERT INTO master_field_definitions (field_key, default_label, default_data_type, category) VALUES
('board_of_directors', 'Board of Directors', 'json', 'governance'),
('board_observers', 'Board Observers', 'json', 'governance')
ON CONFLICT (field_key) DO NOTHING;

--------------------------------------------------------------------------------
-- Legal Terms (stored as JSON for complex nested structures)
--------------------------------------------------------------------------------
INSERT INTO master_field_definitions (field_key, default_label, default_data_type, category, default_tooltip_text) VALUES
('legal_terms', 'Legal Terms', 'json', 'legal', 'Complete legal terms including information rights, major investor status, economic rights, QSBS, dividends, and other terms')
ON CONFLICT (field_key) DO NOTHING;

-- Individual legal term fields (for granular extraction)
INSERT INTO master_field_definitions (field_key, default_label, default_data_type, category) VALUES
('major_investor_status', 'Major Investor Status', 'boolean', 'legal'),
('information_rights', 'Information Rights', 'boolean', 'legal'),
('information_rights_details', 'Information Rights Details', 'json', 'legal'),
('major_investor_threshold_amount', 'Major Investor Threshold Amount', 'currency', 'legal'),
('major_investor_threshold_shares', 'Major Investor Threshold Shares', 'number', 'legal'),
('major_investor_threshold_percent', 'Major Investor Threshold %', 'percentage', 'legal'),
('named_major_investors', 'Named Major Investors', 'json', 'legal'),
('anti_dilution_rights', 'Anti-Dilution Rights', 'text', 'legal'),
('liquidation_preference_seniority', 'Liquidation Preference Seniority', 'json', 'legal'),
('milestone_closings', 'Milestone Closings', 'boolean', 'legal'),
('qsbs_covenant_given', 'QSBS Covenant Given', 'boolean', 'legal'),
('qsbs_rep_made', 'QSBS Rep Made', 'boolean', 'legal'),
('accruing_dividends', 'Accruing Dividends', 'boolean', 'legal'),
('cumulative_dividends', 'Cumulative Dividends', 'boolean', 'legal'),
('dividend_rate', 'Dividend Rate', 'percentage', 'legal'),
('dividend_seniority', 'Dividend Seniority', 'text', 'legal'),
('pro_rata_rights_all', 'Pro Rata Rights (All)', 'boolean', 'legal'),
('pro_rata_rights_major_investors', 'Pro Rata Rights (Major Investors)', 'boolean', 'legal'),
('drag_along', 'Drag Along', 'boolean', 'legal'),
('pay_to_play', 'Pay to Play', 'boolean', 'legal'),
('d_and_o_insurance', 'D&O Insurance', 'boolean', 'legal'),
('investor_counsel_fee_cap', 'Investor Counsel Fee Cap', 'currency', 'legal'),
('employee_vesting_protocol', 'Employee Vesting Protocol', 'boolean', 'legal'),
('founder_vesting_protocol', 'Founder Vesting Protocol', 'boolean', 'legal'),
('investors_subject_to_rofr', 'Investors Subject to ROFR', 'boolean', 'legal'),
('required_closing_payments', 'Required Closing Payments', 'boolean', 'legal'),
('rofr_and_cosale_agreement', 'ROFR & Co-Sale Agreement', 'boolean', 'legal'),
('subsequent_closing_window_days', 'Subsequent Closing Window (Days)', 'number', 'legal'),
('standard_pro_rata_formulation', 'Standard Pro Rata Formulation', 'boolean', 'legal'),
('issuer_pays_investor_counsel_fees', 'Issuer Pays Investor Counsel Fees', 'boolean', 'legal'),
('registration_rights_preferred', 'Registration Rights (Preferred)', 'boolean', 'legal')
ON CONFLICT (field_key) DO NOTHING;

--------------------------------------------------------------------------------
-- Cap Table (stored as JSON for snapshots)
--------------------------------------------------------------------------------
INSERT INTO master_field_definitions (field_key, default_label, default_data_type, category, default_tooltip_text) VALUES
('cap_table', 'Cap Table', 'json', 'cap_table', 'Cap table snapshots with securities, units, and ownership percentages')
ON CONFLICT (field_key) DO NOTHING;

--------------------------------------------------------------------------------
-- Transactions (stored as JSON for history)
--------------------------------------------------------------------------------
INSERT INTO master_field_definitions (field_key, default_label, default_data_type, category, default_tooltip_text) VALUES
('transactions', 'Transactions', 'json', 'transactions', 'Investment transaction history with dates, amounts, and types')
ON CONFLICT (field_key) DO NOTHING;
