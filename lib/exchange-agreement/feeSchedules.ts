import 'server-only';
import { cache } from 'react';
import { getHash } from '@/app/lib/utils';
import { createClient } from '@/utils/supabase/server';
import { getCacheService } from '@/app/lib/redis/cache-service';
import logger from '@/utils/pino';
import {
  ALL_PRODUCT_LINES,
  getExchangeSummaryFromDataset,
  getProductExplorerFromDataset,
  getProductLinesFromDataset,
  getVersionsFromDataset,
  scopeDatasetToProductLine,
  toFeeScheduleVersion,
  versionFeId,
  type ExchangeRow,
  type FeeScheduleDataset,
  type RawVersion,
} from './feeScheduleQueries';
import type {
  ExchangeSummary,
  FeeScheduleLineItem,
  FeeScheduleVersion,
} from './types';

export {
  ALL_PRODUCT_LINES,
  getExchangeSummaryFromDataset,
  getProductExplorerFromDataset,
  getProductLinesFromDataset,
  getVersionsFromDataset,
  scopeDatasetToProductLine,
  type FeeScheduleDataset,
};

// 25-45% of rows per vintage have a NULL section_family (untagged by the
// parsing pipeline); grouped under "Other" to match the reference POC rather
// than baking a fallback label into stored data.
const OTHER_PRODUCT_LINE = 'Other';

export interface RawLineItem {
  id: number;
  version_id: number;
  product_id: string;
  title: string;
  section_family: string | null;
  asset_class: string | null;
  use_type: string | null;
  level: string | null;
  fee: number | null;
  currency: string | null;
  product_code: string | null;
  product_code_root: string | null;
  customer_tier: string | null;
  user_class: string | null;
  distribution_channel: string | null;
  data_timeliness: string | null;
  display_medium: string | null;
  granularity: string | null;
  user_count_tier: string | null;
  consolidated_pack: string | null;
  market: string | null;
  venues: string | null;
  counterparty_role: string | null;
  row_label: string[] | null;
  column_labels: string[] | null;
  page: number | null;
}

const LINE_ITEM_COLUMNS =
  'id, version_id, product_id, title, section_family, asset_class, use_type, level, fee, currency, product_code, product_code_root, customer_tier, user_class, distribution_channel, data_timeliness, display_medium, granularity, user_count_tier, consolidated_pack, market, venues, counterparty_role, row_label, column_labels, page';

// The export has no reliable per-row id (product_id is a coarse cluster,
// price_point_id collides), so this hashes the full set of classificatory
// fields instead. product_code_root/row_label/column_labels are load-bearing:
// omitting them left 316 fingerprint collisions (68% of rows) in the full
// euronext vintage, since many products are distinguished only by their
// table row/column headers. title is deliberately excluded — it's free text
// that can get reworded between vintages without the product changing, which
// would break diffFeeScheduleVersions's cross-version matching.
export function computeProductFingerprint(row: RawLineItem): string {
  const parts = [
    row.product_id,
    row.section_family,
    row.asset_class,
    row.use_type,
    row.level,
    row.customer_tier,
    row.user_class,
    row.distribution_channel,
    row.data_timeliness,
    row.display_medium,
    row.granularity,
    row.user_count_tier,
    row.consolidated_pack,
    row.market,
    row.venues,
    row.counterparty_role,
    row.product_code,
    row.product_code_root,
    (row.row_label ?? []).join('␟'),
    (row.column_labels ?? []).join('␟'),
  ];
  return getHash(parts.map((part) => part ?? '').join('|')).slice(0, 24);
}

export function buildDataset(
  exchange: ExchangeRow,
  rawVersions: RawVersion[],
  rawLineItems: RawLineItem[],
): FeeScheduleDataset {
  const productLinesByRawVersionId = new Map<number, Set<string>>();
  for (const item of rawLineItems) {
    const productLine = item.section_family || OTHER_PRODUCT_LINE;
    const set = productLinesByRawVersionId.get(item.version_id);
    if (set) set.add(productLine);
    else
      productLinesByRawVersionId.set(item.version_id, new Set([productLine]));
  }

  const versions: FeeScheduleVersion[] = [];
  for (const raw of rawVersions) {
    const productLines =
      productLinesByRawVersionId.get(raw.id) ?? new Set<string>();
    for (const productLine of productLines) {
      versions.push(toFeeScheduleVersion(raw, exchange.code, productLine));
    }
  }

  const lineItems: FeeScheduleLineItem[] = rawLineItems.map((item) => {
    const productLine = item.section_family || OTHER_PRODUCT_LINE;
    return {
      id: String(item.id),
      versionId: versionFeId(item.version_id, productLine),
      productId: computeProductFingerprint(item),
      title: item.title,
      assetClass: item.asset_class,
      useType: item.use_type ?? '',
      level: item.level,
      fee: item.fee,
      currency: item.currency,
      productCode: item.product_code,
      page: item.page,
    };
  });

  return {
    exchange,
    rawVersions,
    versions,
    lineItems: disambiguateFingerprints(lineItems),
  };
}

// Downstream consumers assume productId is unique within one version, but a
// small residue of rows (~4%) are identical across every field the export
// gives us. Left alone, a collision silently drops one row out of a Map
// keyed by productId; suffixing the 2nd+ occurrence keeps every row.
export function disambiguateFingerprints(
  lineItems: FeeScheduleLineItem[],
): FeeScheduleLineItem[] {
  const seenInVersion = new Map<string, number>();
  return lineItems.map((item) => {
    const key = `${item.versionId}␟${item.productId}`;
    const occurrence = (seenInVersion.get(key) ?? 0) + 1;
    seenInVersion.set(key, occurrence);
    return occurrence === 1
      ? item
      : { ...item, productId: `${item.productId}-${occurrence}` };
  });
}

// PostgREST caps a response at 1000 rows and truncates silently rather than
// erroring, so line items are paged. Keyset (cursor) pagination, not
// .range()'s offset form -- see fetchAllLineItems.
const PAGE_SIZE = 1000;

type LineItemsClient = Awaited<ReturnType<typeof createClient>>;

function lineItemsPage(
  supabase: LineItemsClient,
  versionIds: number[],
  afterId: number,
) {
  return supabase
    .from('fee_schedule_line_items')
    .select(LINE_ITEM_COLUMNS)
    .in('version_id', versionIds)
    .gt('id', afterId)
    .order('id', { ascending: true })
    .limit(PAGE_SIZE);
}

// Fetches every page sequentially, one request at a time -- no concurrency,
// for the same reason as everywhere else in this codebase (e.g.
// collectCompanyIds in lib/v2/inv/service.ts, fetchSponsoredContractIds in
// data/superuser/contracts.ts): an earlier version fired all remaining pages
// concurrently via Promise.all, which scaled fine locally but sent a burst of
// 20+ simultaneous queries for a large exchange, exhausting a smaller/shared
// Postgres connection pool (a hosted dev-tier project under other concurrent
// traffic) and surfacing as a statement timeout that never reproduced
// locally.
//
// Pages by "id greater than the last one seen" rather than .range()'s numeric
// offset -- unlike every other paginated fetch in this codebase, this table
// is large enough that offset pagination's cost (skipping `offset` rows on
// every page) would keep growing as more exchanges/vintages are seeded.
// Keyset pagination seeks directly off the id index instead, so per-page cost
// stays flat regardless of how deep into the table a page starts. `id` is
// already indexed (primary key) and already the sort key, so this needs no
// schema change. Per Supabase/PostgREST's own guidance: "as offset values
// increase, the performance of the query will decrease... use keyset
// pagination where possible."
async function fetchAllLineItems(
  supabase: LineItemsClient,
  versionIds: number[],
): Promise<RawLineItem[]> {
  const rows: RawLineItem[] = [];
  let afterId = 0; // ids are a generated identity column, always > 0
  for (;;) {
    const { data, error } = await lineItemsPage(supabase, versionIds, afterId);
    if (error)
      throw new Error(`fetch fee_schedule_line_items: ${error.message}`);
    const page = (data ?? []) as RawLineItem[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    afterId = page[page.length - 1].id;
  }
  return rows;
}

const SOURCE_DOC_BUCKET = 'exchange-fee-schedule-docs';
// Matches the contract_docs precedent in lib/v2/contracts/documents.ts.
const SOURCE_DOC_URL_TTL_SECONDS = 60 * 60;

type RawVersionRow = Omit<RawVersion, 'source_document_url'> & {
  source_document_path: string | null;
};

// Signs each version's stored PDF path once per dataset fetch (a handful of
// rows, not per line item). A signing failure degrades to "View Source"
// staying disabled rather than failing the whole page -- provenance, not
// pricing data, so it isn't worth taking the dataset down over.
async function withSignedSourceDocUrls(
  supabase: LineItemsClient,
  rows: RawVersionRow[],
): Promise<RawVersion[]> {
  return Promise.all(
    rows.map(async ({ source_document_path, ...row }) => {
      if (!source_document_path) return { ...row, source_document_url: null };

      const { data, error } = await supabase.storage
        .from(SOURCE_DOC_BUCKET)
        .createSignedUrl(source_document_path, SOURCE_DOC_URL_TTL_SECONDS);
      if (error) {
        logger.warn(
          { error, versionId: row.id, source_document_path },
          'Failed to sign exchange fee schedule source document URL',
        );
        return { ...row, source_document_url: null };
      }
      return { ...row, source_document_url: data.signedUrl };
    }),
  );
}

// React's cache() only dedupes within one request; a Redis-backed cache is
// what avoids re-fetching and re-fingerprinting every line item (tens of
// thousands of rows for euronext) on every request. This dataset is shared
// reference data, not org-scoped, so it's cached once per exchange rather
// than per org/user.
export const getFeeScheduleDataset = cache(
  async (exchangeCode: string): Promise<FeeScheduleDataset | null> => {
    const cacheService = await getCacheService();
    const cached =
      await cacheService.getExchangeFeeScheduleDataset(exchangeCode);
    if (cached) return cached;

    const supabase = await createClient();

    const { data: exchangeRow, error: exchangeError } = await supabase
      .from('exchanges')
      .select('id, code, name, currency')
      .eq('code', exchangeCode)
      .maybeSingle();
    if (exchangeError)
      throw new Error(`fetch exchanges: ${exchangeError.message}`);
    if (!exchangeRow) return null;
    const { id: exchangeId, ...exchange } = exchangeRow;

    const { data: rawVersionRows, error: versionsError } = await supabase
      .from('fee_schedule_versions')
      .select(
        'id, version, effective_date, invalidated_date, source_document_path',
      )
      .eq('exchange_id', exchangeId)
      .order('effective_date', { ascending: false });
    if (versionsError)
      throw new Error(`fetch fee_schedule_versions: ${versionsError.message}`);

    let dataset: FeeScheduleDataset;
    if (!rawVersionRows || rawVersionRows.length === 0) {
      dataset = buildDataset(exchange, [], []);
    } else {
      const [rawVersions, rawLineItems] = await Promise.all([
        withSignedSourceDocUrls(supabase, rawVersionRows),
        fetchAllLineItems(
          supabase,
          rawVersionRows.map((v) => v.id),
        ),
      ]);
      dataset = buildDataset(exchange, rawVersions, rawLineItems);
    }

    await cacheService.cacheExchangeFeeScheduleDataset(exchangeCode, dataset);
    return dataset;
  },
);

// This file imports the Supabase server client (needs next/headers), so
// importing anything from it into a client component breaks the build —
// call these only from Server Components.

// Shared by summarizeExchange and getExchanges' preloaded branch below —
// both need "derive an ExchangeSummary from a dataset that may be null
// (no fee schedule data seeded for this exchange yet)".
function summarizeFromDataset(
  row: ExchangeRow,
  dataset: FeeScheduleDataset | null,
): ExchangeSummary {
  const productLines = dataset ? getProductLinesFromDataset(dataset) : [];
  return getExchangeSummaryFromDataset(
    dataset ?? { exchange: row, rawVersions: [], versions: [], lineItems: [] },
    productLines,
  );
}

// Fetches the dataset once and derives everything from that single result —
// don't split this back into separate getProductLines(row.code) +
// getFeeScheduleDataset(row.code) calls; React's cache() does not reliably
// dedupe those into one underlying fetch (confirmed empirically: the same
// exchange's dataset fetch re-executed multiple times per page request).
async function summarizeExchange(row: ExchangeRow): Promise<ExchangeSummary> {
  const dataset = await getFeeScheduleDataset(row.code);
  return summarizeFromDataset(row, dataset);
}

// preloaded lets a caller that already fetched one exchange's dataset (e.g.
// the (views) layout) hand it in instead of fetching it again here.
export async function getExchanges(preloaded?: {
  code: string;
  dataset: FeeScheduleDataset | null;
}): Promise<ExchangeSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('exchanges')
    .select('code, name, currency')
    .order('id');
  if (error) throw new Error(`fetch exchanges: ${error.message}`);
  return Promise.all(
    (data ?? []).map((row) =>
      row.code === preloaded?.code
        ? summarizeFromDataset(row, preloaded.dataset)
        : summarizeExchange(row),
    ),
  );
}
