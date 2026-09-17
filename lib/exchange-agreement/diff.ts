import type { FeeScheduleLineItem } from './types';

export interface DiffRow {
  productId: string;
  title: string;
  assetClass: string | null;
  useType: string;
  level: string | null;
  previousFee: number | null;
  latestFee: number | null;
  change: number | null;
  changePercent: number | null;
  annualImpact: number | null;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
}

export interface VersionDiffSummary {
  productsWithPriceChange: number;
  priceIncreases: number;
  priceDecreases: number;
  productsAdded: number;
  productsRemoved: number;
  annualImpact: number;
}

export interface VersionDiff {
  rows: DiffRow[];
  summary: VersionDiffSummary;
}

// Fees in this dataset are monthly recurring charges, so the annual impact
// of a change is the delta scaled to a year.
const MONTHS_PER_YEAR = 12;

// Shared by diffFeeScheduleVersions (full row set) and by callers that need
// the same aggregate stats for a filtered subset of rows (e.g. the sidebar's
// Asset Class/Use Type/Level filters) -- the stat totals must stay derived
// from whatever rows are actually being shown, not always the full diff.
export function summarizeDiffRows(rows: DiffRow[]): VersionDiffSummary {
  const summary: VersionDiffSummary = {
    productsWithPriceChange: 0,
    priceIncreases: 0,
    priceDecreases: 0,
    productsAdded: 0,
    productsRemoved: 0,
    annualImpact: 0,
  };

  for (const row of rows) {
    if (row.status === 'changed') {
      summary.productsWithPriceChange++;
      if (row.change != null && row.change > 0) summary.priceIncreases++;
      else if (row.change != null && row.change < 0) summary.priceDecreases++;
      if (row.annualImpact != null) summary.annualImpact += row.annualImpact;
    } else if (row.status === 'added') {
      summary.productsAdded++;
    } else if (row.status === 'removed') {
      summary.productsRemoved++;
    }
  }

  return summary;
}

export function diffFeeScheduleVersions(
  previous: FeeScheduleLineItem[],
  latest: FeeScheduleLineItem[],
): VersionDiff {
  const previousByProduct = new Map(
    previous.map((item) => [item.productId, item]),
  );
  const latestByProduct = new Map(latest.map((item) => [item.productId, item]));
  const productIds = new Set([
    ...previousByProduct.keys(),
    ...latestByProduct.keys(),
  ]);

  const rows: DiffRow[] = [];

  for (const productId of productIds) {
    const previousItem = previousByProduct.get(productId) ?? null;
    const latestItem = latestByProduct.get(productId) ?? null;
    const reference = latestItem ?? previousItem;
    if (!reference) continue;

    const previousFee = previousItem?.fee ?? null;
    const latestFee = latestItem?.fee ?? null;

    let status: DiffRow['status'];
    if (!previousItem) status = 'added';
    else if (!latestItem) status = 'removed';
    else if (previousFee !== latestFee) status = 'changed';
    else status = 'unchanged';

    const change =
      previousFee != null && latestFee != null ? latestFee - previousFee : null;
    const changePercent =
      change != null && previousFee ? (change / previousFee) * 100 : null;
    // change is null when a product is present in both versions but its fee
    // is null on one side (price unknown, not added/removed) — there's no
    // well-defined dollar impact to report for that case.
    const annualImpact =
      status === 'changed' && change != null ? change * MONTHS_PER_YEAR : null;

    rows.push({
      productId,
      title: reference.title,
      assetClass: reference.assetClass,
      useType: reference.useType,
      level: reference.level,
      previousFee,
      latestFee,
      change,
      changePercent,
      annualImpact,
      status,
    });
  }

  rows.sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0));

  return { rows, summary: summarizeDiffRows(rows) };
}
