INSERT INTO "public"."master_field_definitions" (
    "field_key",
    "default_label",
    "default_data_type",
    "default_select_options",
    "default_ui_component_hint",
    "default_validation_rules",
    "default_tooltip_text",
    "category",
    "created_at",
    "updated_at",
    "settings"
) VALUES
    (
        'board_representatives',
        'Board of Representatives',
        'json',
        null, null, null, null,
        'legal',
        '2026-01-21 07:47:39.943252+00',
        '2026-01-21 07:47:39.943252+00',
        '{"schema":{"seat_type":{"type":"text","label":"Seat Type","required":true,"placeholder":"Enter seat type"},"director_name":{"type":"text","label":"Director Name","required":true,"placeholder":"Enter director name"},"designator_description":{"type":"text","label":"Designator Description","required":true,"placeholder":"Enter designator description"}},"itemName":"Board Representatives","renderType":"array_object"}'
    ),
    (
        'option_pool',
        'Option Pool',
        'json',
        null, null, null, null,
        'ownership',
        '2026-01-21 11:25:46.788664+00',
        '2026-01-22 11:28:10.712901+00',
        '{"schema":{"plan_name":{"type":"text","label":"Plan Name","required":true,"placeholder":"Enter plan name"},"effective_date":{"type":"date","label":"Effective Date","required":true,"placeholder":"Enter effective date"},"available_for_grant":{"type":"number","label":"Available for Grant","required":true,"placeholder":"Enter available for grant"},"outstanding_options":{"type":"number","label":"Outstanding Options","required":true,"placeholder":"Enter outstanding options"},"total_authorized_reserved":{"type":"number","label":"Total Authorized Reserved","required":true,"placeholder":"Enter total authorized reserved"}},"itemName":"Option Pool","renderType":"single_object"}'
    ),
    (
        'entity_type',
        'Entity Type',
        'text',
        null, null, null, null,
        'core',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'founded_year',
        'Founded Year',
        'number',
        null, null, null, null,
        'core',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'cash_position',
        'Cash Position',
        'select',
        '["0-3 months","4-6 months","7-12 months","12+ months"]',
        null, null, null,
        'core',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'major_investor_threshold_percent',
        'Major Investor Threshold %',
        'percentage',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'accruing_dividends',
        'Accruing Dividends',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'option_pool_reserved',
        'Option Pool Reserved',
        'number',
        null, null, null, null,
        'ownership',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'information_rights',
        'Information Rights',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'closing_date',
        'Closing Date',
        'date',
        null, null, null, null,
        'entry',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'cumulative_dividends',
        'Cumulative Dividends',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'multiple',
        'Multiple',
        'number',
        null, null, null, null,
        'ownership',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'current_price_per_unit',
        'Current Price Per Share',
        'currency',
        null, null, null, null,
        'financials',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 12:55:42.844043+00',
        null
    ),
    (
        'my_aggregate_cost',
        'My Aggregate Cost',
        'currency',
        null, null, null, null,
        'ownership',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'closing_participants',
        'Closing Participants',
        'json',
        null, null, null, null,
        'financials',
        '2026-01-21 07:07:23.622501+00',
        '2026-01-21 07:07:23.622501+00',
        '{"schema":{"currency":{"type":"text","label":"Currency","required":true,"placeholder":"Enter currency"},"closing_date":{"type":"date","label":"Closing Date","required":true,"placeholder":"Enter closing date"},"investor_name":{"type":"text","label":"Investor Name","required":true,"placeholder":"Enter investor name"},"security_name":{"type":"text","label":"Security Name","required":true,"placeholder":"Enter security name"},"shares_purchased":{"type":"number","label":"Shares Purchased","required":true,"placeholder":"Enter shares purchased"},"transaction_type":{"type":"select","label":"Transaction Type","required":true,"placeholder":"Enter transaction type"},"total_consideration":{"type":"number","label":"Total Consideration","required":true,"placeholder":"Enter total consideration"}},"itemName":"Closing Participants","renderType":"array_object"}'
    ),
    (
        'investors_subject_to_rofr',
        'Investors Subject to ROFR',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'stage',
        'Investment Stage',
        'select',
        '["Pre-Seed","Seed","Series A","Series B","Series C","Series D+","Dissolved","Acquired"]',
        null, null, null,
        'core',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-23 14:08:50.296652+00',
        null
    ),
    (
        'my_entry_cost',
        'My Entry Cost',
        'currency',
        null, null, null, null,
        'entry',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'pro_rata_rights_major_investors',
        'Pro Rata Rights (Major Investors)',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'cap_table',
        'Cap Table',
        'json',
        null, null, null,
        'Cap table snapshots with securities, units, and ownership percentages',
        'cap_table',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'founder_vesting_protocol',
        'Founder Vesting Protocol',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'total_equity_financing',
        'Total Equity Financing',
        'currency',
        null, null, null, null,
        'financials',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'drag_along',
        'Drag Along',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'board_observers',
        'Board Observers',
        'json',
        null, null, null, null,
        'governance',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'dividend_seniority',
        'Dividend Seniority',
        'text',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'liquidation_preference_seniority',
        'Liquidation Preference Seniority',
        'json',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'closings',
        'Closings',
        'json',
        null, null, null, null,
        'financials',
        '2026-01-20 19:01:18.306177+00',
        '2026-01-20 19:29:37.667308+00',
        '{"schema":{"closing_date":{"type":"date","label":"Closing Date","required":true,"placeholder":"Enter closing date"},"closing_label":{"type":"text","label":"Closing Label","required":true,"placeholder":"Enter closing label"},"total_new_cash_raised":{"type":"number","label":"Total Raised","required":true,"placeholder":"Enter total raised"}},"itemName":"Closings","renderType":"array_object"}'
    ),
    (
        'rofr_and_cosale_agreement',
        'ROFR & Co-Sale Agreement',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'shares_converted',
        'Shares Converted',
        'number',
        null, null, null, null,
        'ownership',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'subsequent_closing_window_days',
        'Subsequent Closing Window (Days)',
        'number',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'information_rights_details',
        'Information Rights Details',
        'json',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'board_of_directors',
        'Board of Directors',
        'json',
        null, null, null, null,
        'governance',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'anti_dilution_rights',
        'Anti-Dilution Rights',
        'text',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'transactions',
        'Transactions',
        'json',
        null, null, null,
        'Investment transaction history with dates, amounts, and types',
        'transactions',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'my_entry_date',
        'My Entry Date',
        'date',
        null, null, null, null,
        'entry',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'currently_raising',
        'Currently Raising',
        'boolean',
        null, null, null, null,
        'core',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'qsbs_covenant_given',
        'QSBS Covenant Given',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'warrants_outstanding',
        'Warrants Outstanding',
        'number',
        null, null, null, null,
        'ownership',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'next_board_meeting',
        'Next Board Meeting',
        'date',
        null, null, null, null,
        'core',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'post_money_valuation',
        'Post Money Valuation',
        'currency',
        null, null, null, null,
        'financials',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'implied_value',
        'Implied Value',
        'currency',
        null, null, null, null,
        'ownership',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'registration_rights_preferred',
        'Registration Rights (Preferred)',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'standard_pro_rata_formulation',
        'Standard Pro Rata Formulation',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'common_shares',
        'Common Shares',
        'json',
        null, null, null, null,
        'financials',
        '2026-01-22 09:29:53.522287+00',
        '2026-01-22 09:29:53.522287+00',
        '{"schema":{"par_value":{"type":"number","label":"Par Value","required":true,"placeholder":"Enter par value"},"authorized_shares":{"type":"number","label":"Authorized Shares","required":true,"placeholder":"Enter authorized shares"},"issued_and_outstanding_shares":{"type":"number","label":"Issued and Outstanding Shares","required":true,"placeholder":"Enter issued and outstanding shares"}},"itemName":"Common Shares","renderType":"single_object"}'
    ),
    (
        'fully_diluted_shares',
        'Fully Diluted Shares',
        'number',
        null, null, null, null,
        'ownership',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'my_fully_diluted_percent',
        'Fully Diluted %',
        'percentage',
        null, null, null, null,
        'ownership',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'named_major_investors',
        'Named Major Investors',
        'json',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'major_investor_threshold_amount',
        'Major Investor Threshold Amount',
        'currency',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'required_closing_payments',
        'Required Closing Payments',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'milestone_closings',
        'Milestone Closings',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'pay_to_play',
        'Pay to Play',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'my_total_fmv',
        'My Total FMV',
        'currency',
        null, null, null, null,
        'ownership',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'tags',
        'Tags',
        'json',
        null, null, null, null,
        'core',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'last_transaction_date',
        'Last Transaction Date',
        'date',
        null, null, null, null,
        'financials',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'shares_purchased',
        'Shares Purchased',
        'number',
        null, null, null, null,
        'ownership',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'realized_proceeds',
        'Realized Proceeds',
        'currency',
        null, null, null, null,
        'ownership',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'valuation',
        'Valuation',
        'currency',
        null, null, null, null,
        'financials',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'preferred_stock',
        'Preferred Stock',
        'json',
        null, null, null, null,
        'financials',
        '2026-01-21 06:46:06.471202+00',
        '2026-01-21 06:46:06.471202+00',
        '{"schema":{"par_value":{"type":"number","label":"Par Value","required":true,"placeholder":"Enter par value"},"series_name":{"type":"text","label":"Series Name","required":true,"placeholder":"Enter series name"},"authorized_shares":{"type":"number","label":"Authorized Shares","required":true,"placeholder":"Enter authorized shares"},"original_issue_price":{"type":"number","label":"Original Issue Price","required":true,"placeholder":"Enter original issue price"}},"itemName":"Preferred Stock","renderType":"array_object"}'
    ),
    (
        'major_investor_status',
        'Major Investor Status',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'qsbs_rep_made',
        'QSBS Rep Made',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'dividend_rate',
        'Dividend Rate',
        'percentage',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'my_ownership',
        'My Ownership %',
        'percentage',
        null, null, null, null,
        'ownership',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'employee_vesting_protocol',
        'Employee Vesting Protocol',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'post_money_at_entry',
        'Post Money at Entry',
        'currency',
        null, null, null, null,
        'entry',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'effective_date',
        'Effective Date',
        'date',
        null, null, null, null,
        'core',
        '2026-01-24 11:20:28.438327+00',
        '2026-01-24 11:20:28.438327+00',
        null
    ),
    (
        'pro_rata_rights_all',
        'Pro Rata Rights (All)',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'd_and_o_insurance',
        'D&O Insurance',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'investor_counsel_fee_cap',
        'Investor Counsel Fee Cap',
        'currency',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'stage_at_entry',
        'Stage at Entry',
        'select',
        null, null, null, null,
        'entry',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'investment_status',
        'Investment Status',
        'select',
        '["Active","Exited"]',
        null, null, null,
        'core',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'event_type',
        'Event Type',
        'text',
        null, null, null, null,
        'core',
        '2026-01-24 23:49:36.264578+00',
        '2026-01-24 23:49:36.264578+00',
        null
    ),
    (
        'investor_parties',
        'Investor Parties',
        'json',
        null, null, null, null,
        'core',
        '2026-01-19 10:10:17.878367+00',
        '2026-01-19 23:09:25.579058+00',
        '{"schema":{"name":{"type":"text","label":"Name","required":true,"placeholder":"Enter party name"},"type":{"type":"select","label":"Type","options":[{"label":"Fund","value":"fund"},{"label":"Trust","value":"trust"},{"label":"Company","value":"company"},{"label":"Individual","value":"individual"},{"label":"Other","value":"other"}],"required":true},"is_self":{"type":"checkbox","label":"Is Self","defaultValue":false}},"itemName":"Investor Party","renderType":"array_object"}'
    ),
    (
        'issuer_pays_investor_counsel_fees',
        'Issuer Pays Investor Counsel Fees',
        'boolean',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'original_issue_price',
        'Original Issue Price',
        'currency',
        null, null, null, null,
        'financials',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    ),
    (
        'major_investor_threshold_shares',
        'Major Investor Threshold Shares',
        'number',
        null, null, null, null,
        'legal',
        '2026-01-19 09:10:10.732724+00',
        '2026-01-19 09:10:10.732724+00',
        null
    )
    ON CONFLICT (field_key) DO UPDATE
SET
  default_label = EXCLUDED.default_label,
  default_data_type = EXCLUDED.default_data_type,
  default_select_options = EXCLUDED.default_select_options,
  default_ui_component_hint = EXCLUDED.default_ui_component_hint,
  default_validation_rules = EXCLUDED.default_validation_rules,
  default_tooltip_text = EXCLUDED.default_tooltip_text,
  category = EXCLUDED.category,
  settings = EXCLUDED.settings;


-- Upsert using field_key instead of master_field_definition_id
WITH incoming AS (
  SELECT *
  FROM (VALUES
    (2::bigint, 'd_and_o_insurance'::text),
    (8::bigint, 'investor_counsel_fee_cap'::text),
    (3::bigint, 'drag_along'::text),
    (2::bigint, 'standard_pro_rata_formulation'::text),
    (2::bigint, 'major_investor_threshold_percent'::text),
    (1::bigint, 'cumulative_dividends'::text),
    (1::bigint, 'pay_to_play'::text),
    (8::bigint, 'shares_purchased'::text),
    (1::bigint, 'liquidation_preference_seniority'::text),
    (8::bigint, 'stage'::text),
    (8::bigint, 'd_and_o_insurance'::text),
    (2::bigint, 'pro_rata_rights_major_investors'::text),
    (1::bigint, 'accruing_dividends'::text),
    (8::bigint, 'option_pool_reserved'::text),
    (3::bigint, 'board_of_directors'::text),
    (5::bigint, 'valuation'::text),
    (1::bigint, 'entity_type'::text),
    (8::bigint, 'closing_date'::text),
    (2::bigint, 'pay_to_play'::text),
    (2::bigint, 'major_investor_threshold_amount'::text),
    (8::bigint, 'current_price_per_unit'::text),
    (4::bigint, 'investors_subject_to_rofr'::text),
    (8::bigint, 'milestone_closings'::text),
    (2::bigint, 'registration_rights_preferred'::text),
    (3::bigint, 'founder_vesting_protocol'::text),
    (1::bigint, 'anti_dilution_rights'::text),
    (1::bigint, 'current_price_per_unit'::text),
    (2::bigint, 'qsbs_covenant_given'::text),
    (8::bigint, 'post_money_at_entry'::text),
    (8::bigint, 'major_investor_threshold_amount'::text),
    (8::bigint, 'subsequent_closing_window_days'::text),
    (3::bigint, 'employee_vesting_protocol'::text),
    (4::bigint, 'rofr_and_cosale_agreement'::text),
    (8::bigint, 'post_money_valuation'::text),
    (1::bigint, 'dividend_seniority'::text),
    (2::bigint, 'major_investor_status'::text),
    (8::bigint, 'required_closing_payments'::text),
    (3::bigint, 'board_observers'::text),
    (8::bigint, 'my_aggregate_cost'::text),
    (2::bigint, 'named_major_investors'::text),
    (1::bigint, 'original_issue_price'::text),
    (8::bigint, 'shares_converted'::text),
    (2::bigint, 'pro_rata_rights_all'::text),
    (2::bigint, 'information_rights_details'::text),
    (8::bigint, 'qsbs_rep_made'::text),
    (9::bigint, 'warrants_outstanding'::text),
    (2::bigint, 'major_investor_threshold_shares'::text),
    (8::bigint, 'major_investor_status'::text),
    (2::bigint, 'information_rights'::text),
    (1::bigint, 'dividend_rate'::text),
    (8::bigint, 'fully_diluted_shares'::text),
    (8::bigint, 'issuer_pays_investor_counsel_fees'::text),
    (8::bigint, 'closing_participants'::text),
    (8::bigint, 'investor_parties'::text),
    (8::bigint, 'option_pool'::text),
    (8::bigint, 'preferred_stock'::text),
    (8::bigint, 'event_type'::text),
    (8::bigint, 'board_representatives'::text),
    (8::bigint, 'closings'::text),
    (8::bigint, 'common_shares'::text),
    (8::bigint, 'effective_date'::text),
    (4::bigint, 'event_type'::text)
  ) AS v(document_type_id, master_field_key)
),
resolved AS (
  -- Map master_field_key -> master_field_definition_id
  SELECT
    i.document_type_id,
    m.id AS master_field_definition_id,
    i.master_field_key
  FROM incoming i
  LEFT JOIN public.master_field_definitions m ON m.field_key = i.master_field_key
)
INSERT INTO public.document_type_fields (
  id,
  document_type_id,
  master_field_definition_id,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid()::uuid,
  r.document_type_id::bigint,
  r.master_field_definition_id::uuid,
  now()::timestamptz,
  now()::timestamptz
FROM resolved r
WHERE r.master_field_definition_id IS NOT NULL
ON CONFLICT (document_type_id, master_field_definition_id) DO NOTHING;