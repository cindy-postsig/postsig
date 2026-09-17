'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import type {
  LegalTerms,
  FrequencyFlags,
  InformationRights,
  OtherLegalTerms,
  LegalTermsOverrideContext,
} from '../../types';
import type { Json } from '@/database.types';
import type { AppliedOverrideMeta } from '@/lib/v2/inv/overrides/applyOverrides';
import {
  getEditableField,
  type OverrideEntityType,
} from '@/lib/v2/inv/overrides/registry';
import { EditableValue } from '@/components/investor/EditableValue';
import { OverridableValue } from '@/components/investor/OverrideBadge';
import {
  formatAntiDilution,
  formatBool,
  formatCount,
  formatDividendSeniority,
} from './companyDetailsFormat';
import {
  BooleanDot,
  Section,
  TabHeader,
  TabEmptyState,
} from './companyDetailsPrimitives';

/** The raw stored value an edit popup starts from. */
type RawValue = number | string | boolean | null;

/**
 * One editable Legal Terms value: the override badge (when the field carries an
 * edit) wrapped around the edit affordance (when the viewer may edit and the
 * source row exists). Both wrappers fall through to the bare value, so the
 * read-only, no-override and round-filtered paths need no branching at the call
 * site.
 *
 * `fieldKey` is null for a displayed value with no backing column, and
 * `entityId` is null when the company has no such source row — either way the
 * value renders plain.
 */
function TermValue({
  entityType,
  fieldKey,
  entityId,
  meta,
  label,
  currentRawValue,
  formatValue,
  align = 'end',
  onReverted,
  children,
}: {
  entityType: OverrideEntityType;
  fieldKey: string | null;
  entityId: number | null | undefined;
  meta: AppliedOverrideMeta | undefined;
  /** Display label — used for the tooltip heading, not the registry label. */
  label: string;
  currentRawValue: RawValue;
  formatValue?: (value: Json) => string;
  align?: 'start' | 'end';
  onReverted: () => void;
  children: React.ReactNode;
}) {
  const fieldDef = fieldKey
    ? getEditableField(entityType, fieldKey)
    : undefined;

  return (
    <OverridableValue
      meta={meta}
      label={label}
      align={align}
      formatValue={formatValue}
      onReverted={onReverted}
    >
      {fieldDef && entityId != null ? (
        <EditableValue
          fieldDef={fieldDef}
          entityId={entityId}
          currentRawValue={currentRawValue}
        >
          {children}
        </EditableValue>
      ) : (
        children
      )}
    </OverridableValue>
  );
}

/** Render a stored override value the way its row displays it. */
const formatCurrency = (value: Json): string =>
  typeof value === 'number' ? `$${value.toLocaleString()}` : String(value);
const formatPercent = (value: Json): string =>
  typeof value === 'number' ? `${value.toFixed(1)}%` : String(value);
const formatSeniorityRank = (value: Json): string =>
  typeof value === 'number' || typeof value === 'string'
    ? formatDividendSeniority(value)
    : '-';

interface RowContext {
  context?: LegalTermsOverrideContext;
  onReverted: () => void;
}

/* ------------------------------ Information Rights ----------------------- */

/** The inv_information_rights column behind each frequency cell of one row. */
interface FrequencyFields {
  monthly: string | null;
  quarterly: string | null;
  yearEnd: string | null;
}

interface InformationRightsRow {
  label: string;
  prop: keyof InformationRights;
  fields: FrequencyFields;
}

/** The three columns all four Audited rows read; editing one flips all four. */
const AUDITED_FIELDS: FrequencyFields = {
  monthly: 'audited_monthly',
  quarterly: 'audited_quarterly',
  yearEnd: 'audited_year_end',
};

/**
 * Display order of the grid. The four Audited rows share AUDITED_FIELDS, which
 * the registry entries' hint spells out in the edit popup. Budget & Business Plan
 * has no monthly/quarterly column (transformInvToLegalTerms hardcodes them
 * false), so those two cells are read-only.
 */
const INFORMATION_RIGHTS_ROWS: readonly InformationRightsRow[] = [
  {
    label: 'Budget & Business Plan',
    prop: 'budgetAndBusinessPlan',
    fields: {
      monthly: null,
      quarterly: null,
      yearEnd: 'year_end_budget_business_plan',
    },
  },
  {
    label: 'Capitalization Table',
    prop: 'capitalizationTable',
    fields: {
      monthly: 'monthly_cap_table',
      quarterly: 'quarterly_cap_table',
      yearEnd: 'year_end_cap_table',
    },
  },
  {
    label: 'Balance Sheet',
    prop: 'balanceSheet',
    fields: {
      monthly: 'monthly_balance_sheet',
      quarterly: 'quarterly_balance_sheet',
      yearEnd: 'year_end_balance_sheet',
    },
  },
  {
    label: 'Income & Cash Flows',
    prop: 'incomeAndCashFlows',
    fields: {
      monthly: 'monthly_income_cash_flows',
      quarterly: 'quarterly_income_cash_flows',
      yearEnd: 'year_end_income_cash_flows',
    },
  },
  {
    label: 'Audited Balance Sheet',
    prop: 'auditedBalanceSheet',
    fields: AUDITED_FIELDS,
  },
  {
    label: 'Audited Financial Statements',
    prop: 'auditedFinancialStatements',
    fields: AUDITED_FIELDS,
  },
  {
    label: 'Audited Income & Cash Flows',
    prop: 'auditedIncomeAndCashFlows',
    fields: AUDITED_FIELDS,
  },
  {
    label: 'Audited Stockholders Equity',
    prop: 'auditedStockholdersEquity',
    fields: AUDITED_FIELDS,
  },
];

const FREQUENCY_LABELS: Record<keyof FrequencyFlags, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearEnd: 'Year-End',
};

function FrequencyRow({
  row,
  flags,
  context,
  onReverted,
}: { row: InformationRightsRow; flags: FrequencyFlags } & RowContext) {
  const frequencies: (keyof FrequencyFlags)[] = [
    'monthly',
    'quarterly',
    'yearEnd',
  ];

  return (
    <div className="grid grid-cols-4 gap-4 border-b border-foreground/5 py-2 last:border-0">
      <div className="col-span-1 font-sans-neue text-sm text-muted-foreground">
        {row.label}
      </div>
      {frequencies.map((frequency) => {
        const fieldKey = row.fields[frequency];
        const value = flags[frequency];
        return (
          <div key={frequency} className="col-span-1 flex justify-center">
            <TermValue
              entityType="inv_information_rights"
              fieldKey={fieldKey}
              entityId={context?.informationRightsId}
              meta={
                fieldKey
                  ? context?.overridden.informationRights[fieldKey]
                  : undefined
              }
              label={`${row.label} (${FREQUENCY_LABELS[frequency]})`}
              currentRawValue={value}
              formatValue={formatBool}
              align="start"
              onReverted={onReverted}
            >
              <BooleanDot value={value} />
            </TermValue>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------- Generic rows ---------------------------- */

function LegalTermRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-8 py-2">
      <div className="col-span-1 font-sans-neue text-sm text-muted-foreground">
        {label}
      </div>
      <div className="col-span-1 flex justify-end font-sans-neue text-sm">
        {value}
      </div>
    </div>
  );
}

/**
 * A LegalTermRow whose value is editable. `rendered` is how the row displays the
 * value; `raw` is what the edit popup starts from — the two differ wherever a
 * formatter or a code-to-label mapping sits in between.
 */
function EditableTermRow({
  label,
  entityType,
  fieldKey,
  entityId,
  meta,
  raw,
  rendered,
  formatValue,
  onReverted,
}: {
  label: string;
  entityType: OverrideEntityType;
  fieldKey: string;
  entityId: number | null | undefined;
  meta: AppliedOverrideMeta | undefined;
  raw: RawValue;
  rendered: React.ReactNode;
  formatValue?: (value: Json) => string;
  onReverted: () => void;
}) {
  return (
    <LegalTermRow
      label={label}
      value={
        <TermValue
          entityType={entityType}
          fieldKey={fieldKey}
          entityId={entityId}
          meta={meta}
          label={label}
          currentRawValue={raw}
          formatValue={formatValue}
          onReverted={onReverted}
        >
          {rendered}
        </TermValue>
      }
    />
  );
}

/* --------------------------- Other Legal Terms --------------------------- */

type BooleanTermKey = {
  [K in keyof OtherLegalTerms]: OtherLegalTerms[K] extends boolean ? K : never;
}[keyof OtherLegalTerms];

type NumericTermKey = {
  [K in keyof OtherLegalTerms]: OtherLegalTerms[K] extends number | null
    ? K
    : never;
}[keyof OtherLegalTerms];

/**
 * One row of the Other Legal Terms section. Only the Yes/No status rows are
 * editable, so those carry the inv_round_terms column backing them to resolve a
 * registry definition and write an override; the two numeric rows are read-only
 * and have no fieldKey.
 */
type OtherLegalTermRow =
  | { kind: 'status'; label: string; prop: BooleanTermKey; fieldKey: string }
  | { kind: 'currency' | 'days'; label: string; prop: NumericTermKey };

/** Display order, one entry per rendered column. */
const OTHER_LEGAL_TERM_COLUMNS: readonly (readonly OtherLegalTermRow[])[] = [
  [
    {
      kind: 'status',
      label: 'Pro Rata Rights (All)',
      prop: 'proRataRightsForAll',
      fieldKey: 'pro_rata_rights_all',
    },
    {
      kind: 'status',
      label: 'Pro Rata Rights (Major Investors)',
      prop: 'proRataRightsForMajorInvestors',
      fieldKey: 'pro_rata_rights_major',
    },
    {
      kind: 'status',
      label: 'Standard Pro Rata Formulation',
      prop: 'standardProRataFormulation',
      fieldKey: 'standard_pro_rata_formulation',
    },
    {
      kind: 'status',
      label: 'Drag Along',
      prop: 'dragAlong',
      fieldKey: 'drag_along',
    },
    {
      kind: 'status',
      label: 'Pay to Play',
      prop: 'payToPlay',
      fieldKey: 'pay_to_play',
    },
    {
      kind: 'status',
      label: 'D&O Insurance',
      prop: 'dAndOInsurance',
      fieldKey: 'do_insurance',
    },
    {
      kind: 'status',
      label: 'ROFR & Co-Sale Agreement',
      prop: 'rofrAndCosaleAgreement',
      fieldKey: 'rofr_cosale',
    },
    {
      kind: 'status',
      label: 'Investors Subject to ROFR',
      prop: 'investorsSubjectToROFR',
      fieldKey: 'investors_subject_to_rofr',
    },
  ],
  [
    {
      kind: 'currency',
      label: 'Investor Counsel Fee Cap',
      prop: 'investorCounselFeeCap',
    },
    {
      kind: 'status',
      label: 'Issuer Pays Investor Counsel Fees',
      prop: 'issuerPaysInvestorCounselFees',
      fieldKey: 'issuer_pays_investor_counsel',
    },
    {
      kind: 'status',
      label: 'Employee Vesting Protocol',
      prop: 'employeeVestingProtocol',
      fieldKey: 'employee_vesting_protocol',
    },
    {
      kind: 'status',
      label: 'Founder Vesting Protocol',
      prop: 'founderVestingProtocol',
      fieldKey: 'founder_vesting_applied',
    },
    {
      kind: 'status',
      label: 'Required Closing Payments',
      prop: 'requiredClosingPayments',
      fieldKey: 'required_closing_payments',
    },
    {
      kind: 'days',
      label: 'Subsequent Closing Window',
      prop: 'subsequentClosingWindowDays',
    },
    {
      kind: 'status',
      label: 'Registration Rights (Preferred)',
      prop: 'registrationRightsForPreferredInvestors',
      fieldKey: 'registration_rights_preferred',
    },
  ],
];

function OtherLegalTermRowView({
  row,
  terms,
  context,
  onReverted,
}: { row: OtherLegalTermRow; terms: OtherLegalTerms } & RowContext) {
  // Only the Yes/No status rows are editable; the two numeric rows render plain.
  if (row.kind !== 'status') {
    const amount = terms[row.prop];
    return (
      <LegalTermRow
        label={row.label}
        value={
          amount
            ? row.kind === 'currency'
              ? `$${amount.toLocaleString()}`
              : `${amount} days`
            : '-'
        }
      />
    );
  }

  const value = terms[row.prop];
  return (
    <EditableTermRow
      label={row.label}
      entityType="inv_round_terms"
      fieldKey={row.fieldKey}
      entityId={context?.roundTermsId}
      meta={context?.overridden.roundTerms[row.fieldKey]}
      onReverted={onReverted}
      raw={value}
      rendered={<BooleanDot value={value} />}
      formatValue={formatBool}
    />
  );
}

/* --------------------------------- The tab ------------------------------- */

export function LegalTermsContent({
  legalTerms,
  legalTermsEdit,
}: {
  legalTerms?: LegalTerms;
  /**
   * Override lineage for the whole tab. Omitted in round-filtered views, which
   * render every section read-only.
   */
  legalTermsEdit?: LegalTermsOverrideContext;
}) {
  const router = useRouter();
  if (!legalTerms) {
    return (
      <TabEmptyState title="Legal Terms">
        No legal terms data available for this company.
      </TabEmptyState>
    );
  }

  const {
    informationRights,
    majorInvestor,
    economicRights,
    qsbs,
    dividends,
    otherLegalTerms,
  } = legalTerms;

  const context = legalTermsEdit;
  const onReverted = () => router.refresh();
  const rowContext: RowContext = { context, onReverted };

  const roundTerms = {
    entityType: 'inv_round_terms' as const,
    entityId: context?.roundTermsId,
    onReverted,
  };
  const securityTerms = {
    entityType: 'inv_security_terms' as const,
    entityId: context?.securityTermsId,
    onReverted,
  };
  const roundTermsMeta = (key: string) => context?.overridden.roundTerms[key];
  const securityTermsMeta = (key: string) =>
    context?.overridden.securityTerms[key];

  return (
    <div className="space-y-12 pb-12">
      <TabHeader title="Legal Terms" />
      <div className="space-y-12">
        {/* Information Rights */}
        <Section title="Information Rights">
          <div>
            <div className="mb-2 grid grid-cols-4 gap-4 border-b border-foreground/10 pb-2">
              <div className="col-span-1" />
              {(['monthly', 'quarterly', 'yearEnd'] as const).map((f) => (
                <div
                  key={f}
                  className="col-span-1 text-center font-label text-[0.65rem] uppercase tracking-wider text-foreground/60"
                >
                  {FREQUENCY_LABELS[f]}
                </div>
              ))}
            </div>
            {INFORMATION_RIGHTS_ROWS.map((row) => (
              <FrequencyRow
                key={row.label}
                row={row}
                flags={informationRights[row.prop]}
                {...rowContext}
              />
            ))}
          </div>
        </Section>

        {/* Two Column Section: Major Investor + Economic Rights */}
        <div className="grid grid-cols-2 gap-12">
          <Section title="Major Investor Thresholds">
            <div className="divide-y divide-foreground/10">
              <EditableTermRow
                {...roundTerms}
                label="Threshold Amount"
                fieldKey="major_investor_threshold_amount"
                meta={roundTermsMeta('major_investor_threshold_amount')}
                raw={majorInvestor.thresholdAmount}
                rendered={
                  majorInvestor.thresholdAmount != null
                    ? `$${majorInvestor.thresholdAmount.toLocaleString()}`
                    : '-'
                }
                formatValue={formatCurrency}
              />
              <EditableTermRow
                {...roundTerms}
                label="Threshold Ownership %"
                fieldKey="major_investor_threshold_ownership_pct"
                meta={roundTermsMeta('major_investor_threshold_ownership_pct')}
                raw={majorInvestor.thresholdOwnershipPercent}
                rendered={
                  majorInvestor.thresholdOwnershipPercent != null
                    ? `${majorInvestor.thresholdOwnershipPercent.toFixed(1)}%`
                    : '-'
                }
                formatValue={formatPercent}
              />
              <EditableTermRow
                {...roundTerms}
                label="Threshold Shares"
                fieldKey="major_investor_threshold_shares"
                meta={roundTermsMeta('major_investor_threshold_shares')}
                raw={majorInvestor.thresholdShares}
                rendered={
                  majorInvestor.thresholdShares != null
                    ? majorInvestor.thresholdShares.toLocaleString()
                    : '-'
                }
                formatValue={formatCount}
              />
            </div>
            {/* Named Major Investors is a text[] column; override values are
                scalars only, so this list stays read-only. */}
            {majorInvestor.namedMajorInvestor.length > 0 && (
              <div className="mt-4 border-t border-foreground/10 pt-4">
                <p className="mb-2 font-label text-[0.65rem] uppercase tracking-wider text-foreground/60">
                  Named Major Investors
                </p>
                <div className="space-y-1">
                  {majorInvestor.namedMajorInvestor.map((investor, idx) => (
                    <p key={idx} className="font-sans-neue text-sm">
                      {investor}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section title="Economic Rights">
            <div className="divide-y divide-foreground/10">
              <EditableTermRow
                {...securityTerms}
                label="Anti-Dilution Rights"
                fieldKey="anti_dilution_type"
                meta={securityTermsMeta('anti_dilution_type')}
                raw={context?.values.antiDilutionType ?? null}
                rendered={economicRights.antiDilutionRights || '-'}
                formatValue={formatAntiDilution}
              />
              <EditableTermRow
                {...roundTerms}
                label="Milestone Closings"
                fieldKey="milestone_closings"
                meta={roundTermsMeta('milestone_closings')}
                raw={economicRights.milestoneClosings}
                rendered={
                  <BooleanDot value={economicRights.milestoneClosings} />
                }
                formatValue={formatBool}
              />
              <EditableTermRow
                {...securityTerms}
                label="Liquidation Preference Seniority"
                fieldKey="liquidation_seniority"
                meta={securityTermsMeta('liquidation_seniority')}
                raw={context?.values.liquidationSeniority ?? null}
                rendered={
                  economicRights.liquidationPreferenceSeniority.join(', ') ||
                  '-'
                }
                formatValue={formatCount}
              />
            </div>
          </Section>
        </div>

        {/* Two Column Section: QSBS + Dividends */}
        <div className="grid grid-cols-2 gap-12">
          <Section title="QSBS">
            <div className="divide-y divide-foreground/10">
              <EditableTermRow
                {...roundTerms}
                label="QSBS Covenant Given"
                fieldKey="qsbs_covenant_given"
                meta={roundTermsMeta('qsbs_covenant_given')}
                raw={qsbs.qualifiedSmallBusinessStockCovenantGiven}
                rendered={
                  <BooleanDot
                    value={qsbs.qualifiedSmallBusinessStockCovenantGiven}
                  />
                }
                formatValue={formatBool}
              />
              <EditableTermRow
                {...roundTerms}
                label="QSBS Rep Made"
                fieldKey="qsbs_rep_made"
                meta={roundTermsMeta('qsbs_rep_made')}
                raw={qsbs.qualifiedSmallBusinessRepMade}
                rendered={
                  <BooleanDot value={qsbs.qualifiedSmallBusinessRepMade} />
                }
                formatValue={formatBool}
              />
            </div>
          </Section>

          <Section title="Dividends">
            <div className="divide-y divide-foreground/10">
              <EditableTermRow
                {...securityTerms}
                label="Accruing Dividends"
                fieldKey="dividend_accruing"
                meta={securityTermsMeta('dividend_accruing')}
                raw={dividends.accruingDividends}
                rendered={<BooleanDot value={dividends.accruingDividends} />}
                formatValue={formatBool}
              />
              <EditableTermRow
                {...securityTerms}
                label="Cumulative Dividends"
                fieldKey="dividend_cumulative"
                meta={securityTermsMeta('dividend_cumulative')}
                raw={dividends.cumulativeDividends}
                rendered={<BooleanDot value={dividends.cumulativeDividends} />}
                formatValue={formatBool}
              />
              <EditableTermRow
                {...securityTerms}
                label="Dividend Rate"
                fieldKey="dividend_rate"
                meta={securityTermsMeta('dividend_rate')}
                raw={context?.values.dividendRate ?? null}
                rendered={
                  dividends.dividendRate != null
                    ? `${dividends.dividendRate.toFixed(1)}%`
                    : '-'
                }
                formatValue={formatPercent}
              />
              <EditableTermRow
                {...securityTerms}
                label="Dividend Seniority"
                fieldKey="dividend_seniority"
                meta={securityTermsMeta('dividend_seniority')}
                raw={context?.values.dividendSeniority ?? null}
                rendered={formatDividendSeniority(dividends.dividendSeniority)}
                formatValue={formatSeniorityRank}
              />
            </div>
          </Section>
        </div>

        {/* Other Legal Terms */}
        <Section title="Other Legal Terms">
          <div className="grid grid-cols-2 gap-x-12">
            {OTHER_LEGAL_TERM_COLUMNS.map((rows, index) => (
              <div key={index} className="divide-y divide-foreground/10">
                {rows.map((row) => (
                  <OtherLegalTermRowView
                    key={row.label}
                    row={row}
                    terms={otherLegalTerms}
                    {...rowContext}
                  />
                ))}
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
