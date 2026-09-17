export type FieldCategory =
  | 'core'
  | 'financials'
  | 'ownership'
  | 'entry'
  | 'legal'
  | 'governance'
  | 'deal_terms'
  | 'cap_table'
  | 'transactions';

export interface GlossaryEntry {
  types: readonly string[];
  label: string;
  tooltip: string | null;
  category: FieldCategory;
  selectOptions?: readonly string[];
}

export const glossaryPrompts: Record<string, GlossaryEntry> = {
  percent_of_issued_shares_via_conversion: {
    types: ['spa'],
    label: '% of Issued Shares via Conversion',
    tooltip: null,
    category: 'ownership',
  },
  percent_of_preferred_shares_held: {
    types: ['spa'],
    label: '% of Preferred Shares Held',
    tooltip: null,
    category: 'ownership',
  },
  agg_liq_pref_ahead_of_me: {
    types: [],
    label: 'Agg Liq Pref Ahead Of Me',
    tooltip: 'Aggregate liquidation preference of all series senior to ours',
    category: 'ownership',
  },
  agg_liq_pref: {
    types: ['coi'],
    label: 'Agg. Liq Pref',
    tooltip: 'Aggregate liquidation preference across all preferred series',
    category: 'financials',
  },
  aggregate_cost: {
    types: ['spa'],
    label: 'Aggregate Cost',
    tooltip: 'Total aggregate cost basis of all shares purchased',
    category: 'financials',
  },
  audited_financial_statements: {
    types: [],
    label: 'Audited Financial Statements',
    tooltip: 'Whether the company provides audited financial statements',
    category: 'financials',
  },
  balance_sheet: {
    types: [],
    label: 'Balance Sheet',
    tooltip: 'Balance sheet data from the most recent period',
    category: 'financials',
  },
  cash_position: {
    types: ['spa'],
    label: 'Cash Position',
    tooltip: 'Select months.',
    category: 'core',
    selectOptions: ['0-3 months', '4-6 months', '7-12 months', '12+ months'],
  },
  capitalization_table: {
    types: [],
    label: 'Capitalization Table',
    tooltip: 'Full capitalization table showing all share classes',
    category: 'financials',
  },
  closing_date: {
    types: [],
    label: 'Closing Date',
    tooltip: null,
    category: 'entry',
  },
  co_investor: {
    types: [],
    label: 'Co-Investor',
    tooltip: null,
    category: 'core',
  },
  common_stock: {
    types: [],
    label: 'Common Stock',
    tooltip: 'Common stock details including authorized and outstanding',
    category: 'ownership',
  },
  contractual_price_per_share: {
    types: [],
    label: 'Contractual Price Per Share',
    tooltip: 'Contractual price per share from the agreement',
    category: 'financials',
  },
  conversion_ratio: {
    types: ['coi'],
    label: 'Conversion Ratio',
    tooltip: 'Conversion ratio of preferred to common stock',
    category: 'financials',
  },
  converting_into_equity_class: {
    types: [],
    label: 'Converting Into Equity Class',
    tooltip: 'Equity class the instrument converts into',
    category: 'ownership',
  },
  corporate_jurisdiction: {
    types: ['coi'],
    label: 'Corporate Jurisdiction',
    tooltip: 'State or jurisdiction of incorporation',
    category: 'core',
  },
  cost: {
    types: [],
    label: 'Cost',
    tooltip: 'Total cost basis of the investment',
    category: 'financials',
  },
  cross_pollination: {
    types: [],
    label: 'Cross Pollination',
    tooltip: 'Whether cross-pollination provisions exist between funds',
    category: 'legal',
  },
  current_price_per_unit: {
    types: ['spa'],
    label: 'Current Price Per Share',
    tooltip: null,
    category: 'financials',
  },
  discount: {
    types: [],
    label: 'Discount',
    tooltip: 'Discount rate applied at conversion',
    category: 'financials',
  },
  effective_price_per_share: {
    types: ['spa'],
    label: 'Effective Price Per Share',
    tooltip: null,
    category: 'financials',
  },
  entity_type: {
    types: ['coi'],
    label: 'Entity Type',
    tooltip: null,
    category: 'core',
  },
  equity_class: {
    types: ['spa'],
    label: 'Equity Class',
    tooltip: null,
    category: 'core',
  },
  equity_financing: {
    types: [],
    label: 'Equity Financing',
    tooltip: 'Total equity financing raised to date',
    category: 'financials',
  },
  equity_financing_new_money: {
    types: ['spa'],
    label: 'Equity Financing New Money',
    tooltip: null,
    category: 'financials',
  },
  founded_year: {
    types: ['coi'],
    label: 'Founded Year',
    tooltip: null,
    category: 'core',
  },
  fully_diluted_ownership_percentage: {
    types: [],
    label: 'Fully Diluted Ownership Percentage',
    tooltip: 'Ownership percentage on a fully diluted basis',
    category: 'ownership',
  },
  fully_diluted_shares: {
    types: ['spa'],
    label: 'Fully Diluted Shares',
    tooltip: null,
    category: 'ownership',
  },
  fund: {
    types: [],
    label: 'Fund',
    tooltip: 'Fund associated with this investment',
    category: 'core',
  },
  funds_recent_closing: {
    types: [],
    label: "Fund's Recent Closing",
    tooltip: null,
    category: 'core',
  },
  funding_round_participating: {
    types: ['spa'],
    label: 'Funding Round Participating',
    tooltip: null,
    category: 'core',
  },
  highest_new_money_price_per_share: {
    types: ['spa'],
    label: 'Highest New Money Price Per Share',
    tooltip: null,
    category: 'financials',
  },
  implied_value: {
    types: [],
    label: 'Implied Value',
    tooltip: null,
    category: 'ownership',
  },
  industry: {
    types: [],
    label: 'Industry',
    tooltip: 'Primary industry classification of the company',
    category: 'core',
  },
  industry_sub_category: {
    types: [],
    label: 'Industry Sub Category',
    tooltip: 'Sub-category within the primary industry',
    category: 'core',
  },
  information_rights: {
    types: ['ira'],
    label: 'Information Rights',
    tooltip: null,
    category: 'legal',
  },
  initial_closing: {
    types: ['spa'],
    label: 'Initial Closing',
    tooltip: null,
    category: 'legal',
  },
  invested_funds: {
    types: [],
    label: 'Invested Funds',
    tooltip: 'Funds that have invested in this company',
    category: 'financials',
  },
  investor: {
    types: [],
    label: 'Investor',
    tooltip: 'Investor name or entity',
    category: 'core',
  },
  investor_counsel_fee_cap: {
    types: ['spa'],
    label: 'Investor Counsel Fee Cap',
    tooltip: null,
    category: 'legal',
  },
  issuer_pays_investor_counsel_fees: {
    types: ['spa'],
    label: 'Issuer Pays Investor Counsel Fees',
    tooltip: null,
    category: 'legal',
  },
  issue_date: {
    types: ['warrant'],
    label: 'Issue Date',
    tooltip:
      'Date the instrument was issued — the operative date stamped on the document at signing',
    category: 'core',
  },
  last_transaction_date: {
    types: [],
    label: 'Last Transaction Date',
    tooltip: null,
    category: 'financials',
  },
  latest_post_money_valuation: {
    types: ['spa'],
    label: 'Latest Post Money Valuation',
    tooltip: null,
    category: 'financials',
  },
  lead_investor: {
    types: [],
    label: 'Lead Investor',
    tooltip: 'Lead investor in the round',
    category: 'core',
  },
  liquidation_price_per_share: {
    types: [],
    label: 'Liquidation Price Per Share',
    tooltip: 'Liquidation price per share based on preference stack',
    category: 'financials',
  },
  major_investor_status: {
    types: ['ira'],
    label: 'Major Investor Status',
    tooltip: null,
    category: 'legal',
  },
  major_investor_by_threshold: {
    types: ['spa'],
    label: 'Major Investor By Threshold',
    tooltip: null,
    category: 'legal',
  },
  major_investor_threshold_amount: {
    types: [],
    label: 'Major Investor Threshold Amount',
    tooltip: null,
    category: 'legal',
  },
  major_investor_threshold_percent: {
    types: [],
    label: 'Major Investor Threshold %',
    tooltip: null,
    category: 'legal',
  },
  major_investor_threshold_shares: {
    types: [],
    label: 'Major Investor Threshold Shares',
    tooltip: null,
    category: 'legal',
  },
  major_investor_threshold_side_letter: {
    types: ['coi'],
    label: 'Major Investor Threshold: Side Letter',
    tooltip:
      'Side letter or management rights language related to major investor threshold',
    category: 'legal',
  },
  milestone_closings: {
    types: ['spa'],
    label: 'Milestone Closings',
    tooltip: null,
    category: 'legal',
  },
  multiple: {
    types: [],
    label: 'Multiple',
    tooltip: null,
    category: 'ownership',
  },
  multiplier: {
    types: [],
    label: 'Multiplier',
    tooltip: 'Liquidation preference multiplier (e.g. 1x, 2x)',
    category: 'financials',
  },
  my_agg_liq_pref: {
    types: [],
    label: 'My Agg Liq Pref',
    tooltip: 'Our aggregate liquidation preference across all series held',
    category: 'ownership',
  },
  my_aggregate_cost: {
    types: ['spa'],
    label: 'My Aggregate Cost',
    tooltip: null,
    category: 'ownership',
  },
  my_entry_cost: {
    types: [],
    label: 'My Entry Cost',
    tooltip: null,
    category: 'entry',
  },
  my_entry_date: {
    types: [],
    label: 'My Entry Date',
    tooltip: null,
    category: 'entry',
  },
  my_fully_diluted_percent: {
    types: [],
    label: 'Fully Diluted %',
    tooltip: null,
    category: 'ownership',
  },
  my_fd_percent_at_entry: {
    types: [],
    label: 'My Fd Percent At Entry',
    tooltip: 'Our fully diluted percentage at time of entry',
    category: 'entry',
  },
  my_liq_pref: {
    types: [],
    label: 'My Liq Pref',
    tooltip: 'Our liquidation preference for the current series',
    category: 'ownership',
  },
  my_shares: {
    types: ['spa'],
    label: 'My Shares',
    tooltip: null,
    category: 'ownership',
  },
  my_total_aggregate_cost: {
    types: ['spa'],
    label: 'My Total Aggregate Cost',
    tooltip: null,
    category: 'ownership',
  },
  my_total_liquidation_preference: {
    types: [],
    label: 'My Total Liquidation Preference',
    tooltip: 'Total liquidation preference across all our holdings',
    category: 'ownership',
  },
  my_total_shares_held: {
    types: [],
    label: 'My Total Shares Held',
    tooltip: 'Total shares we hold across all classes',
    category: 'ownership',
  },
  my_warrant_shares: {
    types: ['warrant'],
    label: 'My Warrant Shares',
    tooltip: 'Shares underlying our warrants',
    category: 'ownership',
  },
  named_major_investors: {
    types: [],
    label: 'Named Major Investors',
    tooltip: null,
    category: 'legal',
  },
  options_outside_of_pool_outstanding: {
    types: ['spa'],
    label: 'Options Outside of Pool Outstanding',
    tooltip: null,
    category: 'ownership',
  },
  original_issue_price: {
    types: ['coi'],
    label: 'Original Issue Price',
    tooltip: null,
    category: 'financials',
  },
  outstanding_and_reserved_options: {
    types: ['spa'],
    label: 'Outstanding and Reserved Options',
    tooltip: null,
    category: 'ownership',
  },
  participating: {
    types: [],
    label: 'Participating',
    tooltip: 'Whether the preferred stock has participation rights',
    category: 'legal',
  },
  portfolio_company: {
    types: ['coi'],
    label: 'Portfolio Company',
    tooltip: 'Name of the portfolio company',
    category: 'core',
  },
  post_money_at_entry: {
    types: ['spa'],
    label: 'Post Money at Entry',
    tooltip: null,
    category: 'entry',
  },
  post_money_valuation: {
    types: [],
    label: 'Post Money Valuation',
    tooltip: null,
    category: 'financials',
  },
  pre_money_valuation: {
    types: [],
    label: 'Pre Money Valuation',
    tooltip: 'Pre-money valuation of the company in this round',
    category: 'financials',
  },
  preference_order: {
    types: ['coi'],
    label: 'Preference Order',
    tooltip: 'Liquidation preference priority order',
    category: 'financials',
  },
  preferred_stock_all_classes: {
    types: [],
    label: 'Preferred Stock All Classes',
    tooltip: 'Details of all preferred stock classes',
    category: 'ownership',
  },
  price_per_share: {
    types: ['spa', 'warrant'],
    label: 'Price Per Share',
    tooltip: null,
    category: 'financials',
  },
  pro_rata_rights_all: {
    types: ['ira'],
    label: 'Pro Rata Rights (All)',
    tooltip: null,
    category: 'legal',
  },
  qsbs_covenant_given: {
    types: ['ira'],
    label: 'QSBS Covenant Given',
    tooltip: null,
    category: 'legal',
  },
  qsbs_rep_made: {
    types: ['spa'],
    label: 'QSBS Rep Made',
    tooltip: null,
    category: 'legal',
  },
  required_closing_payments: {
    types: ['spa'],
    label: 'Required Closing Payments',
    tooltip: null,
    category: 'legal',
  },
  realized_proceeds: {
    types: [],
    label: 'Realized Proceeds',
    tooltip: null,
    category: 'ownership',
  },
  shares: {
    types: ['warrant'],
    label: 'Shares',
    tooltip: 'Number of shares subject to this warrant',
    category: 'ownership',
  },
  shares_converted: {
    types: ['spa'],
    label: 'Shares Converted',
    tooltip: null,
    category: 'ownership',
  },
  shares_held: {
    types: ['warrant', 'coi'],
    label: 'Shares Held',
    tooltip: 'Number of shares held — computed/aggregated',
    category: 'ownership',
  },
  shares_held_as_fully_diluted_percent: {
    types: ['spa'],
    label: 'Shares Held as Fully-Diluted %',
    tooltip: null,
    category: 'ownership',
  },
  shares_purchased: {
    types: ['spa'],
    label: 'Shares Purchased',
    tooltip: null,
    category: 'ownership',
  },
  stage: {
    types: ['spa', 'voting', 'ira', 'rofr_cosale', 'coi'],
    label: 'Investment Stage',
    tooltip: null,
    category: 'core',
    selectOptions: [
      'Pre-Seed',
      'Seed',
      'Series A',
      'Series B',
      'Series C',
      'Series D',
      'Series E',
      'Series F',
      'Series G',
      'Dissolved',
      'Acquired',
    ],
  },
  stage_at_entry: {
    types: [],
    label: 'Stage at Entry',
    tooltip: null,
    category: 'entry',
  },
  state_of_notice: {
    types: ['spa'],
    label: 'State of Notice',
    tooltip: null,
    category: 'legal',
  },
  statement_of_income_cash_flows: {
    types: [],
    label: 'Statement Of Income Cash Flows',
    tooltip: 'Income and cash flow statement data',
    category: 'financials',
  },
  statement_of_stockholders_equity: {
    types: [],
    label: 'Statement Of Stockholders Equity',
    tooltip: "Stockholders' equity statement data",
    category: 'financials',
  },
  subsequent_closing_window_days: {
    types: ['spa'],
    label: 'Subsequent Closing Window (Days)',
    tooltip: null,
    category: 'legal',
  },
  total_aggregate_liq_pref: {
    types: ['spa'],
    label: 'Total Aggregate Liquidation Preference',
    tooltip: null,
    category: 'financials',
  },
  total_liquidation_preference: {
    types: [],
    label: 'Total Liquidation Preference',
    tooltip: 'Total liquidation preference across all preferred classes',
    category: 'financials',
  },
  total_new_money: {
    types: ['spa'],
    label: 'Total New Money',
    tooltip: null,
    category: 'financials',
  },
  total_new_money_invested: {
    types: ['spa'],
    label: 'Total New Money Invested',
    tooltip: null,
    category: 'financials',
  },
  total_new_money_shares: {
    types: ['spa'],
    label: 'Total New Money Shares',
    tooltip: null,
    category: 'financials',
  },
  total_shares: {
    types: ['spa'],
    label: 'Total Shares',
    tooltip: null,
    category: 'ownership',
  },
  unrealized_gains_losses: {
    types: [],
    label: 'Unrealized Gains Losses',
    tooltip: 'Unrealized gains or losses on current holdings',
    category: 'financials',
  },
  url: {
    types: [],
    label: 'Url',
    tooltip: 'Company website URL',
    category: 'core',
  },
  valuation_cap: {
    types: ['safe', 'cpn'],
    label: 'Valuation Cap',
    tooltip: 'Valuation cap for SAFE conversion (null if uncapped)',
    category: 'financials',
  },
  warrants_outstanding: {
    types: ['warrant'],
    label: 'Warrants Outstanding',
    tooltip: null,
    category: 'ownership',
  },
  investor_parties: {
    types: ['spa', 'ira', 'side_letter', 'safe', 'cpn'],
    label: 'Investor Parties',
    tooltip: null,
    category: 'core',
  },
  common_shares: {
    types: ['spa'],
    label: 'Common Shares',
    tooltip: null,
    category: 'financials',
  },
  option_pool: {
    types: ['spa'],
    label: 'Option Pool',
    tooltip: null,
    category: 'ownership',
  },
  option_pool_reserved: {
    types: ['spa'],
    label: 'Option Pool Reserved',
    tooltip: null,
    category: 'ownership',
  },
  preferred_stock: {
    types: ['spa'],
    label: 'Preferred Stock',
    tooltip: null,
    category: 'financials',
  },
  event_type: {
    types: ['spa'],
    label: 'Event Type',
    tooltip: null,
    category: 'core',
  },
  effective_date: {
    types: [
      'ira',
      'rofr_cosale',
      'voting',
      'safe',
      'cpn',
      'spa',
      'coi',
      'secondary_purchase',
    ],
    label: 'Effective Date',
    tooltip: null,
    category: 'core',
  },
  currency: {
    types: [],
    label: 'Currency',
    tooltip: 'Currency of the transaction or instrument',
    category: 'core',
  },
  closings: {
    types: ['spa'],
    label: 'Closings',
    tooltip: null,
    category: 'financials',
  },
  closing_participants: {
    types: ['spa'],
    label: 'Closing Participants',
    tooltip: null,
    category: 'financials',
  },
  board_representatives: {
    types: ['spa'],
    label: 'Board of Representatives',
    tooltip: null,
    category: 'legal',
  },
  current_price_per_share: {
    types: [],
    label: 'Current Price Per Share',
    tooltip: 'Current price per share based on latest transaction',
    category: 'financials',
  },
  investor_rights: {
    types: ['side_letter'],
    label: 'Investor Rights',
    tooltip:
      'Structured list of all investor rights explicitly granted in the document text',
    category: 'legal',
  },
  mfn_clause: {
    types: ['side_letter'],
    label: 'MFN Clause',
    tooltip:
      'Most-favoured-nation clause — company must offer better terms if later SAFE is issued on better terms',
    category: 'legal',
  },
  co_investment_right: {
    types: ['side_letter'],
    label: 'Co-Investment Right',
    tooltip: 'Co-investment rights beyond standard pro-rata participation',
    category: 'legal',
  },
  enhanced_information_right: {
    types: ['side_letter'],
    label: 'Enhanced Information Right',
    tooltip:
      'Enhanced information rights or management rights beyond standard quarterly/annual reporting',
    category: 'legal',
  },
  regulatory_accommodations: {
    types: ['side_letter'],
    label: 'Regulatory Accommodations',
    tooltip:
      'Regulatory accommodation provisions including ERISA, FOIA, sovereign wealth fund, tax, and ESG provisions',
    category: 'legal',
  },
  confidentiality_obligations: {
    types: ['side_letter'],
    label: 'Confidentiality Obligations',
    tooltip:
      'Confidentiality obligations covering existence, terms, permitted disclosures, and MFN carve-outs',
    category: 'legal',
  },
  conflict_resolution: {
    types: ['side_letter'],
    label: 'Conflict Resolution',
    tooltip:
      'Conflict resolution provisions determining which document controls, amendment requirements, and survivability',
    category: 'legal',
  },
  closing_conditions: {
    types: ['side_letter'],
    label: 'Closing Conditions',
    tooltip:
      'Conditions to closing with responsible party, waivability, and investor discretion flags',
    category: 'legal',
  },
  covenants_and_post_closing_obligations: {
    types: ['coi'],
    label: 'Covenants & Post-Closing Obligations',
    tooltip: 'Pre-closing and post-closing covenants and obligations',
    category: 'legal',
  },
  rep_and_warranty_matrix: {
    types: ['coi'],
    label: 'Rep & Warranty Matrix',
    tooltip:
      'Company representations and warranties with materiality and knowledge qualifiers',
    category: 'legal',
  },
  indemnification_terms: {
    types: ['side_letter'],
    label: 'Indemnification Terms',
    tooltip:
      'Indemnification terms including survival period, basket, cap, and fraud carve-out',
    category: 'legal',
  },
  ts_valuation_deal_size: {
    types: ['term_sheet'],
    label: 'Valuation & Deal Size',
    tooltip:
      'Pre-money valuation, round size, and implied ownership from the term sheet',
    category: 'deal_terms',
  },
  ts_instrument_type: {
    types: ['term_sheet'],
    label: 'Instrument Type',
    tooltip: 'Type of instrument offered in the term sheet',
    category: 'deal_terms',
  },
  ts_liquidation_preference: {
    types: ['term_sheet'],
    label: 'Liquidation Preference',
    tooltip: 'Liquidation preference terms as stated in the term sheet',
    category: 'deal_terms',
  },
  ts_anti_dilution: {
    types: ['term_sheet'],
    label: 'Anti-Dilution',
    tooltip: 'Anti-dilution protection type and mechanics from the term sheet',
    category: 'deal_terms',
  },
  ts_investor_rights: {
    types: ['term_sheet'],
    label: 'Investor Rights',
    tooltip: 'Investor rights and protections outlined in the term sheet',
    category: 'deal_terms',
  },
  ts_founder_terms: {
    types: ['term_sheet'],
    label: 'Founder Terms',
    tooltip:
      'Founder-specific terms including vesting, non-compete, and IP assignment',
    category: 'deal_terms',
  },
  coi_authorized_share_structure: {
    types: ['coi'],
    label: 'Authorized Share Structure',
    tooltip:
      'Total authorized shares broken down by common and preferred, and whether blank check preferred authorization exists',
    category: 'ownership',
  },
  coi_preferred_terms_by_series: {
    types: ['coi'],
    label: 'Preferred Terms by Series',
    tooltip:
      'Per-series preferred stock terms — authorized shares, OIP, liquidation preference, conversion ratio, dividends, voting rights',
    category: 'legal',
  },
  coi_liquidation_waterfall: {
    types: ['coi'],
    label: 'Liquidation Waterfall',
    tooltip:
      'Modeled proceeds distribution per share class — priority rank, preference amount, participation, participation cap',
    category: 'financials',
  },
  coi_protective_provisions: {
    types: ['coi'],
    label: 'Protective Provisions',
    tooltip:
      'Structured list of each protective provision (veto right) with consent requirements and category',
    category: 'legal',
  },
  coi_anti_dilution: {
    types: ['coi'],
    label: 'Anti-Dilution Provisions',
    tooltip:
      'Anti-dilution protection per preferred series — type (broad-based WA / narrow-based / full ratchet), formula, and excluded issuances',
    category: 'legal',
  },
  coi_restated_effective_date: {
    types: ['coi'],
    label: 'Restated Effective Date',
    tooltip:
      'Effective date of the most recent amendment or restatement — look for filing stamps or "effective as of" language',
    category: 'legal',
  },
  coi_restated_amendments_incorporated: {
    types: ['coi'],
    label: 'Prior Amendments Incorporated',
    tooltip:
      'List of prior amendments or certificates being restated or incorporated in this document',
    category: 'legal',
  },
  coi_conversion_mechanics: {
    types: ['coi'],
    label: 'Conversion Mechanics',
    tooltip:
      'Conversion mechanics for each series — optional conversion ratio, mandatory/automatic triggers (IPO threshold, investor vote), and conversion price adjustments',
    category: 'legal',
  },
  coi_redemption_rights: {
    types: ['coi'],
    label: 'Redemption Rights',
    tooltip:
      'Whether redemption rights exist and their terms — start date, price formula, investor vote requirement. Flag if present.',
    category: 'legal',
  },
  coi_dividends: {
    types: ['coi'],
    label: 'Dividend Provisions',
    tooltip:
      'Dividend rights per series — cumulative vs non-cumulative, rate, frequency, participation with common. Cumulative dividends create accruing obligations.',
    category: 'legal',
  },
  coi_pay_to_play: {
    types: ['coi'],
    label: 'Pay-to-Play Provisions',
    tooltip:
      'Pay-to-play provisions — forces existing investors to participate in future rounds or face conversion. Flag if present.',
    category: 'legal',
  },
  ira_registration_rights: {
    types: ['ira'],
    label: 'Registration Rights',
    tooltip:
      'Demand, S-3, and piggyback registration rights — threshold, number of demands, lock-up, expense allocation',
    category: 'legal',
  },
  ira_governance_provisions: {
    types: ['ira'],
    label: 'Governance Provisions',
    tooltip:
      'Board composition, protective provisions (investor veto rights), and consent thresholds',
    category: 'legal',
  },
  ira_drag_along_co_sale: {
    types: ['ira'],
    label: 'Drag-Along & Co-Sale',
    tooltip:
      'Drag-along threshold and common approval requirement, co-sale right holders, notice period, and exempt transfers',
    category: 'legal',
  },
  va_parties_scope: {
    types: ['voting'],
    label: 'Parties & Scope',
    tooltip:
      'All stockholder parties, share classes subject to the agreement, whether the company is a party, effective date, and governing law',
    category: 'core',
  },
  va_board_composition: {
    types: ['voting'],
    label: 'Board Composition',
    tooltip:
      'Total board seats, designation rights by preferred series and common, independent seats, observer rights, vacancy and removal mechanics',
    category: 'legal',
  },
  va_drag_along: {
    types: ['voting'],
    label: 'Drag-Along Provisions',
    tooltip:
      'Drag-along threshold, matters subject to drag-along, stockholder obligations, minimum price and pro rata proceeds conditions, and exemptions',
    category: 'legal',
  },
  va_voting_obligations: {
    types: ['voting'],
    label: 'Voting Obligations',
    tooltip:
      'Directed vote matters, proxy grant details (scope, irrevocability, holder), and written consent obligations',
    category: 'legal',
  },
  va_transfer_restrictions: {
    types: ['voting'],
    label: 'Transfer Restrictions',
    tooltip:
      'Whether shares remain subject on transfer, joinder requirements, permitted transfers without joinder, certificate legend, and unauthorized transfer remedy',
    category: 'legal',
  },
  va_termination: {
    types: ['voting'],
    label: 'Termination & Amendments',
    tooltip:
      'Termination triggers, surviving obligations, amendment threshold, and whether company consent is required to amend',
    category: 'legal',
  },
  safe_type_identification: {
    types: ['safe'],
    label: 'SAFE Type & Parties',
    tooltip:
      'Pre-money vs post-money classification using the conversion formula, discount rate presence, and explicit labels; plus governing form, version year, and party names',
    category: 'core',
  },
  safe_conversion_triggers: {
    types: ['safe'],
    label: 'Conversion Triggers',
    tooltip:
      'Conversion mechanics for each trigger event: equity financing, liquidity event, dissolution, and IPO',
    category: 'legal',
  },
  safe_mfn_pro_rata: {
    types: ['safe'],
    label: 'MFN & Pro Rata',
    tooltip:
      'MFN clause, pro rata participation right and amount, and any non-standard provisions deviating from YC template',
    category: 'legal',
  },
  safe_investment_amount: {
    types: ['safe'],
    label: 'Investment Amount & Date',
    tooltip:
      'Purchase/investment amount, SAFE agreement date, and investor legal name',
    category: 'financials',
  },
  cpn_core_debt_terms: {
    types: ['cpn'],
    label: 'Core Debt Terms',
    tooltip:
      'Principal amount, interest rate and type, accrual basis, maturity date, and payment schedule',
    category: 'financials',
  },
  cpn_maturity_treatment: {
    types: ['cpn'],
    label: 'Maturity Treatment',
    tooltip:
      'What happens at maturity: repayment (with premium?), automatic conversion, extension, or investor election',
    category: 'legal',
  },
  cpn_security_seniority: {
    types: ['cpn'],
    label: 'Security & Seniority',
    tooltip:
      'Secured/unsecured status, lien position, subordination terms, cross-default provisions, and events of default with cure periods',
    category: 'legal',
  },
  cpn_change_of_control: {
    types: ['cpn'],
    label: 'Change of Control',
    tooltip:
      'CoC treatment (repayment multiple, conversion, or investor election), and the definition of change of control',
    category: 'legal',
  },
  wt_exercise_mechanics: {
    types: ['warrant'],
    label: 'Exercise Mechanics',
    tooltip:
      'Exercise mechanics from the Warrant including methods, formula, and notice requirements.',
    category: 'legal',
  },
  wt_expiration: {
    types: ['warrant'],
    label: 'Expiration Terms',
    tooltip:
      'Expiration terms from the Warrant including dates, term, and accelerating events.',
    category: 'legal',
  },
  wt_anti_dilution_adjustments: {
    types: ['warrant'],
    label: 'Anti-Dilution Adjustments',
    tooltip: 'Anti-dilution and adjustment provisions from the Warrant.',
    category: 'legal',
  },
  wt_change_of_control: {
    types: ['warrant'],
    label: 'Warrant Change of Control',
    tooltip: 'Change of control provisions from the Warrant.',
    category: 'legal',
  },
  sub_investor_details: {
    types: ['subscription'],
    label: 'Investor Details',
    tooltip:
      'Subscribing investor legal name, entity type, jurisdiction, subscription amount, wire instructions, and signatory',
    category: 'core',
  },
  sub_securities_purchased: {
    types: ['subscription'],
    label: 'Securities Purchased',
    tooltip:
      'Share class, series, number of shares, price per share, total purchase price, closing date, and verification method',
    category: 'core',
  },
  sub_accreditation: {
    types: ['subscription'],
    label: 'Accreditation Representations',
    tooltip:
      'Accredited investor status and basis, qualified purchaser status, and non-US person representation',
    category: 'legal',
  },
  sub_closing_mechanics: {
    types: ['subscription'],
    label: 'Closing Mechanics',
    tooltip:
      'Scheduled closing date, closing conditions, investor-specific conditions, and wire transfer deadline',
    category: 'legal',
  },
  kiss_type: {
    types: ['kiss'],
    label: 'KISS Type',
    tooltip: null,
    category: 'legal',
    selectOptions: ['Debt', 'Equity'],
  },
  kiss_economic_terms: {
    types: ['kiss'],
    label: 'Economic Terms',
    tooltip:
      'Investment amount, valuation cap, discount rate, and (for Debt KISS) interest rate and maturity date',
    category: 'financials',
  },
  kiss_conversion_triggers: {
    types: ['kiss'],
    label: 'Conversion Triggers',
    tooltip:
      'Conversion mechanics for qualified financing, corporate transaction, IPO, and maturity (Debt KISS only)',
    category: 'legal',
  },
  kiss_mfn_pro_rata: {
    types: ['kiss'],
    label: 'MFN & Pro Rata',
    tooltip:
      'MFN clause, pro rata participation right, and Major Investor threshold',
    category: 'legal',
  },
  pn_principal_interest: {
    types: ['promissory_note'],
    label: 'Principal & Interest',
    tooltip: null,
    category: 'financials',
  },
  pn_maturity_repayment: {
    types: ['promissory_note'],
    label: 'Maturity & Repayment',
    tooltip: null,
    category: 'legal',
  },
  pn_security_collateral: {
    types: ['promissory_note'],
    label: 'Security & Collateral',
    tooltip: null,
    category: 'legal',
  },
  pn_events_of_default: {
    types: ['promissory_note'],
    label: 'Events of Default',
    tooltip: null,
    category: 'legal',
  },
  pn_conversion_terms: {
    types: ['promissory_note'],
    label: 'Conversion Terms',
    tooltip: null,
    category: 'legal',
  },
  rofr_covered_shares: {
    types: ['rofr_cosale'],
    label: 'ROFR Covered Shares',
    tooltip:
      'Which shareholders and share classes are subject to ROFR, whether preferred is included, and the ROFR priority order between company and investors',
    category: 'legal',
  },
  rofr_exercise_mechanics: {
    types: ['rofr_cosale'],
    label: 'ROFR Exercise Mechanics',
    tooltip:
      'Transfer notice requirements, company and investor exercise periods, over-allotment rights, price matching, and partial-exercise rules',
    category: 'legal',
  },
  rofr_transfer_exemptions: {
    types: ['rofr_cosale'],
    label: 'ROFR Transfer Exemptions',
    tooltip:
      'Transfers exempt from ROFR and co-sale obligations, including whether the transferee remains subject to those obligations',
    category: 'legal',
  },
  rofr_co_sale_provisions: {
    types: ['rofr_cosale'],
    label: 'Co-Sale Provisions',
    tooltip:
      'Co-sale right holders, participation percentage, pro rata basis, notice period, whether it is an obligation or right, and the remedy for violation',
    category: 'legal',
  },
  rofr_termination: {
    types: ['rofr_cosale'],
    label: 'ROFR Termination',
    tooltip:
      'Whether agreement terminates on IPO, change of control, or a specific date; surviving obligations; and the amendment threshold',
    category: 'legal',
  },
  ma_transaction_structure: {
    types: ['merger_agreement'],
    label: 'Transaction Structure',
    tooltip: null,
    category: 'core',
  },
  ma_deal_economics: {
    types: ['merger_agreement'],
    label: 'Deal Economics',
    tooltip: null,
    category: 'financials',
  },
  ma_closing_conditions: {
    types: ['merger_agreement'],
    label: 'Closing Conditions',
    tooltip: null,
    category: 'legal',
  },
  ma_equity_treatment: {
    types: ['merger_agreement'],
    label: 'Equity Award Treatment',
    tooltip: null,
    category: 'legal',
  },
  ma_indemnification_rw: {
    types: ['merger_agreement'],
    label: 'Indemnification & R&W',
    tooltip: null,
    category: 'legal',
  },
  ma_employee_matters: {
    types: ['merger_agreement'],
    label: 'Employee Matters',
    tooltip: null,
    category: 'legal',
  },
  lot_shareholder_identity: {
    types: ['letter_of_transmittal'],
    label: 'Shareholder Identity',
    tooltip: null,
    category: 'core',
  },
  lot_shares_surrendered: {
    types: ['letter_of_transmittal'],
    label: 'Shares Surrendered',
    tooltip: null,
    category: 'core',
  },
  lot_consideration_election: {
    types: ['letter_of_transmittal'],
    label: 'Consideration Election',
    tooltip: null,
    category: 'financials',
  },
  lot_wire_instructions: {
    types: ['letter_of_transmittal'],
    label: 'Wire Instructions',
    tooltip: null,
    category: 'financials',
  },
  lot_representations: {
    types: ['letter_of_transmittal'],
    label: 'Representations',
    tooltip: null,
    category: 'legal',
  },
  sp_transaction_economics: {
    types: ['secondary_purchase'],
    label: 'Transaction Economics',
    tooltip: null,
    category: 'financials',
  },
  sp_rofr_waiver: {
    types: ['secondary_purchase'],
    label: 'ROFR Waiver',
    tooltip: null,
    category: 'legal',
  },
  sp_seller_representations: {
    types: ['secondary_purchase'],
    label: 'Seller Representations',
    tooltip: null,
    category: 'legal',
  },
  sp_buyer_representations: {
    types: ['secondary_purchase'],
    label: 'Buyer Representations',
    tooltip: null,
    category: 'legal',
  },
  sp_post_closing: {
    types: ['secondary_purchase'],
    label: 'Post-Closing Obligations',
    tooltip: null,
    category: 'legal',
  },
  soi_metadata: {
    types: ['schedule_of_investments'],
    label: 'SOI Metadata',
    tooltip: null,
    category: 'core',
  },
  soi_cost_fair_value: {
    types: ['schedule_of_investments'],
    label: 'Cost & Fair Value',
    tooltip: null,
    category: 'financials',
  },
  soi_instrument_details: {
    types: ['schedule_of_investments'],
    label: 'Instrument Details',
    tooltip: null,
    category: 'financials',
  },
  soi_valuation_methodology: {
    types: ['schedule_of_investments'],
    label: 'Valuation Methodology',
    tooltip: null,
    category: 'financials',
  },
  soi_fund_aggregates: {
    types: ['schedule_of_investments'],
    label: 'Fund Aggregates',
    tooltip: null,
    category: 'financials',
  },
  soi_exits: {
    types: ['schedule_of_investments'],
    label: 'Realized Exits',
    tooltip: null,
    category: 'financials',
  },
  sc_issuance_details: {
    types: ['share_certificate'],
    label: 'Issuance Details',
    tooltip: null,
    category: 'core',
  },
  sc_authorized_signatures: {
    types: ['share_certificate'],
    label: 'Authorized Signatures',
    tooltip: null,
    category: 'legal',
  },
  sc_legends: {
    types: ['share_certificate'],
    label: 'Share Legends',
    tooltip: null,
    category: 'legal',
  },
  sc_cap_table_cross_ref: {
    types: ['share_certificate'],
    label: 'Cap Table Cross-Reference',
    tooltip: null,
    category: 'legal',
  },
  ia_deal_economics: {
    types: ['investment_agreement'],
    label: 'Deal Economics',
    tooltip: null,
    category: 'financials',
  },
  ia_warranties_disclosure: {
    types: ['investment_agreement'],
    label: 'Warranties & Disclosure',
    tooltip: null,
    category: 'legal',
  },
  ia_governance_provisions: {
    types: ['investment_agreement'],
    label: 'Governance Provisions',
    tooltip: null,
    category: 'legal',
  },
  ia_investor_protections: {
    types: ['investment_agreement'],
    label: 'Investor Protections',
    tooltip: null,
    category: 'legal',
  },
  ia_warranty_limitations: {
    types: ['investment_agreement'],
    label: 'Warranty Limitations',
    tooltip: null,
    category: 'legal',
  },
  amd_original_document: {
    types: ['amendment'],
    label: 'Original Document',
    tooltip:
      'Original document name, date, parties, amendment number, effective date, and amendment type',
    category: 'core',
  },
  amd_changed_provisions: {
    types: ['amendment'],
    label: 'Changed Provisions',
    tooltip:
      'All provisions being amended, deleted, or added with section reference, change type, and original/amended language',
    category: 'legal',
  },
  amd_consent_threshold: {
    types: ['amendment'],
    label: 'Consent Threshold',
    tooltip:
      'Required consent threshold, consenting parties, shares voting and outstanding, percentage achieved, and whether threshold is met',
    category: 'legal',
  },
  amd_economic_impact: {
    types: ['amendment'],
    label: 'Economic Impact',
    tooltip:
      'Changed economic terms with before/after values, directional impact, and cap table effects',
    category: 'legal',
  },
  amd_related_amendments: {
    types: ['amendment'],
    label: 'Related Amendments',
    tooltip:
      'Referenced documents, confirmed amendments, and documents that should have been amended simultaneously',
    category: 'legal',
  },
  jnd_underlying_agreement: {
    types: ['joinder'],
    label: 'Underlying Agreement',
    tooltip: null,
    category: 'core',
  },
  jnd_scope_obligations: {
    types: ['joinder'],
    label: 'Scope of Obligations',
    tooltip: null,
    category: 'legal',
  },
  jnd_joining_capacity: {
    types: ['joinder'],
    label: 'Joining Capacity',
    tooltip: null,
    category: 'legal',
  },
  jnd_trigger_context: {
    types: ['joinder'],
    label: 'Trigger Context',
    tooltip: null,
    category: 'legal',
  },
  jnd_authorization: {
    types: ['joinder'],
    label: 'Authorization',
    tooltip: null,
    category: 'legal',
  },
  ct_round_status: {
    types: ['cap_table'],
    label: 'Round Status',
    tooltip: 'Current round status and key metrics from the cap table',
    category: 'financials',
  },
  ct_shareholders: {
    types: ['cap_table'],
    label: 'Shareholders',
    tooltip: 'Shareholder listing with share counts and ownership percentages',
    category: 'financials',
  },
  ct_option_pool_details: {
    types: ['cap_table'],
    label: 'Option Pool Details',
    tooltip: 'Option pool size, utilization, and remaining availability',
    category: 'financials',
  },
  ct_round_history: {
    types: ['cap_table'],
    label: 'Round History',
    tooltip:
      'Historical round data including dates, prices, and amounts raised',
    category: 'financials',
  },
  ct_waterfall_analysis: {
    types: ['cap_table'],
    label: 'Waterfall Analysis',
    tooltip:
      'Proceeds distribution analysis across share classes at various exit values',
    category: 'financials',
  },
  pd_market_sizing: {
    types: ['pitch_deck'],
    label: 'Market Sizing',
    tooltip: 'Total addressable market, serviceable market, and market growth',
    category: 'deal_terms',
  },
  pd_traction_metrics: {
    types: ['pitch_deck'],
    label: 'Traction Metrics',
    tooltip: 'Key traction metrics including revenue, users, and growth rates',
    category: 'deal_terms',
  },
  pd_fundraise_details: {
    types: ['pitch_deck'],
    label: 'Fundraise Details',
    tooltip: 'Fundraise target, use of proceeds, and round terms',
    category: 'deal_terms',
  },
  pd_team: {
    types: ['pitch_deck'],
    label: 'Team',
    tooltip: 'Key team members, backgrounds, and roles',
    category: 'deal_terms',
  },
  pd_financial_projections: {
    types: ['pitch_deck'],
    label: 'Financial Projections',
    tooltip: 'Revenue, expense, and cash flow projections',
    category: 'deal_terms',
  },
  dd_data_room_structure: {
    types: ['due_diligence_package'],
    label: 'Data Room Structure',
    tooltip: 'Structure and completeness of the data room',
    category: 'deal_terms',
  },
  dd_financial_data: {
    types: ['due_diligence_package'],
    label: 'Financial Data',
    tooltip: 'Financial data quality and completeness in due diligence',
    category: 'deal_terms',
  },
  dd_material_contracts: {
    types: ['due_diligence_package'],
    label: 'Material Contracts',
    tooltip: 'Material contracts identified during due diligence review',
    category: 'deal_terms',
  },
  dd_ip_ownership: {
    types: ['due_diligence_package'],
    label: 'IP Ownership',
    tooltip: 'Intellectual property ownership and assignment status',
    category: 'deal_terms',
  },
  dd_employee_equity: {
    types: ['due_diligence_package'],
    label: 'Employee Equity',
    tooltip: 'Employee equity grants and option pool utilization',
    category: 'deal_terms',
  },
  dd_litigation_compliance: {
    types: ['due_diligence_package'],
    label: 'Litigation & Compliance',
    tooltip: 'Litigation history and compliance status from due diligence',
    category: 'deal_terms',
  },
  vd_facility_structure: {
    types: ['venture_debt'],
    label: 'Facility Structure',
    tooltip:
      'Venture debt facility structure including tranches and draw periods',
    category: 'financials',
  },
  vd_cost_of_capital: {
    types: ['venture_debt'],
    label: 'Cost of Capital',
    tooltip:
      'All-in cost of capital including interest rate, fees, and warrant coverage',
    category: 'financials',
  },
  vd_warrant_coverage: {
    types: ['venture_debt'],
    label: 'Warrant Coverage',
    tooltip:
      'Warrant coverage terms including coverage percentage and exercise price',
    category: 'financials',
  },
  vd_financial_covenants: {
    types: ['venture_debt'],
    label: 'Financial Covenants',
    tooltip: 'Financial covenants required under the venture debt facility',
    category: 'financials',
  },
  vd_negative_covenants: {
    types: ['venture_debt'],
    label: 'Negative Covenants',
    tooltip:
      'Negative covenants restricting company actions under the facility',
    category: 'financials',
  },
  vd_prepayment_mechanics: {
    types: ['venture_debt'],
    label: 'Prepayment Mechanics',
    tooltip: 'Prepayment terms, penalties, and early repayment mechanics',
    category: 'financials',
  },
  lpa_fund_economics: {
    types: ['lpa'],
    label: 'Fund Economics',
    tooltip:
      'Management fee, carried interest, and fund economics from the LPA',
    category: 'deal_terms',
  },
  lpa_capital_calls: {
    types: ['lpa'],
    label: 'Capital Calls',
    tooltip: 'Capital call mechanics, notice periods, and default remedies',
    category: 'deal_terms',
  },
  lpa_investment_restrictions: {
    types: ['lpa'],
    label: 'Investment Restrictions',
    tooltip: 'Investment restrictions and concentration limits from the LPA',
    category: 'deal_terms',
  },
  lpa_key_person: {
    types: ['lpa'],
    label: 'Key Person',
    tooltip: 'Key person provisions including trigger events and consequences',
    category: 'deal_terms',
  },
  lpa_governance: {
    types: ['lpa'],
    label: 'Governance',
    tooltip:
      'LP governance rights including LPAC composition and advisory committee',
    category: 'deal_terms',
  },
  lpa_distribution_waterfall: {
    types: ['lpa'],
    label: 'Distribution Waterfall',
    tooltip:
      'Distribution waterfall including preferred return, catch-up, and carry split',
    category: 'deal_terms',
  },
  share_class: {
    types: ['spa'],
    label: 'Share Class',
    tooltip: null,
    category: 'ownership',
  },
  number_of_shares: {
    types: ['spa'],
    label: 'Number of Shares',
    tooltip: null,
    category: 'ownership',
  },
  representations_and_warranties: {
    types: ['spa'],
    label: 'Representations & Warranties',
    tooltip:
      'JSON array of company reps with materiality and knowledge qualifiers',
    category: 'legal',
  },
  conditions_to_closing: {
    types: ['spa'],
    label: 'Conditions to Closing',
    tooltip: 'List of conditions that must be satisfied before closing',
    category: 'legal',
  },
  indemnification_survival_period: {
    types: ['spa'],
    label: 'Indemnification Survival Period (Months)',
    tooltip:
      'Number of months reps and warranties survive post-closing for indemnification purposes',
    category: 'legal',
  },
  basket_type: {
    types: ['spa'],
    label: 'Indemnification Basket Type',
    tooltip:
      'Type of indemnification basket — Deductible means losses must exceed the basket before any recovery is owed; First Dollar means all losses from the first dollar are recoverable once the basket threshold is crossed',
    category: 'legal',
    selectOptions: ['Deductible', 'First Dollar'],
  },
  indemnification_cap: {
    types: ['spa'],
    label: 'Indemnification Cap',
    tooltip:
      'Maximum aggregate indemnification liability of the indemnifying party',
    category: 'legal',
  },
  fraud_carve_out: {
    types: ['spa'],
    label: 'Fraud Carved Out from Cap',
    tooltip: 'Whether fraud claims are excluded from the indemnification cap',
    category: 'legal',
  },
  survival_period_months_fundamental_reps: {
    types: ['spa'],
    label: 'Fundamental Reps Survival Period (Months)',
    tooltip:
      'Default survival period in months for fundamental representations and warranties',
    category: 'legal',
  },
  pre_closing_covenants: {
    types: ['spa'],
    label: 'Pre-Closing Covenants',
    tooltip:
      'Operating restrictions on the company between signing and closing',
    category: 'legal',
  },
  post_closing_covenants: {
    types: ['spa'],
    label: 'Post-Closing Covenants',
    tooltip: 'Obligations and restrictions that survive the closing',
    category: 'legal',
  },
  ds_structure: {
    types: ['disclosure_schedule'],
    label: 'Disclosure Schedule Structure',
    tooltip:
      "Structured extraction of the disclosure schedule's overall structure: the agreement it qualifies, schedule date, total items, cross-reference mechanic, bring-down requirement, and a list of all schedule sections with their corresponding rep.",
    category: 'deal_terms',
  },
  ds_capitalization: {
    types: ['disclosure_schedule'],
    label: 'Capitalization Disclosures',
    tooltip:
      'All exceptions disclosed in the capitalization section: items disclosed, instruments not on cap table, promised but unissued grants, and undisclosed stockholder agreements.',
    category: 'deal_terms',
  },
  ds_ip: {
    types: ['disclosure_schedule'],
    label: 'IP Disclosures',
    tooltip:
      'All exceptions disclosed in the IP section: IP not solely owned by the company, open source components with copyleft risk, inbound licenses, unexecuted IP assignments, and third-party IP claims.',
    category: 'deal_terms',
  },
  ds_contracts: {
    types: ['disclosure_schedule'],
    label: 'Contract Disclosures',
    tooltip:
      'All material contracts disclosed: name and counterparty, disclosure reason, materiality assessment, and whether consent is required for the transaction.',
    category: 'deal_terms',
  },
  ds_litigation_compliance: {
    types: ['disclosure_schedule'],
    label: 'Litigation & Compliance Disclosures',
    tooltip:
      'All litigation and compliance disclosures: claims with parties, nature, amount, and status; plus regulatory investigations, consent decrees, and known compliance violations.',
    category: 'deal_terms',
  },
  ds_financial_employee: {
    types: ['disclosure_schedule'],
    label: 'Financial & Employee Disclosures',
    tooltip:
      'Disclosures from financial and employee sections: off-balance-sheet liabilities, tax disputes, material changes since balance sheet, employees without IP assignments, CoC bonuses, and severance obligations.',
    category: 'deal_terms',
  },
  bo_observer_identity: {
    types: ['board_observer_agreement'],
    label: 'Observer Identity',
    tooltip:
      'Observer individual name, fund/entity name, company name, effective date, basis for appointment, ownership threshold percentage, and the related investment agreement name and date.',
    category: 'deal_terms',
  },
  bo_scope_of_rights: {
    types: ['board_observer_agreement'],
    label: 'Scope of Observer Rights',
    tooltip:
      'All rights granted to the observer: attendance (in-person/virtual), notices, agendas, board packages, minutes, and speaking rights.',
    category: 'deal_terms',
  },
  bo_exclusions: {
    types: ['board_observer_agreement'],
    label: 'Observer Exclusions',
    tooltip:
      "Exclusion provisions limiting the observer's rights: executive sessions, conflicts of interest, litigation involving the observer's firm, competitive matters, and exclusion by board vote.",
    category: 'deal_terms',
  },
  bo_confidentiality: {
    types: ['board_observer_agreement'],
    label: 'Confidentiality Provisions',
    tooltip:
      'Confidentiality obligations: scope, extension to affiliated funds, permitted disclosures, post-termination duration, and regulatory carve-outs.',
    category: 'deal_terms',
  },
  bo_termination: {
    types: ['board_observer_agreement'],
    label: 'Termination Provisions',
    tooltip:
      "Events that end observer rights: IPO, ownership threshold, change of control, mutual consent, termination for cause, the observer's right to resign, and required notice period.",
    category: 'deal_terms',
  },
  bo_governance: {
    types: ['board_observer_agreement'],
    label: 'Governance Provisions',
    tooltip:
      'Governance confirmations: no voting rights, no fiduciary duty, liability limitation, governing law, amendment requirements, and counterpart execution.',
    category: 'deal_terms',
  },
  mrl_vcoc_purpose: {
    types: ['management_rights_letter'],
    label: 'VCOC Purpose & Parties',
    tooltip:
      'Fund legal name, entity type, company name, effective date, and whether the VCOC/ERISA purpose is explicitly stated in the recitals.',
    category: 'deal_terms',
  },
  mrl_management_rights: {
    types: ['management_rights_letter'],
    label: 'Management Rights',
    tooltip:
      'All management rights granted: consulting/advising, book inspection, facility visits, and financial reporting. Flags if any core right is absent.',
    category: 'deal_terms',
  },
  mrl_board_access: {
    types: ['management_rights_letter'],
    label: 'Board Access Rights',
    tooltip:
      'Board-related rights: observer right, notices, advance notice period, materials, executive session exclusions, and minutes.',
    category: 'deal_terms',
  },
  mrl_information_rights: {
    types: ['management_rights_letter'],
    label: 'Information Rights',
    tooltip:
      'Information rights granted directly to the fund: financial reporting frequency, annual budget, cap table updates, and material event notices.',
    category: 'deal_terms',
  },
  mrl_transfer_termination: {
    types: ['management_rights_letter'],
    label: 'Transfer & Termination',
    tooltip:
      'Transferability of rights with fund interest, termination events (IPO, ownership threshold, fund dissolution), and amendment requirements.',
    category: 'deal_terms',
  },
  company_name: {
    types: [],
    label: 'Company Name',
    tooltip:
      'Legal name of the company whose shares are issuable upon exercise of the warrant',
    category: 'core',
  },
  fund_name: {
    types: [],
    label: 'Fund Name',
    tooltip: 'Legal name of the fund that issued this Schedule of Investments',
    category: 'core',
  },
  investor_extraction_fund_describe: {
    types: [],
    label: 'Investing Fund Entities',
    tooltip:
      'All fund/LP/institutional entities that are purchasing shares or investing — extracted from introductory paragraphs, Purchaser/Investor headings, Exhibits/Annexes, and signature blocks.',
    category: 'core',
  },
  at_transfer_details: {
    types: ['affiliate_transfer'],
    label: 'Transfer Details',
    tooltip:
      'Source fund, destination fund, instrument (stage), quantity of shares/units, and effective transfer date for the affiliate transfer.',
    category: 'financials',
  },
  sop_plan_identity: {
    types: ['stock_option_plan'],
    label: 'Plan Identity',
    tooltip:
      'Plan name, effective date, board adoption date, stockholder approval date and status, and governing law.',
    category: 'legal',
  },
  sop_pool_structure: {
    types: ['stock_option_plan'],
    label: 'Share Reserve',
    tooltip:
      'Total shares authorized under the plan, shares issued or subject to outstanding awards, shares available for grant, and any evergreen provision, formula and cap.',
    category: 'ownership',
  },
  sop_award_types: {
    types: ['stock_option_plan'],
    label: 'Types of Awards',
    tooltip:
      'Award types the plan permits and who is eligible to receive them, plus any ISO sublimit and per-participant award limit.',
    category: 'deal_terms',
  },
  sop_exercise_price: {
    types: ['stock_option_plan'],
    label: 'Exercise Price',
    tooltip:
      'ISO and NSO exercise price standards, how fair market value is determined, and the maximum option terms.',
    category: 'legal',
  },
  sop_termination_exercise: {
    types: ['stock_option_plan'],
    label: 'Vesting and Termination',
    tooltip:
      'Default vesting schedule and cliff, plus the post-termination exercise window in days for each termination reason.',
    category: 'legal',
  },
  sop_change_of_control: {
    types: ['stock_option_plan'],
    label: 'Change of Control',
    tooltip:
      'Acceleration type, treatment of unvested awards, whether cash-out is permitted, and which document controls.',
    category: 'legal',
  },
  sop_administration: {
    types: ['stock_option_plan'],
    label: 'Administration',
    tooltip:
      'Plan administrator, scope of and limits on their discretion, amendment authority, plan expiration, and the effect of termination on outstanding awards.',
    category: 'legal',
  },
  ra_type_and_parties: {
    types: ['repurchase_agreement'],
    label: 'Repurchase Type and Parties',
    tooltip:
      'Repurchase type, company and subject party legal names and role, effective date, and the related agreement referenced.',
    category: 'legal',
  },
  ra_shares_subject: {
    types: ['repurchase_agreement'],
    label: 'Shares Subject to Repurchase',
    tooltip:
      'Total shares subject to repurchase, share class, vesting or repurchase schedule, and shares vested versus unvested as of the effective date.',
    category: 'ownership',
  },
  ra_repurchase_price: {
    types: ['repurchase_agreement'],
    label: 'Repurchase Price',
    tooltip:
      'Repurchase price per share, its basis, FMV methodology, and whether the price varies by trigger event or adjusts for splits.',
    category: 'financials',
  },
  ra_trigger_events: {
    types: ['repurchase_agreement'],
    label: 'Trigger Events',
    tooltip:
      'Each event that triggers the repurchase right, whether mandatory or optional, its applicable price, and additional conditions.',
    category: 'deal_terms',
  },
  ra_exercise_of_right: {
    types: ['repurchase_agreement'],
    label: 'Exercise of Repurchase Right',
    tooltip:
      'Rights holder, exercise period after a trigger, notice requirements, payment mechanics, and assignability.',
    category: 'legal',
  },
  ra_lapse_termination: {
    types: ['repurchase_agreement'],
    label: 'Lapse or Termination',
    tooltip:
      'Lapse on IPO, change of control, or full vesting, other lapse triggers, governing law, and amendment requirements.',
    category: 'legal',
  },
};

export type GlossaryField = keyof typeof glossaryPrompts;
