/**
 * Portfolio data coverage: which portcos the org holds transaction-level data
 * for, which hold KPI data only, and which hold neither.
 */

export type InvDataCoverage = 'transactions' | 'kpi_only' | 'none';

/** Display labels for the portfolio list's Data Coverage column. */
export const INV_DATA_COVERAGE_LABELS: Record<InvDataCoverage, string> = {
  transactions: 'Transaction Data',
  kpi_only: 'KPI Only',
  none: 'No Data',
};

/**
 * A portco has transaction data when the org holds at least one
 * `inv_transaction` row for it.
 */
export function hasInvTransactionData(input: {
  transactionCount: number;
  fundIds: number[] | null;
}): boolean {
  return input.transactionCount > 0 || (input.fundIds?.length ?? 0) > 0;
}

export function resolveInvDataCoverage(company: {
  hasTransactionData: boolean;
  hasKpiData?: boolean;
}): InvDataCoverage {
  if (company.hasTransactionData) return 'transactions';
  return company.hasKpiData ? 'kpi_only' : 'none';
}

export function invDataCoverageLabel(company: {
  hasTransactionData: boolean;
  hasKpiData?: boolean;
}): string {
  return INV_DATA_COVERAGE_LABELS[resolveInvDataCoverage(company)];
}
