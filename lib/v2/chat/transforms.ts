/**
 * Chat Transforms Module
 *
 * Pure functions for transforming chat tool outputs into display-ready formats.
 * These functions handle formatting, summarization, and data extraction.
 */

import type {
  ContractSpendDetail,
  ExcerptData,
  DataQueryResult,
  QueryContractsResult,
} from './types';

/**
 * Format a number as currency. Defaults to USD for server-side chat paths
 * (tool summary strings) where no org base-currency metadata is reachable;
 * client renderers pass the org base currency.
 */
export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Round a number to 2 decimal places
 */
export function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Build a spend summary string for a single contract
 */
export function buildSingleContractSpendSummary(
  detail: ContractSpendDetail,
): string {
  return `Contract "${detail.contractId}" with ${detail.vendorName}: TCV ${formatCurrency(detail.totalContractValueUSD)}, Current Annual ${formatCurrency(detail.currentBudgetUSD)}, Projected Annual ${formatCurrency(detail.projectedBudgetUSD)}`;
}

/**
 * Build a spend summary string for vendor totals
 */
export function buildVendorSpendSummary(
  vendorName: string,
  contractCount: number,
  totalContractValue: number,
  currentBudget: number,
  projectedBudget: number,
): string {
  return `${vendorName} has ${contractCount} contract(s): Total TCV ${formatCurrency(totalContractValue)}, Current Annual Spend ${formatCurrency(currentBudget)}, Projected Annual Spend ${formatCurrency(projectedBudget)}`;
}

/**
 * Extract excerpt data from query contracts result
 * Returns array of all excerpts from matching contracts
 */
export function extractExcerptData(
  result: QueryContractsResult,
): ExcerptData[] {
  if (
    result &&
    typeof result === 'object' &&
    'type' in result &&
    result.type === 'data_query'
  ) {
    const dataResult = result as DataQueryResult;
    return dataResult.excerpts;
  }
  return [];
}

/**
 * Build a contract link path
 */
export function buildContractLink(contractId: number): string {
  return `/contracts/${contractId}`;
}

/**
 * Build a vendor link path
 */
export function buildVendorLink(vendorId: number): string {
  return `/vendors/${vendorId}`;
}

/**
 * Convert contract references in text to markdown links.
 * Handles multiple formats:
 * - (contract-123) -> [Contract #123](/contracts/123)
 * - contract-123 -> [Contract #123](/contracts/123)
 * - [Contract #123] -> [Contract #123](/contracts/123)
 * - Contract #123 -> [Contract #123](/contracts/123)
 */
export function linkifyContractReferences(text: string): string {
  // Pattern for (contract-123) or contract-123 (with word boundary)
  const hyphenatedPattern =
    /\(contract-(\d+)\)|(?<![[\w])contract-(\d+)(?!\])/gi;

  // Pattern for [Contract #123] without a following link
  const bracketPattern = /\[Contract #(\d+)\](?!\()/gi;

  // Pattern for Contract #123 (standalone, not already in markdown)
  const hashPattern = /(?<![[\w])Contract #(\d+)(?![)\]])/g;

  let result = text;

  // Replace (contract-123) and contract-123
  result = result.replace(hyphenatedPattern, (match, p1, p2) => {
    const id = p1 || p2;
    return `[Contract #${id}](/contracts/${id})`;
  });

  // Replace [Contract #123] (convert to proper markdown link)
  result = result.replace(bracketPattern, (_, id) => {
    return `[Contract #${id}](/contracts/${id})`;
  });

  // Replace standalone Contract #123
  result = result.replace(hashPattern, (_, id) => {
    return `[Contract #${id}](/contracts/${id})`;
  });

  // Vendor patterns - same approach as contracts
  // Pattern for (vendor-123) and vendor-123
  const vendorHyphenatedPattern =
    /\(vendor-(\d+)\)|(?<![[\w])vendor-(\d+)(?!\])/gi;

  // Pattern for [Vendor `#123`] without a following link
  const vendorBracketPattern = /\[Vendor #(\d+)\](?!\()/gi;

  // Pattern for Vendor `#123` (standalone, not already in markdown)
  const vendorHashPattern = /(?<![[\w])Vendor #(\d+)(?![)\]])/g;

  // Pattern for /vendors/123 paths not already in markdown links
  const vendorPathPattern = /(?<![\w(])\/vendors\/(\d+)(?!\))/g;

  result = result.replace(vendorHyphenatedPattern, (_, p1, p2) => {
    const id = p1 || p2;
    return `[Vendor #${id}](/vendors/${id})`;
  });
  result = result.replace(vendorBracketPattern, (_, id) => {
    return `[Vendor #${id}](/vendors/${id})`;
  });
  result = result.replace(vendorHashPattern, (_, id) => {
    return `[Vendor #${id}](/vendors/${id})`;
  });
  result = result.replace(vendorPathPattern, (_, id) => {
    return `[Vendor #${id}](/vendors/${id})`;
  });

  return result;
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(
  text: string | undefined | null,
  maxLength: number,
): string | undefined {
  if (!text) return undefined;
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
}

/**
 * Format contract type from type_id using reverse map
 */
export function formatContractType(
  typeId: number | string | undefined,
  reverseMap: Record<string | number, string>,
): string | undefined {
  if (typeId === undefined || typeId === null) return undefined;
  return reverseMap[typeId];
}

/**
 * Extract TCV from price history object
 */
export function extractTCV(
  priceHistory: {
    effectiveTotalContractValueUSD?: number;
    totalContractValueUSD?: number;
    totalContractValue?: number;
  } | null,
): number {
  if (!priceHistory) return 0;
  return (
    priceHistory.effectiveTotalContractValueUSD ??
    priceHistory.totalContractValueUSD ??
    priceHistory.totalContractValue ??
    0
  );
}

/**
 * Extract annual contract value from price history
 */
export function extractAnnualValue(
  priceHistory: {
    annualContractValueUSD?: number;
    annualContractValue?: number;
  } | null,
): number {
  if (!priceHistory) return 0;
  return (
    priceHistory.annualContractValueUSD ?? priceHistory.annualContractValue ?? 0
  );
}

/**
 * Extract projected value from price history periods
 */
export function extractProjectedValue(
  priceHistory: {
    periods?: Array<{
      status?: string;
      feesUSD?: number;
      fees?: number;
    }>;
    annualContractValueUSD?: number;
    annualContractValue?: number;
  } | null,
): number {
  if (!priceHistory) return 0;

  const projectedPeriod = priceHistory.periods?.find(
    (p) => p.status === 'projected',
  );

  if (projectedPeriod) {
    return projectedPeriod.feesUSD ?? projectedPeriod.fees ?? 0;
  }

  return (
    priceHistory.annualContractValueUSD ?? priceHistory.annualContractValue ?? 0
  );
}
