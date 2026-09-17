/**
 * Editable-field registry for investor value overrides.
 *
 * Explicit allowlist of displayed fields an investor may override, mapping
 * each to its storage location (entity_type + field_key on a real DB column)
 * and validation rule. Anything not registered here is NOT editable — server
 * actions must reject it.
 *
 * Explicit exclusions (fields displayed on investor pages that are NOT
 * registered, and why):
 * - `multiple` / MOIC, `my_fmv`, `aggregate_cost`, `my_fd_pct` from
 *   v_inv_company_valuation: computed in the view / transforms — no stored
 *   value to override. Edit their inputs instead (see COMPUTED_METRIC_INPUTS).
 * - `inv_transaction.transaction_type`: reclassifying a transaction changes
 *   which aggregation bucket (cost vs realized proceeds) it lands in —
 *   semantic change, not a value correction. Out of v1.
 * - "Realized Proceeds" table column: derived from `amount` on sale-type
 *   transactions; not a column of its own.
 * - `total_equity_financing`: aggregated from inv_financing_round.total_raised;
 *   financing-round fields are out of v1 scope.
 * - `last_transaction_date`: derived (max transaction_date).
 * - `our_implied_value` inside inv_cap_table_snapshot.cap_table_detail: jsonb
 *   path, not a clean column — no stable field_key. Excluded.
 * - `named_major_investors`: text[]; override values are scalars only (droid
 *   rejects objects and arrays).
 * - `investor_counsel_fee_cap` / `subsequent_closing_window_days` (Legal Terms
 *   → Other Legal Terms): only the section's Yes/No status flags are editable,
 *   so these two numeric rows stay read-only.
 * - `redemption_rights` (inv_round_terms): not rendered on any investor page, so
 *   there is no displayed value to correct.
 * - Budget & Business Plan monthly/quarterly (Legal Terms → Information Rights):
 *   only `year_end_budget_business_plan` exists as a column; the other two cells
 *   are hardcoded false in transformInvToLegalTerms, so they stay read-only
 *   until a column backs them.
 * - `monthly/quarterly/year_end_stockholders_equity`: real columns, but the
 *   Information Rights grid does not read them — its "Audited Stockholders
 *   Equity" row renders the shared `audited_*` flags like the other three
 *   Audited rows. Registering them would create an editor for a value the page
 *   never shows.
 * - `majorInvestor.majorInvestorsByThreshold`: hardcoded [] in
 *   transformInvToLegalTerms — derived, not stored.
 *
 * Nullable numerics on the Legal Terms tab are editable but NOT clearable: every
 * one uses `dataType: 'number'` with a rule that rejects blank input, so a
 * mistaken edit is undone with Revert rather than by clearing the field. Clearing
 * would need the empty-string sentinel handling the nullable inv_board_seat
 * fields use, which no UI implements yet.
 *
 * Overrides attach to a concrete row id. inv_security_terms is SCD Type 2 in
 * droid's ingester (a new signed document supersedes the prior row and inserts a
 * new one), and inv_round_terms / inv_information_rights gain a new row on a new
 * effective_date — so an edit stops applying once its row is superseded. Known
 * limitation; re-pointing active overrides on supersede is its own change.
 *
 * Entity-id resolution caveat: v_inv_company_valuation does NOT expose the
 * underlying snapshot id, so valuation fields rendered from that view alone
 * (e.g. dashboard rows) cannot resolve entity_id without also loading the
 * latest snapshot via getInvCapTableSnapshot. The company page already loads
 * it; dashboard edit affordances must do the same.
 */

import { z } from 'zod';

import type { Database } from '@/database.types';

export type OverrideEntityType =
  | 'inv_company'
  | 'inv_transaction'
  | 'inv_cap_table_snapshot'
  | 'inv_board_seat'
  | 'inv_information_rights'
  | 'inv_round_terms'
  | 'inv_security_terms';

/** How the UI resolves the entity_id for an editable field. */
export type EntityIdResolution =
  /** id of the inv_company row backing the company details page */
  | 'company_row_id'
  /** id of the inv_transaction row backing the table row */
  | 'transaction_row_id'
  /** id of the latest inv_cap_table_snapshot (via getInvCapTableSnapshot) */
  | 'latest_cap_table_snapshot_id'
  /** id of the inv_board_seat row */
  | 'board_seat_row_id'
  /** id of the active inv_information_rights row (most recent, unexpired) */
  | 'information_rights_row_id'
  /** id of the active inv_round_terms row (most recent, non-superseded) */
  | 'round_terms_row_id'
  /** id of the active inv_security_terms row (most recent, non-superseded) */
  | 'security_terms_row_id';

type InvTransactionColumn =
  keyof Database['public']['Tables']['inv_transaction']['Row'];
type InvCapTableSnapshotColumn =
  keyof Database['public']['Tables']['inv_cap_table_snapshot']['Row'];
type InvBoardSeatColumn =
  keyof Database['public']['Tables']['inv_board_seat']['Row'];
type InvInformationRightsColumn =
  keyof Database['public']['Tables']['inv_information_rights']['Row'];
type InvRoundTermsColumn =
  keyof Database['public']['Tables']['inv_round_terms']['Row'];
type InvSecurityTermsColumn =
  keyof Database['public']['Tables']['inv_security_terms']['Row'];
type InvCompanyColumn =
  | keyof Database['public']['Tables']['inv_company']['Row']
  | keyof Database['public']['Tables']['inv_companies']['Row'];
type InvCompanyOverrideField = Extract<
  InvCompanyColumn,
  | 'industry'
  | 'domain'
  | 'sector'
  | 'headquarters'
  | 'founded_year'
  | 'entity_type'
  | 'legal_jurisdiction'
>;

/** One allowed value of a fixed-choice field, rendered as a dropdown item. */
export interface EditableFieldOption {
  value: string | number;
  label: string;
}

interface EditableFieldBase<
  TEntity extends OverrideEntityType,
  TColumn extends string,
> {
  entityType: TEntity;
  /** Real DB column on the entity's table (compile-time checked). */
  fieldKey: TColumn;
  /** Label as displayed in the investor UI. */
  label: string;
  /**
   * Fixed set of allowed values: the edit popup renders a dropdown of these
   * labels and stores the matching `value`. Use for columns that hold a code or
   * a rank the page displays as a phrase (anti-dilution type, seniority) — free
   * text there would let a user store the display label into a code column. A
   * dropdown offers no blank choice, so an options field is never clearable.
   */
  options?: readonly EditableFieldOption[];
  /**
   * Optional helper text shown under the edit input — use when the stored unit
   * differs from the displayed one (e.g. a fraction shown as a percent).
   */
  hint?: string;
  /** Render a textarea in the edit popover. */
  multiline?: boolean;
  /**
   * When true, the field is stored as a fraction (0–1) but entered/displayed in
   * the edit popup as a percent: the input ×/÷ 100 conversion is handled by
   * EditableValue, so every edit site stays consistent. Only valid for number
   * fields whose rule is the fraction range.
   */
  displayAsPercent?: boolean;
  entityIdResolution: EntityIdResolution;
}

type NumberField = { dataType: 'number'; rule: z.ZodType<number> };
type DateField = { dataType: 'date'; rule: z.ZodType<string> };
type StringField = { dataType: 'string'; rule: z.ZodType<string> };
type NullableStringField = {
  dataType: 'nullable_string';
  rule: z.ZodType<string | null>;
};
type NullableNumberField = {
  dataType: 'nullable_number';
  rule: z.ZodType<number | null | ''>;
};
type BooleanField = { dataType: 'boolean'; rule: z.ZodType<boolean> };

export type EditableFieldDef =
  | (EditableFieldBase<'inv_company', InvCompanyOverrideField> &
      (StringField | NullableStringField | NumberField))
  | (EditableFieldBase<'inv_transaction', InvTransactionColumn> &
      (NumberField | DateField))
  | (EditableFieldBase<'inv_cap_table_snapshot', InvCapTableSnapshotColumn> &
      (NumberField | DateField))
  | (EditableFieldBase<'inv_board_seat', InvBoardSeatColumn> &
      (StringField | NullableStringField | NullableNumberField))
  | (EditableFieldBase<'inv_information_rights', InvInformationRightsColumn> &
      BooleanField)
  | (EditableFieldBase<'inv_round_terms', InvRoundTermsColumn> &
      (BooleanField | NumberField))
  | (EditableFieldBase<'inv_security_terms', InvSecurityTermsColumn> &
      (BooleanField | NumberField | StringField));

const isoDateRule = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format')
  .refine((d) => !Number.isNaN(Date.parse(d)), 'Must be a valid date');

const finiteNumber = z.number().finite();
const nonNegativeNumber = z.number().finite().nonnegative();
const nonNegativeInt = z.number().int().nonnegative();
/** A value already stored as a percent (0–100), not as a fraction. */
const percentPoints = z.number().min(0).max(100);
const nonEmptyText = z.string().trim().min(1).max(500);
/** Mirrors the inv_companies.founded_year CHECK (1800 <= year <= 2100). */
const foundedYearRule = z
  .number()
  .int('Enter a four-digit year')
  .min(1800, 'Enter a year between 1800 and 2100')
  .max(2100, 'Enter a year between 1800 and 2100');
const domainRule = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .regex(/^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i, 'Enter a valid domain');

/**
 * inv_security_terms.anti_dilution_type choices. Labels mirror mapAntiDilutionType
 * in transforms.ts so the dropdown, the displayed value and the override tooltip
 * all read the same. 'weighted_average' is accepted by that mapper for legacy
 * rows but is not offered as a new choice.
 */
const ANTI_DILUTION_OPTIONS: readonly EditableFieldOption[] = [
  { value: 'none', label: 'None' },
  { value: 'broad_based', label: 'Broad-Based Weighted Average' },
  { value: 'narrow_based', label: 'Narrow-Based Weighted Average' },
  { value: 'full_ratchet', label: 'Full Ratchet' },
];

/**
 * inv_security_terms.dividend_seniority is stored as a rank; labels mirror
 * formatDividendSeniority in companyDetailsFormat.ts.
 */
const DIVIDEND_SENIORITY_OPTIONS: readonly EditableFieldOption[] = [
  { value: 1, label: 'Senior' },
  { value: 2, label: 'Pari Passu' },
  { value: 3, label: 'Junior' },
];

/**
 * Rules accepting exactly the values of an options list. Derived from the list
 * itself so the validator and the dropdown cannot drift apart — adding a choice
 * to an options array is enough to make it valid.
 */
function stringOptionRule(
  options: readonly EditableFieldOption[],
): z.ZodType<string> {
  const allowed = new Set(options.map((o) => String(o.value)));
  return z.string().refine((v) => allowed.has(v), 'Select a valid option');
}

function numberOptionRule(
  options: readonly EditableFieldOption[],
): z.ZodType<number> {
  const allowed = new Set(options.map((o) => Number(o.value)));
  return z.number().refine((v) => allowed.has(v), 'Select a valid option');
}

export const EDITABLE_FIELDS: readonly EditableFieldDef[] = [
  // ---- inv_company (Company Details section) ----
  {
    entityType: 'inv_company',
    fieldKey: 'industry',
    label: 'Industry',
    entityIdResolution: 'company_row_id',
    dataType: 'string',
    rule: nonEmptyText,
  },
  {
    entityType: 'inv_company',
    fieldKey: 'domain',
    label: 'Website',
    entityIdResolution: 'company_row_id',
    dataType: 'string',
    hint: 'Enter a domain, e.g. example.com.',
    rule: domainRule,
  },
  {
    entityType: 'inv_company',
    fieldKey: 'sector',
    label: 'Sector',
    entityIdResolution: 'company_row_id',
    dataType: 'string',
    rule: nonEmptyText,
  },
  {
    entityType: 'inv_company',
    fieldKey: 'headquarters',
    label: 'Headquarters',
    entityIdResolution: 'company_row_id',
    dataType: 'string',
    rule: nonEmptyText,
  },
  {
    entityType: 'inv_company',
    fieldKey: 'founded_year',
    label: 'Founded',
    entityIdResolution: 'company_row_id',
    dataType: 'number',
    rule: foundedYearRule,
  },
  {
    // Free text, not a dropdown: entity types vary by jurisdiction (LLC, Ltd,
    // GmbH, Pty Ltd) and the column stores the display phrase, not a code.
    entityType: 'inv_company',
    fieldKey: 'entity_type',
    label: 'Entity Type',
    entityIdResolution: 'company_row_id',
    dataType: 'string',
    rule: nonEmptyText,
  },
  {
    entityType: 'inv_company',
    fieldKey: 'legal_jurisdiction',
    label: 'Jurisdiction',
    entityIdResolution: 'company_row_id',
    dataType: 'string',
    rule: nonEmptyText,
  },
  // ---- inv_transaction (transactions table rows) ----
  {
    entityType: 'inv_transaction',
    fieldKey: 'transaction_date',
    label: 'Date',
    entityIdResolution: 'transaction_row_id',
    dataType: 'date',
    rule: isoDateRule,
  },
  {
    entityType: 'inv_transaction',
    fieldKey: 'units',
    label: 'My Units',
    entityIdResolution: 'transaction_row_id',
    dataType: 'number',
    // Negative units are legitimate (sales/secondary sales).
    rule: finiteNumber,
  },
  {
    entityType: 'inv_transaction',
    fieldKey: 'amount',
    label: 'My Entry Cost',
    entityIdResolution: 'transaction_row_id',
    dataType: 'number',
    // Sign conventions vary by transaction_type (outflow vs inflow).
    rule: finiteNumber,
  },
  // ---- inv_cap_table_snapshot (valuation fields) ----
  {
    entityType: 'inv_cap_table_snapshot',
    fieldKey: 'implied_valuation',
    label: 'Post Money Valuation',
    entityIdResolution: 'latest_cap_table_snapshot_id',
    dataType: 'number',
    rule: nonNegativeNumber,
  },
  {
    entityType: 'inv_cap_table_snapshot',
    fieldKey: 'share_price',
    label: 'Current Price Per Unit',
    entityIdResolution: 'latest_cap_table_snapshot_id',
    dataType: 'number',
    rule: nonNegativeNumber,
  },
  {
    entityType: 'inv_cap_table_snapshot',
    fieldKey: 'our_fd_ownership_percent',
    label: 'My FD%',
    entityIdResolution: 'latest_cap_table_snapshot_id',
    dataType: 'number',
    // Stored as a fraction (0–1); entered + shown as a percent in the popup.
    hint: 'Enter as a percent — e.g. 10 for 10%.',
    displayAsPercent: true,
    rule: z.number().min(0).max(1),
  },
  {
    entityType: 'inv_cap_table_snapshot',
    fieldKey: 'our_total_shares',
    label: 'My Units',
    entityIdResolution: 'latest_cap_table_snapshot_id',
    dataType: 'number',
    rule: nonNegativeNumber,
  },
  // ---- inv_board_seat (board section fields) ----
  {
    entityType: 'inv_board_seat',
    fieldKey: 'holder_name',
    label: 'Name (Board)',
    entityIdResolution: 'board_seat_row_id',
    dataType: 'string',
    rule: z.string().trim().min(1, 'Name is required').max(200),
  },
  {
    entityType: 'inv_board_seat',
    fieldKey: 'holder_title',
    label: 'Title (Board)',
    entityIdResolution: 'board_seat_row_id',
    dataType: 'nullable_string',
    rule: z.string().trim().max(200).nullable(),
  },
  {
    entityType: 'inv_board_seat',
    fieldKey: 'designating_fund_id',
    label: 'Fund (Board)',
    entityIdResolution: 'board_seat_row_id',
    dataType: 'nullable_number',
    rule: z.union([z.number().int().positive(), z.literal('')]),
  },
  {
    entityType: 'inv_board_seat',
    fieldKey: 'seat_type',
    label: 'Type (Board)',
    entityIdResolution: 'board_seat_row_id',
    dataType: 'string',
    // Matches the inv_board_seat.seat_type CHECK constraint.
    rule: z.enum([
      'investor_designated',
      'common_designated',
      'independent',
      'observer',
      'executive',
    ]),
  },
  // ---- inv_information_rights (Investor Status section) ----
  // Major Investor is a single stored flag. Information Rights is DERIVED from
  // the three flags below (see getInvInvestorStatus); the UI edits these inputs
  // via a drill-down and recomputes the displayed value.
  {
    entityType: 'inv_information_rights',
    fieldKey: 'is_major_investor',
    label: 'Major Investor',
    entityIdResolution: 'information_rights_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_information_rights',
    fieldKey: 'info_rights_for_major',
    label: 'Information Rights (major investors)',
    entityIdResolution: 'information_rights_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_information_rights',
    fieldKey: 'info_rights_for_all',
    label: 'Information Rights (all investors)',
    entityIdResolution: 'information_rights_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  // ---- inv_round_terms (Investor Status section) ----
  // Pro Rata Rights is DERIVED from the two flags below (see
  // getInvInvestorStatus): (pro_rata_rights_major AND is_major_investor) OR
  // pro_rata_rights_all. The UI edits these inputs and recomputes the display.
  //
  // These two flags are ALSO the first two rows of Legal Terms → Other Legal
  // Terms, which edits them directly. Keep the labels as-is: ActivityContent
  // renders them for historic audit rows, so renaming would retroactively
  // relabel past entries. The Legal Terms tab passes its own display strings
  // via OverridableValue's `label` prop instead.
  {
    entityType: 'inv_round_terms',
    fieldKey: 'pro_rata_rights_major',
    label: 'Pro Rata Rights (major investors)',
    entityIdResolution: 'round_terms_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_round_terms',
    fieldKey: 'pro_rata_rights_all',
    label: 'Pro Rata Rights (all investors)',
    entityIdResolution: 'round_terms_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  // ---- inv_round_terms (Legal Terms → Other Legal Terms) ----
  // Status flags edited inline on the Legal Terms tab.
  {
    entityType: 'inv_round_terms',
    fieldKey: 'standard_pro_rata_formulation',
    label: 'Standard Pro Rata Formulation',
    entityIdResolution: 'round_terms_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_round_terms',
    fieldKey: 'drag_along',
    label: 'Drag Along',
    entityIdResolution: 'round_terms_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_round_terms',
    fieldKey: 'pay_to_play',
    label: 'Pay to Play',
    entityIdResolution: 'round_terms_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_round_terms',
    fieldKey: 'do_insurance',
    label: 'D&O Insurance',
    entityIdResolution: 'round_terms_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_round_terms',
    fieldKey: 'rofr_cosale',
    label: 'ROFR & Co-Sale Agreement',
    entityIdResolution: 'round_terms_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_round_terms',
    fieldKey: 'investors_subject_to_rofr',
    label: 'Investors Subject to ROFR',
    entityIdResolution: 'round_terms_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_round_terms',
    fieldKey: 'issuer_pays_investor_counsel',
    label: 'Issuer Pays Investor Counsel Fees',
    entityIdResolution: 'round_terms_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_round_terms',
    fieldKey: 'employee_vesting_protocol',
    label: 'Employee Vesting Protocol',
    entityIdResolution: 'round_terms_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_round_terms',
    fieldKey: 'founder_vesting_applied',
    label: 'Founder Vesting Protocol',
    entityIdResolution: 'round_terms_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_round_terms',
    fieldKey: 'required_closing_payments',
    label: 'Required Closing Payments',
    entityIdResolution: 'round_terms_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_round_terms',
    fieldKey: 'registration_rights_preferred',
    label: 'Registration Rights (Preferred)',
    entityIdResolution: 'round_terms_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  // ---- inv_round_terms (Legal Terms → Major Investor Thresholds) ----
  {
    entityType: 'inv_round_terms',
    fieldKey: 'major_investor_threshold_amount',
    label: 'Major Investor Threshold Amount',
    entityIdResolution: 'round_terms_row_id',
    dataType: 'number',
    rule: nonNegativeNumber,
  },
  {
    entityType: 'inv_round_terms',
    fieldKey: 'major_investor_threshold_ownership_pct',
    label: 'Major Investor Threshold Ownership %',
    entityIdResolution: 'round_terms_row_id',
    dataType: 'number',
    hint: 'Enter as a percent — e.g. 5 for 5%.',
    rule: percentPoints,
  },
  {
    entityType: 'inv_round_terms',
    fieldKey: 'major_investor_threshold_shares',
    label: 'Major Investor Threshold Shares',
    entityIdResolution: 'round_terms_row_id',
    dataType: 'number',
    rule: nonNegativeInt,
  },
  // ---- inv_round_terms (Legal Terms → Economic Rights / QSBS) ----
  {
    entityType: 'inv_round_terms',
    fieldKey: 'milestone_closings',
    label: 'Milestone Closings',
    entityIdResolution: 'round_terms_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_round_terms',
    fieldKey: 'qsbs_covenant_given',
    label: 'QSBS Covenant Given',
    entityIdResolution: 'round_terms_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_round_terms',
    fieldKey: 'qsbs_rep_made',
    label: 'QSBS Rep Made',
    entityIdResolution: 'round_terms_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  // ---- inv_information_rights (Legal Terms → Information Rights grid) ----
  // One entry per backed cell. The three audited_* columns each back four
  // displayed rows (Audited Balance Sheet / Financial Statements / Income &
  // Cash Flows / Stockholders Equity), so their labels name the frequency only
  // and the hint names every row an edit will change.
  {
    entityType: 'inv_information_rights',
    fieldKey: 'year_end_budget_business_plan',
    label: 'Budget & Business Plan (Year-End)',
    entityIdResolution: 'information_rights_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_information_rights',
    fieldKey: 'monthly_cap_table',
    label: 'Capitalization Table (Monthly)',
    entityIdResolution: 'information_rights_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_information_rights',
    fieldKey: 'quarterly_cap_table',
    label: 'Capitalization Table (Quarterly)',
    entityIdResolution: 'information_rights_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_information_rights',
    fieldKey: 'year_end_cap_table',
    label: 'Capitalization Table (Year-End)',
    entityIdResolution: 'information_rights_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_information_rights',
    fieldKey: 'monthly_balance_sheet',
    label: 'Balance Sheet (Monthly)',
    entityIdResolution: 'information_rights_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_information_rights',
    fieldKey: 'quarterly_balance_sheet',
    label: 'Balance Sheet (Quarterly)',
    entityIdResolution: 'information_rights_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_information_rights',
    fieldKey: 'year_end_balance_sheet',
    label: 'Balance Sheet (Year-End)',
    entityIdResolution: 'information_rights_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_information_rights',
    fieldKey: 'monthly_income_cash_flows',
    label: 'Income & Cash Flows (Monthly)',
    entityIdResolution: 'information_rights_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_information_rights',
    fieldKey: 'quarterly_income_cash_flows',
    label: 'Income & Cash Flows (Quarterly)',
    entityIdResolution: 'information_rights_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_information_rights',
    fieldKey: 'year_end_income_cash_flows',
    label: 'Income & Cash Flows (Year-End)',
    entityIdResolution: 'information_rights_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_information_rights',
    fieldKey: 'audited_monthly',
    label: 'Audited Financials (Monthly)',
    entityIdResolution: 'information_rights_row_id',
    dataType: 'boolean',
    hint: 'Shared by all four Audited rows (Balance Sheet, Financial Statements, Income & Cash Flows, Stockholders Equity).',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_information_rights',
    fieldKey: 'audited_quarterly',
    label: 'Audited Financials (Quarterly)',
    entityIdResolution: 'information_rights_row_id',
    dataType: 'boolean',
    hint: 'Shared by all four Audited rows (Balance Sheet, Financial Statements, Income & Cash Flows, Stockholders Equity).',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_information_rights',
    fieldKey: 'audited_year_end',
    label: 'Audited Financials (Year-End)',
    entityIdResolution: 'information_rights_row_id',
    dataType: 'boolean',
    hint: 'Shared by all four Audited rows (Balance Sheet, Financial Statements, Income & Cash Flows, Stockholders Equity).',
    rule: z.boolean(),
  },
  // ---- inv_security_terms (Legal Terms → Economic Rights / Dividends) ----
  {
    entityType: 'inv_security_terms',
    fieldKey: 'anti_dilution_type',
    label: 'Anti-Dilution Rights',
    entityIdResolution: 'security_terms_row_id',
    dataType: 'string',
    options: ANTI_DILUTION_OPTIONS,
    rule: stringOptionRule(ANTI_DILUTION_OPTIONS),
  },
  {
    entityType: 'inv_security_terms',
    fieldKey: 'liquidation_seniority',
    label: 'Liquidation Preference Seniority',
    entityIdResolution: 'security_terms_row_id',
    dataType: 'number',
    hint: 'Seniority rank — 1 is most senior.',
    rule: z.number().int().positive(),
  },
  {
    entityType: 'inv_security_terms',
    fieldKey: 'dividend_accruing',
    label: 'Accruing Dividends',
    entityIdResolution: 'security_terms_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_security_terms',
    fieldKey: 'dividend_cumulative',
    label: 'Cumulative Dividends',
    entityIdResolution: 'security_terms_row_id',
    dataType: 'boolean',
    rule: z.boolean(),
  },
  {
    entityType: 'inv_security_terms',
    fieldKey: 'dividend_rate',
    label: 'Dividend Rate',
    entityIdResolution: 'security_terms_row_id',
    dataType: 'number',
    // Stored as a percent, but normalizeRatePercent rescales any stored value
    // below 1 by 100 on display — so a stored 0.5 meaning 0.5% would render as
    // 50%. Reject that interval rather than store a value the page shows wrong.
    // Fixing normalizeRatePercent instead would change the displayed rate for
    // every ingested row where 0.08 means 8%.
    hint: 'Enter as a percent — e.g. 8 for 8%. Rates between 0% and 1% are not supported.',
    rule: z.union([z.literal(0), z.number().min(1).max(100)]),
  },
  {
    entityType: 'inv_security_terms',
    fieldKey: 'dividend_seniority',
    label: 'Dividend Seniority',
    entityIdResolution: 'security_terms_row_id',
    dataType: 'number',
    options: DIVIDEND_SENIORITY_OPTIONS,
    rule: numberOptionRule(DIVIDEND_SENIORITY_OPTIONS),
  },
];

/**
 * Sign of inv_transaction.amount for a raw transaction_type, mirroring droid's
 * getTransactionSign(type, isAmount=true) (the ingestion-time convention).
 * Cost-side types (we pay out) store a negative amount; proceeds-side types
 * (we receive) store a positive amount. This is the write-path source of truth
 * for editing a transaction amount — distinct from the v_inv_position
 * cost/proceeds aggregation buckets, which group by a different axis.
 *
 * For an unrecognised type the sign cannot be determined; the caller falls
 * back to the existing stored value's sign (see EditableValue) rather than
 * force-flipping a sign we don't know.
 */
const TRANSACTION_AMOUNT_NEGATIVE_TYPES: ReadonlySet<string> = new Set([
  'purchase',
  'exercise',
  'issuance',
  'secondary_purchase',
  'reclassification',
  'transfer_out',
  'write_off',
  'affiliate_transfer_from',
]);
const TRANSACTION_AMOUNT_POSITIVE_TYPES: ReadonlySet<string> = new Set([
  'sale',
  'conversion',
  'distribution',
  'transfer_in',
  'secondary_sale',
  'exit_consideration',
  'affiliate_transfer_to',
]);

/** -1 / +1 for a known raw transaction_type; null when the type is unknown. */
export function transactionAmountSign(
  rawTransactionType: string,
): 1 | -1 | null {
  if (TRANSACTION_AMOUNT_NEGATIVE_TYPES.has(rawTransactionType)) return -1;
  if (TRANSACTION_AMOUNT_POSITIVE_TYPES.has(rawTransactionType)) return 1;
  return null;
}

function registryKey(entityType: string, fieldKey: string): string {
  return `${entityType}:${fieldKey}`;
}

const FIELDS_BY_KEY: ReadonlyMap<string, EditableFieldDef> = new Map(
  EDITABLE_FIELDS.map((f) => [registryKey(f.entityType, f.fieldKey), f]),
);

/**
 * Look up an editable field. Accepts plain strings so server actions can
 * validate untrusted input; returns undefined for anything not registered.
 */
export function getEditableField(
  entityType: string,
  fieldKey: string,
): EditableFieldDef | undefined {
  return FIELDS_BY_KEY.get(registryKey(entityType, fieldKey));
}

export function isEditableField(entityType: string, fieldKey: string): boolean {
  return FIELDS_BY_KEY.has(registryKey(entityType, fieldKey));
}

/**
 * The option a value corresponds to, or undefined when it matches none.
 *
 * Compared as strings: the same value reaches this from a jsonb column, an audit
 * row and a form field, so a numeric rank can legitimately arrive as 2 or '2'
 * and both must resolve to the same option. Callers that must distinguish
 * "unmapped" from "mapped" should use this rather than getOptionLabel, whose
 * fallback is indistinguishable from a real label.
 */
export function findFieldOption(
  fieldDef: EditableFieldDef,
  value: string | number,
): EditableFieldOption | undefined {
  return fieldDef.options?.find((o) => String(o.value) === String(value));
}

/**
 * Display label for a stored value of an options field (e.g. 'broad_based' →
 * 'Broad-Based Weighted Average'). Falls back to the stringified value, so a
 * legacy value predating a change to the option list still renders something
 * meaningful in an audit row or an override tooltip.
 */
export function getOptionLabel(
  fieldDef: EditableFieldDef,
  value: string | number,
): string {
  return findFieldOption(fieldDef, value)?.label ?? String(value);
}

interface EditableFieldRef {
  entityType: OverrideEntityType;
  fieldKey: string;
}

/**
 * Editable input fields feeding each computed metric (v1 scope).
 * Drives the drill-down panel: clicking a computed metric lists these.
 *
 * Derivations (v_inv_company_valuation + lib/v2/inv/transforms.ts):
 * - my_fmv    = our_fd_ownership_percent * implied_valuation
 * - aggregate_cost = |sum of purchase-type inv_transaction.amount|
 * - moic      = (my_fmv + realized_proceeds) / aggregate_cost; realized
 *               proceeds also come from inv_transaction.amount (sale types)
 *
 * Only metrics with editable SNAPSHOT inputs are listed. aggregate_cost is
 * omitted entirely — its sole input is transaction amount, which this panel
 * cannot edit (transactions are edited inline in the table, each by its own
 * row id). For the same reason moic lists only its snapshot inputs, not its
 * transaction-derived cost leg.
 */
export const COMPUTED_METRIC_INPUTS: Record<
  'moic' | 'my_fmv',
  readonly EditableFieldRef[]
> = {
  my_fmv: [
    {
      entityType: 'inv_cap_table_snapshot',
      fieldKey: 'our_fd_ownership_percent',
    },
    { entityType: 'inv_cap_table_snapshot', fieldKey: 'implied_valuation' },
  ],
  // Only snapshot inputs are listed: the drill-down panel edits cap-table
  // snapshot fields, not transactions. aggregate_cost (and MOIC's cost leg) are
  // transaction-derived and have no editable input in this panel — see the
  // registry-exclusions note above.
  moic: [
    {
      entityType: 'inv_cap_table_snapshot',
      fieldKey: 'our_fd_ownership_percent',
    },
    { entityType: 'inv_cap_table_snapshot', fieldKey: 'implied_valuation' },
  ],
};

export type ComputedMetricKey = keyof typeof COMPUTED_METRIC_INPUTS;

function resolveMetricInputRef(ref: EditableFieldRef): EditableFieldDef {
  const def = getEditableField(ref.entityType, ref.fieldKey);
  if (!def) {
    throw new Error(
      `Metric input ${ref.entityType}.${ref.fieldKey} is not a registered editable field`,
    );
  }
  return def;
}

/**
 * Resolve a computed metric's editable inputs to full registry definitions.
 * Returns undefined for unknown metrics (read-only — no edit affordance).
 */
export function getMetricInputFields(
  metric: string,
): EditableFieldDef[] | undefined {
  if (!Object.hasOwn(COMPUTED_METRIC_INPUTS, metric)) {
    return undefined;
  }
  const refs = COMPUTED_METRIC_INPUTS[metric as ComputedMetricKey];
  return refs.map(resolveMetricInputRef);
}

/**
 * Inverse lookup: given an edited field, return which computed metrics it
 * affects. E.g. editing `our_fd_ownership_percent` returns ['my_fmv', 'moic'].
 */
export function getAffectedMetrics(
  entityType: string,
  fieldKey: string,
): ComputedMetricKey[] {
  const affected: ComputedMetricKey[] = [];
  for (const [metric, refs] of Object.entries(COMPUTED_METRIC_INPUTS)) {
    if (
      refs.some(
        (ref) => ref.entityType === entityType && ref.fieldKey === fieldKey,
      )
    ) {
      affected.push(metric as ComputedMetricKey);
    }
  }
  return affected;
}
