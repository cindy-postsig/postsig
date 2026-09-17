import { xirr } from '@/lib/finance/xirr';
import type { InvCashFlow } from './service';
import type { PortfolioCompany } from './types';

export interface PortfolioMetrics {
  companyCount: number;
  totalInvested: number;
  totalFMV: number;
  tvpi: number | null;
  dpi: number | null;
  grossIrr: number | null;
}

/**
 * Top-line portfolio metrics for a (possibly fund-filtered) set of companies.
 * Gross IRR is scoped to the same company set as TVPI/DPI so all tiles reconcile;
 * current FMV is appended as the terminal cash flow at `asOf`.
 */
export function computePortfolioMetrics(
  companies: PortfolioCompany[],
  cashFlows: InvCashFlow[],
  asOf: Date,
): PortfolioMetrics {
  const invested = companies.reduce((sum, c) => sum + c.myAggregateCost, 0);
  const fmv = companies.reduce((sum, c) => sum + c.myTotalFMV, 0);
  const proceeds = companies.reduce((sum, c) => sum + c.realizedProceeds, 0);

  const companyIds = new Set(companies.map((c) => c.entityId));
  const irrFlows = cashFlows
    .filter((cf) => companyIds.has(cf.companyId))
    .map((cf) => ({ amount: cf.amount, date: new Date(cf.date) }));
  if (fmv > 0) {
    irrFlows.push({ amount: fmv, date: asOf });
  }

  return {
    companyCount: companies.filter((c) => c.investmentStatus === 'Active')
      .length,
    totalInvested: invested,
    totalFMV: fmv,
    tvpi: invested > 0 ? (fmv + proceeds) / invested : null,
    dpi: invested > 0 ? proceeds / invested : null,
    grossIrr: xirr(irrFlows),
  };
}
