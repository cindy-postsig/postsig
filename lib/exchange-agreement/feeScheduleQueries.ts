// Pure, client-safe query layer over an already-fetched FeeScheduleDataset —
// no I/O. Kept separate from feeSchedules.ts because that file's top-level
// `createClient` import pulls in next/headers; importing anything from it
// into a client component breaks the build regardless of which export is
// actually used.
import { diffFeeScheduleVersions } from './diff';
import { formatMonthYear, formatVersionLabel } from './format';
import type {
  ExchangeSummary,
  FeeScheduleLineItem,
  FeeScheduleVersion,
  ProductLineSummary,
} from './types';

// Sentinel productLine value meaning "every product line" — used by the
// sidebar's Product Line filter and threaded through the functions below.
export const ALL_PRODUCT_LINES = 'All';

export interface ExchangeRow {
  code: string;
  name: string;
  currency: string;
}

export interface RawVersion {
  id: number;
  version: string;
  effective_date: string;
  invalidated_date: string | null;
  // Already-signed, ready to use -- the raw storage path never leaves the
  // server-only fetch layer (see withSignedSourceDocUrls in feeSchedules.ts).
  source_document_url: string | null;
}

export interface FeeScheduleDataset {
  exchange: ExchangeRow;
  rawVersions: RawVersion[]; // sorted newest-first
  versions: FeeScheduleVersion[]; // one per (rawVersion, productLine actually present in it)
  lineItems: FeeScheduleLineItem[];
}

// Synthesized id: fee_schedule_versions is release-wide, but a logical
// version is per (version, product line). No product line name contains
// ':', so splitting on the first one below safely recovers the raw id.
export function versionFeId(rawVersionId: number, productLine: string): string {
  return `${rawVersionId}:${productLine}`;
}

function rawVersionIdOf(versionFeIdValue: string): number {
  return Number(versionFeIdValue.slice(0, versionFeIdValue.indexOf(':')));
}

export function toFeeScheduleVersion(
  raw: RawVersion,
  exchangeCode: string,
  productLine: string,
): FeeScheduleVersion {
  return {
    id: versionFeId(raw.id, productLine),
    exchangeCode,
    productLine,
    version: raw.version,
    label: formatVersionLabel(raw.version, raw.effective_date),
    effectiveDate: raw.effective_date,
    invalidatedDate: raw.invalidated_date,
    sourceDocumentUrl: raw.source_document_url,
  };
}

interface Indices {
  lineItemsByVersion: Map<string, FeeScheduleLineItem[]>;
  versionsByProductLine: Map<string, FeeScheduleVersion[]>;
  versionById: Map<string, FeeScheduleVersion>;
  productLineByProductId: Map<string, string>;
  productLineNames: string[];
}

// Keyed on the dataset object reference: every FromDataset function below
// calls buildIndices on the same dataset the caller already fetched once, so
// memoizing here — instead of threading pre-built indices through every
// exported signature — dedupes the O(lineItems) scan across repeated calls
// (e.g. a client component re-deriving on every selection change) for free.
const indicesCache = new WeakMap<FeeScheduleDataset, Indices>();

function buildIndices(dataset: FeeScheduleDataset): Indices {
  const cached = indicesCache.get(dataset);
  if (cached) return cached;

  const lineItemsByVersion = new Map<string, FeeScheduleLineItem[]>();
  for (const item of dataset.lineItems) {
    const existing = lineItemsByVersion.get(item.versionId);
    if (existing) existing.push(item);
    else lineItemsByVersion.set(item.versionId, [item]);
  }

  const versionsByProductLine = new Map<string, FeeScheduleVersion[]>();
  for (const version of dataset.versions) {
    const byLine = versionsByProductLine.get(version.productLine);
    if (byLine) byLine.push(version);
    else versionsByProductLine.set(version.productLine, [version]);
  }
  // Each bucket is already newest-first: dataset.versions was built from
  // rawVersions in that order.

  const versionById = new Map(dataset.versions.map((v) => [v.id, v]));

  const productLineByProductId = new Map<string, string>();
  for (const item of dataset.lineItems) {
    if (productLineByProductId.has(item.productId)) continue;
    const version = versionById.get(item.versionId);
    if (version)
      productLineByProductId.set(item.productId, version.productLine);
  }

  const indices: Indices = {
    lineItemsByVersion,
    versionsByProductLine,
    versionById,
    productLineByProductId,
    productLineNames: Array.from(versionsByProductLine.keys()),
  };
  indicesCache.set(dataset, indices);
  return indices;
}

function versionsOldestFirst(
  indices: Indices,
  productLine: string,
): FeeScheduleVersion[] {
  return (indices.versionsByProductLine.get(productLine) ?? [])
    .slice()
    .reverse();
}

function latestVersionOf(
  indices: Indices,
  productLine: string,
): FeeScheduleVersion | undefined {
  const versions = versionsOldestFirst(indices, productLine);
  return versions[versions.length - 1];
}

// Versions sharing the same `version` number across product lines are one
// logical release (version/effective_date are release-wide), so "All" is
// just every raw version row directly.
function logicalVersions(dataset: FeeScheduleDataset): FeeScheduleVersion[] {
  return dataset.rawVersions.map((raw) =>
    toFeeScheduleVersion(raw, dataset.exchange.code, ALL_PRODUCT_LINES),
  );
}

function lineItemsForLogicalVersion(
  dataset: FeeScheduleDataset,
  indices: Indices,
  version: string,
): FeeScheduleLineItem[] {
  // dataset.versions already has one entry per (rawVersionId, productLine)
  // pair actually present in the data — buildDataset computed that mapping
  // once, so re-deriving it here by scanning every line item is redundant.
  return dataset.rawVersions
    .filter((raw) => raw.version === version)
    .flatMap((raw) =>
      dataset.versions
        .filter((v) => rawVersionIdOf(v.id) === raw.id)
        .flatMap((v) => indices.lineItemsByVersion.get(v.id) ?? []),
    );
}

// Trims a dataset down to one product line before it crosses into a client
// component — otherwise every page ships the whole exchange's line items
// (~22k for euronext) even when displaying one line's ~2k-row slice.
export function scopeDatasetToProductLine(
  dataset: FeeScheduleDataset,
  productLine: string,
): FeeScheduleDataset {
  if (productLine === ALL_PRODUCT_LINES) return dataset;

  const versions = dataset.versions.filter(
    (v) => v.productLine === productLine,
  );
  const versionIds = new Set(versions.map((v) => v.id));
  return {
    exchange: dataset.exchange,
    rawVersions: dataset.rawVersions,
    versions,
    lineItems: dataset.lineItems.filter((item) =>
      versionIds.has(item.versionId),
    ),
  };
}

export function getProductLineNamesFromDataset(
  dataset: FeeScheduleDataset,
): string[] {
  return buildIndices(dataset).productLineNames;
}

export function getVersionsFromDataset(
  dataset: FeeScheduleDataset,
  productLine: string,
): FeeScheduleVersion[] {
  if (productLine === ALL_PRODUCT_LINES) return logicalVersions(dataset);
  return (
    buildIndices(dataset).versionsByProductLine.get(productLine) ?? []
  ).slice();
}

// Pure counterpart of feeSchedules.ts's getProductLines, for callers that
// already have a dataset and shouldn't trigger another fetch for it.
export function getProductLinesFromDataset(
  dataset: FeeScheduleDataset,
): ProductLineSummary[] {
  const indices = buildIndices(dataset);
  return indices.productLineNames.map((productLine) => {
    // versionsByProductLine buckets are newest-first (see buildIndices).
    const [latest, previous] =
      indices.versionsByProductLine.get(productLine) ?? [];
    const itemsForVersion = (version: FeeScheduleVersion | undefined) =>
      version ? (indices.lineItemsByVersion.get(version.id) ?? []) : [];
    const latestItems = itemsForVersion(latest);

    const { summary } = diffFeeScheduleVersions(
      itemsForVersion(previous),
      latestItems,
    );

    return {
      productLine,
      productCount: latestItems.length,
      productsWithPriceChange: summary.productsWithPriceChange,
      lastPricingUpdateLabel: latest
        ? formatMonthYear(latest.effectiveDate)
        : '—',
      lastPricingUpdateDate: latest?.effectiveDate ?? null,
      annualImpact: summary.annualImpact,
      currency: latestItems[0]?.currency ?? '€',
    };
  });
}

// Pure counterpart of feeSchedules.ts's summarizeExchange/getExchange.
export function getExchangeSummaryFromDataset(
  dataset: FeeScheduleDataset,
  productLines: ProductLineSummary[],
): ExchangeSummary {
  const latestEffectiveDate = dataset.rawVersions[0]?.effective_date ?? null;
  return {
    code: dataset.exchange.code,
    name: dataset.exchange.name,
    currency: dataset.exchange.currency,
    productLineCount: productLines.length,
    annualImpact:
      productLines.length > 0
        ? productLines.reduce((sum, line) => sum + line.annualImpact, 0)
        : null,
    lastPricingUpdateLabel: latestEffectiveDate
      ? formatMonthYear(latestEffectiveDate)
      : null,
  };
}

export function getVersionComparisonFromDataset(
  dataset: FeeScheduleDataset,
  productLine: string,
  previousId: string,
  latestId: string,
) {
  const indices = buildIndices(dataset);

  const versions =
    productLine === ALL_PRODUCT_LINES
      ? logicalVersions(dataset)
      : (indices.versionsByProductLine.get(productLine) ?? []);
  const previous = versions.find((v) => v.id === previousId);
  const latest = versions.find((v) => v.id === latestId);
  if (!previous || !latest) return null;

  // The diff direction follows whichever slot the caller put each version
  // in -- not chronological order -- so picking an earlier version as
  // "latest" reverses the comparison (added/removed and +/- swap) instead
  // of being silently re-sorted back to newest-first.
  const itemsFor = (v: FeeScheduleVersion) =>
    productLine === ALL_PRODUCT_LINES
      ? lineItemsForLogicalVersion(dataset, indices, v.version)
      : (indices.lineItemsByVersion.get(v.id) ?? []);

  const diff = diffFeeScheduleVersions(itemsFor(previous), itemsFor(latest));

  return { previous, latest, ...diff };
}

export interface ProductExplorerRow {
  productId: string;
  productLine: string;
  title: string;
  assetClass: string | null;
  useType: string;
  level: string | null;
  currency: string | null;
  currentFee: number | null;
  lastChange: number | null;
  trend: number[];
}

export function getLatestLineItemsFromDataset(
  dataset: FeeScheduleDataset,
  productLine: string,
): FeeScheduleLineItem[] {
  const indices = buildIndices(dataset);

  if (productLine === ALL_PRODUCT_LINES) {
    return indices.productLineNames.flatMap((line) => {
      const latest = latestVersionOf(indices, line);
      return latest ? (indices.lineItemsByVersion.get(latest.id) ?? []) : [];
    });
  }

  const latest = latestVersionOf(indices, productLine);
  return latest ? (indices.lineItemsByVersion.get(latest.id) ?? []) : [];
}

function productExplorerForLine(
  indices: Indices,
  productLine: string,
  targetRawVersionId?: number,
): ProductExplorerRow[] {
  const allVersions = versionsOldestFirst(indices, productLine);
  // "Latest" (the default) is the last entry; viewing "as of" a past version
  // truncates history there instead, so lastChange/trend below don't leak
  // data from versions newer than the one the user asked to see.
  const targetIndex =
    targetRawVersionId != null
      ? allVersions.findIndex(
          (v) => rawVersionIdOf(v.id) === targetRawVersionId,
        )
      : allVersions.length - 1;
  if (targetIndex === -1) return [];
  const versions = allVersions.slice(0, targetIndex + 1);

  const latestVersion = versions[versions.length - 1];
  if (!latestVersion) return [];

  const latestItems = indices.lineItemsByVersion.get(latestVersion.id) ?? [];
  const previousVersion = versions[versions.length - 2];

  // Reuse the same delta the version-comparison view computes, instead of
  // re-deriving "fee - previousFee" a second way.
  const lastChangeByProduct = new Map(
    diffFeeScheduleVersions(
      previousVersion
        ? (indices.lineItemsByVersion.get(previousVersion.id) ?? [])
        : [],
      latestItems,
    ).rows.map((row) => [row.productId, row.change]),
  );

  const feeByProductPerVersion = versions.map(
    (version) =>
      new Map(
        (indices.lineItemsByVersion.get(version.id) ?? []).map((row) => [
          row.productId,
          row.fee,
        ]),
      ),
  );

  return latestItems.map((item) => ({
    productId: item.productId,
    productLine,
    title: item.title,
    assetClass: item.assetClass,
    useType: item.useType,
    level: item.level,
    currency: item.currency,
    currentFee: item.fee,
    lastChange: lastChangeByProduct.get(item.productId) ?? null,
    trend: feeByProductPerVersion
      .map((feeByProduct) => feeByProduct.get(item.productId) ?? null)
      .filter((fee): fee is number => fee != null),
  }));
}

export function getProductExplorerFromDataset(
  dataset: FeeScheduleDataset,
  productLine: string,
  // A specific FeeScheduleVersion id -- either one product line's own (the
  // single-line case) or a logical "All" version's (versionFeId's rawVersionId
  // is shared release-wide, so this resolves the same way in both cases).
  targetVersionId?: string,
): ProductExplorerRow[] {
  const indices = buildIndices(dataset);
  const targetRawVersionId = targetVersionId
    ? rawVersionIdOf(targetVersionId)
    : undefined;
  if (productLine === ALL_PRODUCT_LINES) {
    return indices.productLineNames.flatMap((line) =>
      productExplorerForLine(indices, line, targetRawVersionId),
    );
  }
  return productExplorerForLine(indices, productLine, targetRawVersionId);
}

// The set of productIds present in each version -- for callers that only
// need cheap membership checks (e.g. counting how many of a fixed list of
// products show up per version). Deliberately skips the trend/diff work
// getProductExplorerFromDataset does per version, since building that once
// per version in a loop makes the caller's total cost quadratic in the
// number of versions for no benefit.
export function getProductIdsByVersion(
  dataset: FeeScheduleDataset,
  productLine: string,
): Map<string, Set<string>> {
  const indices = buildIndices(dataset);
  const versions =
    productLine === ALL_PRODUCT_LINES
      ? logicalVersions(dataset)
      : (indices.versionsByProductLine.get(productLine) ?? []);

  return new Map(
    versions.map((version) => {
      const items =
        productLine === ALL_PRODUCT_LINES
          ? lineItemsForLogicalVersion(dataset, indices, version.version)
          : (indices.lineItemsByVersion.get(version.id) ?? []);
      return [version.id, new Set(items.map((item) => item.productId))];
    }),
  );
}

export interface ProductHistoryPoint {
  versionLabel: string;
  effectiveDate: string;
  fee: number | null;
}

export interface ProductHistory {
  productId: string;
  title: string;
  productLine: string;
  currency: string | null;
  points: ProductHistoryPoint[];
  // From the most recent priced version -- a product's source document can
  // change between versions, so this always reflects "where this product's
  // current price came from", not a fixed per-product link.
  sourceDocumentUrl: string | null;
  sourcePage: number | null;
}

export function getProductHistoryFromDataset(
  dataset: FeeScheduleDataset,
  productLine: string,
  productId: string,
): ProductHistory | null {
  const indices = buildIndices(dataset);

  const resolvedProductLine =
    productLine === ALL_PRODUCT_LINES
      ? (indices.productLineByProductId.get(productId) ?? productLine)
      : productLine;

  let reference: FeeScheduleLineItem | undefined;
  let referenceVersion: FeeScheduleVersion | undefined;
  const points: ProductHistoryPoint[] = versionsOldestFirst(
    indices,
    resolvedProductLine,
  ).map((version) => {
    const item = (indices.lineItemsByVersion.get(version.id) ?? []).find(
      (row) => row.productId === productId,
    );
    if (item) {
      reference = item;
      referenceVersion = version;
    }
    return {
      versionLabel: version.label,
      effectiveDate: version.effectiveDate,
      fee: item?.fee ?? null,
    };
  });

  if (!reference) return null;

  return {
    productId,
    title: reference.title,
    productLine: resolvedProductLine,
    currency: reference.currency,
    points,
    sourceDocumentUrl: referenceVersion?.sourceDocumentUrl ?? null,
    sourcePage: reference.page,
  };
}
