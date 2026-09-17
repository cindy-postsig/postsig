/**
 * Portfolio calculations for investor module.
 *
 * Business logic for calculating MOIC and other portfolio metrics.
 * These functions are used by the service layer to enrich portfolio data.
 */

import type {
  PortfolioCompany,
  InvestmentTransaction,
} from '@/lib/v2/inv/types';

/**
 * Extract totals from transactions
 */
function getTransactionTotals(transactions: InvestmentTransaction[]): {
  totalCost: number;
  realizedProceeds: number;
} {
  let totalCost = 0;
  let realizedProceeds = 0;

  for (const tx of transactions) {
    if (tx.flowType === 'exit' || tx.flowType === 'distribution') {
      realizedProceeds += tx.amount;
    } else {
      // Default to investment if flowType not specified
      totalCost += tx.amount;
    }
  }

  return { totalCost, realizedProceeds };
}

/**
 * Calculate MOIC for a portfolio of companies
 * MOIC = (Total Realized Proceeds + Total FMV) / Total Cost
 */
export function calculatePortfolioMOIC(
  companies: PortfolioCompany[],
): number | null {
  let totalCost = 0;
  let totalRealizedProceeds = 0;
  let totalFMV = 0;

  for (const company of companies) {
    const { totalCost: companyCost, realizedProceeds } = getTransactionTotals(
      company.transactions || [],
    );
    totalCost += companyCost;
    totalRealizedProceeds += realizedProceeds;

    // Only add FMV for active companies (exited companies have realized value)
    if (company.investmentStatus === 'Active') {
      totalFMV += company.myTotalFMV;
    }
  }

  if (totalCost === 0) return null;

  return (totalRealizedProceeds + totalFMV) / totalCost;
}

/**
 * Calculate MOIC for a single company
 */
export function calculateCompanyMOIC(company: PortfolioCompany): number | null {
  const { totalCost, realizedProceeds } = getTransactionTotals(
    company.transactions || [],
  );

  if (totalCost === 0) return null;

  const fmv = company.investmentStatus === 'Active' ? company.myTotalFMV : 0;
  return (realizedProceeds + fmv) / totalCost;
}

/**
 * Calculate combined gains (realized + unrealized)
 * Total Gain = (Total Realized Proceeds + Total FMV) - Total Cost
 */
export function calculatePortfolioGains(companies: PortfolioCompany[]): {
  totalGain: number;
  totalCost: number;
  totalValue: number;
} {
  let totalCost = 0;
  let totalRealizedProceeds = 0;
  let totalFMV = 0;

  for (const company of companies) {
    const { totalCost: companyCost, realizedProceeds } = getTransactionTotals(
      company.transactions || [],
    );
    totalCost += companyCost;
    totalRealizedProceeds += realizedProceeds;

    if (company.investmentStatus === 'Active') {
      totalFMV += company.myTotalFMV;
    }
  }

  const totalValue = totalRealizedProceeds + totalFMV;
  const totalGain = totalValue - totalCost;

  return { totalGain, totalCost, totalValue };
}

/**
 * Format MOIC as multiple string
 */
export function formatMOIC(moic: number | null): string {
  if (moic === null) return 'N/A';
  return `${moic.toFixed(1)}x`;
}
