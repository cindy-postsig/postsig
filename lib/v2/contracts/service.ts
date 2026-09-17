import { cache } from 'react';
import {
  fetchContractsBase,
  fetchContracts,
  fetchContractsById,
  fetchContractsBaseForLineageAI,
} from '@/app/lib/contracts/actions';
import { fetchAllRelationshipsForOrg } from '@/data/superuser/contracts';
import { getEffectiveBaseCurrency, getUserMetadata } from '@/data/users';
import type { ContractRelationship } from '@/app/lib/definitions';
import { contractsToChainContracts } from '@/lib/contracts/productLineageResolution';
import { resolveProductFeeCutoffs } from '@/lib/contracts/resolveRemovedProductsForContracts';
import { enrichWithLineage } from '@/lib/v2/core/lineage';
import {
  enrichWithPricing,
  enrichWithEffectiveFees,
} from '@/lib/v2/core/pricing';
import {
  filterToBudgetContracts,
  filterActiveContracts,
  filterExcludeAIFailed,
  filterExcludeInvoices,
  applyDefaultFilters,
} from '@/lib/v2/core/filters';
import { ContractWithPricing, ProductWithPricing } from '@/lib/v2/core/types';
import {
  earliestIsoDate,
  enrichWithEngineSpend,
  excludeStaleInvoices,
  fiscalYearOf,
  parseUTCDate,
  resolveWindow,
  type CurrencyPolicy,
  type FiscalConfig,
  type RelationshipEdge,
  type SpendWindow,
} from '@/lib/v2/spend';
import { buildSpendRateProvider } from '@/lib/v2/core/spendRates';
import { convertAllProductsToUSD } from '@/lib/v2/products/transforms';
import logger from '@/utils/pino';
import {
  calculateBudgetTotals,
  sumContractValuesInUSD,
} from '@/lib/v2/core/budget';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';

export { calculateBudgetTotals, sumContractValuesInUSD };
export type { BudgetTotals } from '@/lib/v2/core/budget';

const allowedFields: (keyof EnrichedContract['contract'])[] = [
  'business_sponsor',
];

export interface EnrichedProductInContract extends ProductWithPricing {}

export interface EnrichedContract extends ContractWithPricing {}

export interface ContractsResult {
  contracts: EnrichedContract[];
  count: number;
  // Returned by getActiveAndArchivedContracts (already fetched for its own
  // enrichment) so engine consumers can build real spend lineage.
  relationships?: RelationshipEdge[];
  // Confirmed lineage-event cancellation cutoffs (PSK-1830), resolved during
  // enrichment so engine consumers reuse them instead of re-fetching.
  cutoffsByContract?: Map<number, Map<number, Date>>;
}

export interface ContractsListOptions {
  /**
   * 'active' = published only (status_id = 4).
   * 'all'    = published + inactive + unconfirmed (all three lifecycle
   *            statuses). Failed extractions are still excluded — pass
   *            includeFailed:true for that.
   */
  status?: 'active' | 'all';
  contractFields?: string[];
  /** Also stamp per-product engine values (EngineSpendValues.products). */
  productValues?: boolean;
  /**
   * Restrict the enriched set to one contract's relationship family (its
   * connected component over hierarchy AND billing edges) before the
   * expensive stages. A contract's stamp depends only on its family, so the
   * family run reproduces the full run's stamps for every member — the
   * family-parity test pins it. Cutoff resolution still reads the unfiltered
   * base set, exactly as the full run does.
   */
  familyOf?: number;
  /**
   * Opt-in for callers that legitimately need ai_failed / h_failed rows
   * (currently just the failed-uploads page via getPendingContracts).
   * Default false; every other consumer — including the MCP surface —
   * stays safe.
   */
  includeFailed?: boolean;
  /**
   * Drop invoice-type contracts before the enrichment stages (lineage,
   * pricing, effective fees) run on them, instead of fetching + enriching
   * them and having the caller filter the result. Callers that unconditionally
   * exclude invoices regardless of the org's Invoices-module setting (Calendar,
   * Assignments, Inventory, non-invoice Reports, etc.) are unaffected by this
   * option and keep calling filterExcludeInvoices() themselves. This is for
   * the org-toggle-conditional call sites (Archived, Pending, the Contracts
   * sidebar count, global search) that used to fetch the full set via
   * hasInvoicesAccess() + filterExcludeInvoices() after the fact.
   */
  excludeInvoices?: boolean;
}

/**
 * The connected component of one contract over the relationship rows —
 * hierarchy and billing edges alike, since both shape surfaces the stamps
 * serve. Undirected walk; rows with a missing endpoint carry no edge.
 */
export function filterToFamily<T extends { id: number }>(
  contracts: T[],
  contractId: number,
  relationships: Array<{
    parent_contract_id: number | null;
    child_contract_id: number | null;
  }>,
): T[] {
  const adjacency = new Map<number, number[]>();
  const link = (from: number, to: number) => {
    const peers = adjacency.get(from);
    if (peers) peers.push(to);
    else adjacency.set(from, [to]);
  };
  for (const rel of relationships) {
    if (rel.parent_contract_id === null || rel.child_contract_id === null) {
      continue;
    }
    link(rel.parent_contract_id, rel.child_contract_id);
    link(rel.child_contract_id, rel.parent_contract_id);
  }
  const family = new Set<number>([contractId]);
  const queue = [contractId];
  while (queue.length > 0) {
    const current = queue.pop() as number;
    for (const next of adjacency.get(current) ?? []) {
      if (!family.has(next)) {
        family.add(next);
        queue.push(next);
      }
    }
  }
  return contracts.filter((contract) => family.has(contract.id));
}

/**
 * The shared fetch/enrichment pipeline through effective fees — everything
 * getContractsList stamps engineSpend onto — plus the relationship rows it
 * fetched along the way and the org's fiscal-year start. Exposed for the
 * spend route, which feeds the engine directly: it needs the enriched set
 * and the relationships, but must not pay for engineSpend stamps it never
 * reads (each stamp run is two full queryCommitments passes).
 *
 * Positional primitive args (not an options object) so React cache() keys
 * hit across callers within a request. Every argument is required, with no
 * defaults: cache() keys on the argument count as well as the values, so a
 * caller that omitted a trailing default was memoised separately and ran the
 * whole enrichment a second time in the same request.
 */
export const getEnrichedContracts = cache(
  async (
    status: 'active' | 'all',
    includeFailed: boolean,
    // Archived rows are absent from the cached base set entirely, so pulling
    // them in is a separate fetch. Historical-FY surfaces need it: a contract
    // archived since then was real spend that year. Merged BEFORE lineage so
    // cross-status supersession flags resolve (getActiveAndArchivedContracts'
    // rule).
    includeArchived: boolean,
    // 0 = no family filter (every caller but the cost-allocation tab).
    familyOf: number,
    // Applied to `merged`, after cutoff resolution reads the unfiltered base
    // set (so a declaring addendum on an invoice stays resolvable) and before
    // the enrichment stages run on rows the caller doesn't want anyway.
    excludeInvoices: boolean,
  ): Promise<{
    contracts: EnrichedContract[];
    relationships: ContractRelationship[];
    fiscalYearStartMonth: number;
    /** Confirmed lineage-event cancellation cutoffs (PSK-1830), resolved once here. */
    cutoffsByContract: Map<number, Map<number, Date>>;
  }> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return {
        contracts: [],
        relationships: [],
        fiscalYearStartMonth: 1,
        cutoffsByContract: new Map(),
      };
    }

    const fiscalYearStartMonth = userMetadata.organizationFY || 1;

    const startTime = Date.now();
    logger.debug(
      { status, includeFailed, includeArchived },
      'getContractsList cache miss - fetching contracts',
    );

    const [contractsBase, archivedBase, relationships] = await Promise.all([
      fetchContractsBase(),
      includeArchived
        ? fetchContracts({ status: 'inactive', hideFailed: true })
        : Promise.resolve([]),
      fetchAllRelationshipsForOrg(userMetadata.organizationId),
    ]);

    // Drop failed extractions first so status='all' (all three lifecycle
    // statuses) never surfaces them.
    const safe = includeFailed
      ? contractsBase
      : filterExcludeAIFailed(contractsBase);
    const filtered = status === 'all' ? safe : filterActiveContracts(safe);
    const combined = includeArchived
      ? [...filtered, ...archivedBase]
      : filtered;
    const withFamily =
      familyOf > 0
        ? filterToFamily(combined, familyOf, relationships)
        : combined;
    const merged = excludeInvoices
      ? filterExcludeInvoices(withFamily)
      : withFamily;

    // Confirmed cancellation cutoffs (PSK-1830): products cancelled by a
    // lineage event stop accruing in every budget number derived from these
    // price histories. Chain input is built from the UNFILTERED base set
    // (plus archived rows when loaded) — matching the inventory service — so
    // a declaring addendum stays resolvable even when the active filter
    // would hide it from this list. Degrades to an empty map (plus a paged
    // alert) on failure.
    const cutoffsByContract = await resolveProductFeeCutoffs({
      organizationId: userMetadata.organizationId,
      chainContracts: contractsToChainContracts(
        includeArchived ? [...contractsBase, ...archivedBase] : contractsBase,
      ),
      relationships,
    });

    const withLineage = enrichWithLineage(merged, relationships);
    const withPricing = await enrichWithPricing(
      withLineage,
      fiscalYearStartMonth,
      { cutoffsByContract, baseCurrency: userMetadata.baseCurrency },
    );
    const withEffectiveFees = enrichWithEffectiveFees(withPricing);

    const duration = Date.now() - startTime;
    logger.debug(
      { status, count: withEffectiveFees.length, durationMs: duration },
      'getContractsList fetch completed',
    );

    return {
      contracts: withEffectiveFees,
      relationships,
      fiscalYearStartMonth,
      cutoffsByContract,
    };
  },
);

/**
 * The 'base' currency policy for an engine-spend stamp run: the org's display
 * currency plus every rate the two stamped windows can ask for, prefetched
 * here because the engine itself is synchronous.
 *
 * Both windows are commitment queries, so conversion happens at each term's
 * START date — which routinely predates the window. buildSpendRateProvider
 * handles that by reaching back to the earliest recorded term start; the span
 * below only sizes the monthly averages.
 */
async function baseCurrencyPolicy(
  enriched: ContractWithPricing[],
  fiscalConfig: FiscalConfig,
  asOf: Date,
  windows: { current: SpendWindow; projected: SpendWindow },
): Promise<CurrencyPolicy> {
  const target = await getEffectiveBaseCurrency();
  const current = resolveWindow(windows.current, asOf, fiscalConfig);
  const projected = resolveWindow(windows.projected, asOf, fiscalConfig);
  const rates = await buildSpendRateProvider({
    contracts: enriched.map((ec) => ec.contract),
    target,
    asOf,
    span: {
      start: current.start < projected.start ? current.start : projected.start,
      end: current.end > projected.end ? current.end : projected.end,
    },
  });
  return { mode: 'base', target, rates };
}

const LIVE_WINDOWS = {
  current: 'currentFY' as const,
  projected: 'nextFY' as const,
};

export const getContractsList = cache(
  async (options: ContractsListOptions = {}): Promise<ContractsResult> => {
    const {
      status = 'active',
      includeFailed = false,
      productValues = false,
      familyOf = 0,
      excludeInvoices = false,
    } = options;

    const {
      contracts,
      relationships,
      fiscalYearStartMonth,
      cutoffsByContract,
    } = await getEnrichedContracts(
      status,
      includeFailed,
      false,
      familyOf,
      excludeInvoices,
    );

    const asOf = new Date();
    const currency = await baseCurrencyPolicy(
      contracts,
      { startMonth: fiscalYearStartMonth },
      asOf,
      LIVE_WINDOWS,
    );

    const engineStart = Date.now();
    const withEngineSpend = enrichWithEngineSpend(
      contracts,
      relationships,
      fiscalYearStartMonth,
      asOf,
      { currency, eventCutoffs: cutoffsByContract, productValues },
    );
    logger.debug(
      {
        status,
        count: withEngineSpend.length,
        durationMs: Date.now() - engineStart,
      },
      'engine spend enrichment completed',
    );

    return {
      contracts: withEngineSpend,
      count: withEngineSpend.length,
      // Already fetched above for spend enrichment; returning them lets the
      // list nest contracts by lineage without a second query — and lets the
      // report pipelines build real spend lineage without re-fetching.
      relationships,
      cutoffsByContract,
    };
  },
);

/**
 * Cheap existence check for the login redirect: reuses the Redis-cached base
 * set and the default filters (published, exclude AI-failed) without the
 * relationship fetch or pricing enrichment that getContractsList performs.
 */
export const hasActiveContracts = cache(async (): Promise<boolean> => {
  const base = await fetchContractsBase();
  return applyDefaultFilters(base).length > 0;
});

export const getContractsListForLineageAI = cache(
  async (options: ContractsListOptions = {}): Promise<ContractsResult> => {
    const {
      status = 'active',
      contractFields,
      includeFailed = false,
    } = options;

    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return { contracts: [], count: 0 };
    }

    const fiscalYearStartMonth = userMetadata.organizationFY || 1;

    const startTime = Date.now();
    logger.debug(
      { status, includeFailed },
      'getContractsList cache miss - fetching contracts',
    );

    const contractsBase = await fetchContractsBaseForLineageAI({
      contractFields,
    });
    const relationships = await fetchAllRelationshipsForOrg(
      userMetadata.organizationId,
    );

    // Drop failed extractions first so status='all' (all three lifecycle
    // statuses) never surfaces them.
    const safe = includeFailed
      ? contractsBase
      : filterExcludeAIFailed(contractsBase);
    const filtered = status === 'all' ? safe : filterActiveContracts(safe);

    const withLineage = enrichWithLineage(filtered, relationships);
    const withPricing = await enrichWithPricing(
      withLineage,
      fiscalYearStartMonth,
      { baseCurrency: userMetadata.baseCurrency },
    );
    const withEffectiveFees = enrichWithEffectiveFees(withPricing);

    const duration = Date.now() - startTime;
    logger.debug(
      { status, count: withEffectiveFees.length, durationMs: duration },
      'getContractsList fetch completed',
    );

    return {
      contracts: withEffectiveFees,
      count: withEffectiveFees.length,
    };
  },
);

/**
 * Returns the raw contract row (not EnrichedContract).
 * For list views with budget calculations, use getContractsList().
 */
export const getContract = cache(async (contractId: number) => {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    return null;
  }

  const contracts = await fetchContractsById({ ids: [contractId] });
  if (!contracts || contracts.length === 0) {
    return null;
  }

  // The FX stamp is derived, never stored — no fx column exists on
  // vendor_products_details — so a contract read one row at a time carries it
  // only if this path re-derives it, exactly as the list fetches do. The
  // details page reads it to disclose which rate produced the base-currency
  // figures this contract shows up as elsewhere. Costs nothing for a contract
  // already in the base currency: the conversion skips the rate lookup.
  const contract = contracts[0];
  return {
    ...contract,
    vendor_products_details: await convertAllProductsToUSD(
      contract,
      userMetadata.baseCurrency,
    ),
  };
});

export async function getFiscalYearStartMonth(): Promise<number> {
  const userMetadata = await getUserMetadata();
  return userMetadata?.organizationFY || 1;
}

export async function getBudgetContracts(
  fiscalYear?: number,
): Promise<ContractsResult> {
  const fiscalYearStartMonth = await getFiscalYearStartMonth();
  const fiscal = { startMonth: fiscalYearStartMonth };
  const asOf = new Date();
  const currentFYWindow = resolveWindow('currentFY', asOf, fiscal);

  if (fiscalYear === undefined || fiscalYear >= currentFYWindow.fyNum) {
    const { contracts } = await getContractsList();
    const budgetContracts = excludeStaleInvoices(
      filterToBudgetContracts(contracts),
      currentFYWindow.start,
    );

    return {
      contracts: budgetContracts,
      count: budgetContracts.length,
    };
  }

  // Historical FY: a contract archived since then was real spend that year,
  // so the row set comes from the merged active+archived fetch. Stamps re-run
  // with the selected windows plus cycle dates (the fetch-boundary stamps are
  // pinned to currentFY/nextFY), and rows keep only contracts that
  // contributed spend to the selected year — activeInWindow also folds in the
  // stale-invoice rule at the selected FY start. Product stamps ride along so
  // sub-rows show the selected year's fees, not today's (QA 2026-08-04).
  const { contracts, relationships, cutoffsByContract } =
    await getActiveAndArchivedContracts();
  const windows = {
    current: { fiscalYear },
    projected: { fiscalYear: fiscalYear + 1 },
  };
  const currency = await baseCurrencyPolicy(contracts, fiscal, asOf, windows);
  const stamped = enrichWithEngineSpend(
    contracts,
    relationships ?? [],
    fiscalYearStartMonth,
    asOf,
    {
      currency,
      windows,
      cycleDates: true,
      productValues: true,
      eventCutoffs: cutoffsByContract,
    },
  );
  const inWindow = stamped.filter((ec) => ec.engineSpend?.activeInWindow);

  return {
    contracts: inWindow,
    count: inWindow.length,
  };
}

export interface FiscalYearRangeRow {
  term_start_date: Array<{ date: string }> | null;
  vendor_id: number | null;
  ai_extraction_status: string | null;
  vendor_products_details: Array<{ fees: number | string | null }> | null;
}

/**
 * The selector's lower bound must only count contracts the budget row
 * pipeline can actually surface, or the dropdown offers years that render
 * empty. Mirrors filterToBudgetContracts' gates in their raw-row form:
 * non-failed extraction, has a vendor, positive raw fee sum (the same lenient
 * fee parse), parseable earliest start.
 */
export function oldestBudgetFiscalYear(
  rows: FiscalYearRangeRow[],
  startMonth: number,
): number | null {
  let oldest: string | null = null;
  for (const row of rows) {
    if (['ai_failed', 'h_failed'].includes(row.ai_extraction_status || '')) {
      continue;
    }
    if (!row.vendor_id) continue;
    const totalFees = (row.vendor_products_details ?? []).reduce(
      (sum, detail) => {
        const raw = detail?.fees;
        const fee =
          typeof raw === 'number'
            ? raw
            : parseFloat(String(raw).replace(/[^0-9.-]/g, ''));
        return sum + (Number.isFinite(fee) ? fee : 0);
      },
      0,
    );
    if (totalFees <= 0) continue;

    const earliest = earliestIsoDate(row.term_start_date ?? undefined);
    if (earliest && (!oldest || earliest < oldest)) oldest = earliest;
  }
  if (!oldest) return null;
  return fiscalYearOf(parseUTCDate(oldest), { startMonth });
}

/**
 * Fiscal year of the earliest term start across published + archived
 * contracts that can appear as budget rows — the fiscal-year selector's
 * lower bound. A light org-scoped read: role scoping is deliberately skipped
 * because it exposes nothing beyond a year number.
 */
export const getOldestContractFiscalYear = cache(
  async (): Promise<number | null> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) return null;

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('contracts')
      .select(
        'term_start_date, vendor_id, ai_extraction_status, vendor_products_details(fees)',
      )
      .eq('organization_id', userMetadata.organizationId)
      .or('status_id.eq.4,status.eq.inactive');
    if (error || !data) {
      logger.warn({ error }, 'Failed to load contract starts for FY range');
      return null;
    }

    return oldestBudgetFiscalYear(
      data as unknown as FiscalYearRangeRow[],
      userMetadata.organizationFY || 1,
    );
  },
);

/**
 * Powers the failed-uploads page. The only legitimate caller of
 * includeFailed:true — every other surface should leave that off.
 */
export async function getPendingContracts({
  excludeInvoices = false,
}: { excludeInvoices?: boolean } = {}): Promise<ContractsResult> {
  const { contracts } = await getContractsList({
    status: 'all',
    includeFailed: true,
    excludeInvoices,
  });

  const filtered = contracts.filter((c) => c.contract.status_id !== 4);

  return {
    contracts: filtered,
    count: filtered.length,
  };
}

/**
 * Uses fetchContracts directly because fetchContractsBase excludes inactive.
 */
export async function getArchivedContracts({
  excludeInvoices = false,
}: { excludeInvoices?: boolean } = {}): Promise<ContractsResult> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    return { contracts: [], count: 0 };
  }

  const fiscalYearStartMonth = userMetadata.organizationFY || 1;

  const [contractsBaseAll, relationships] = await Promise.all([
    fetchContracts({ status: 'inactive', hideFailed: true }),
    fetchAllRelationshipsForOrg(userMetadata.organizationId),
  ]);
  const contractsBase = excludeInvoices
    ? filterExcludeInvoices(contractsBaseAll)
    : contractsBaseAll;

  const withLineage = enrichWithLineage(contractsBase, relationships);
  const withPricing = await enrichWithPricing(
    withLineage,
    fiscalYearStartMonth,
    { baseCurrency: userMetadata.baseCurrency },
  );
  const withEffectiveFees = enrichWithEffectiveFees(withPricing);

  return {
    contracts: withEffectiveFees,
    count: withEffectiveFees.length,
  };
}

/**
 * Merges active + archived BEFORE lineage so an archived parent superseded
 * by an active child (or vice versa) gets its supersession flags set
 * correctly — running lineage twice on disjoint slices would miss those.
 */
export async function getActiveAndArchivedContracts(): Promise<ContractsResult> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    return { contracts: [], count: 0 };
  }

  const fiscalYearStartMonth = userMetadata.organizationFY || 1;

  const [activeBase, archivedBase, relationships] = await Promise.all([
    fetchContractsBase(),
    fetchContracts({ status: 'inactive', hideFailed: true }),
    fetchAllRelationshipsForOrg(userMetadata.organizationId),
  ]);

  const merged = [...applyDefaultFilters(activeBase), ...archivedBase];

  // Confirmed cancellation cutoffs (PSK-1830), resolved over the full
  // active+archived set so archived declaring addenda still strike. Returned
  // so engine consumers reuse this resolution instead of re-fetching.
  const cutoffsByContract = await resolveProductFeeCutoffs({
    organizationId: userMetadata.organizationId,
    chainContracts: contractsToChainContracts([...activeBase, ...archivedBase]),
    relationships,
  });

  const withLineage = enrichWithLineage(merged, relationships);
  const withPricing = await enrichWithPricing(
    withLineage,
    fiscalYearStartMonth,
    { cutoffsByContract, baseCurrency: userMetadata.baseCurrency },
  );
  const withEffectiveFees = enrichWithEffectiveFees(withPricing);

  const filtered = filterToBudgetContracts(withEffectiveFees);

  return {
    contracts: filtered,
    count: filtered.length,
    relationships,
    cutoffsByContract,
  };
}

/**
 * Partial update. Only keys listed in `allowedFields` are written; everything
 * else in `data` is silently dropped.
 */
export async function updateContract(
  contractId: number,
  data: Partial<EnrichedContract>,
): Promise<void> {
  const supabase = createServiceClient();
  const userMetadata = await getUserMetadata();

  if (!userMetadata) {
    throw new Error('User not authenticated');
  }

  const filteredData = Object.fromEntries(
    Object.entries(data).filter(([key]) => allowedFields.includes(key)),
  );

  if (!Object.keys(filteredData).length) {
    logger.warn({ contractId }, 'No allowed fields provided for update');
    return;
  }
  const { error } = await supabase
    .from('contracts')
    .update(filteredData)
    .eq('id', contractId)
    .eq('organization_id', userMetadata.organizationId);

  if (error) {
    logger.error({ error, contractId }, 'Failed to update contract');
    throw error;
  }
}
