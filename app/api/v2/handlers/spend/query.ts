import { Context } from 'hono';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import { getEnrichedContracts } from '@/lib/v2/contracts/service';
import {
  filterToBudgetContracts,
  filterForAggregation,
} from '@/lib/v2/core/filters';
import type { ContractWithPricing } from '@/lib/v2/core/types';
import { getCacheService } from '@/app/lib/redis/cache-service';
import {
  querySpend,
  queryRenewals,
  queryTCV,
  queryCommitments,
  commitmentHorizonEnd,
  buildSpendLineageFromEnriched,
  buildComponentSignatures,
  cutoffDigestOf,
  feeDigestOf,
  mergeLineItems,
  resolveWindow,
  enumeratePeriods,
  formatUTCDate,
  parseUTCDate,
  EMPTY_LINEAGE,
  type CommitmentKind,
  type CurrencyPolicy,
  type FiscalConfig,
  type SpendBasis,
  type SpendContractInput,
  type SpendLineage,
  type SpendLineItem,
} from '@/lib/v2/spend';
import { dimensionOf, type SpendQueryOptions } from '@/lib/v2/spend/pipeline';
import type { SpendAllocationInput } from '@/lib/v2/spend/allocation';
import { ORG_UNIT_TREE_LEVELS } from '@/lib/v2/org-units/levels';
import {
  EMPTY_SID_SPEND_POPULATION,
  loadSidSpendPopulation,
  type SidSpendPopulation,
} from '@/lib/v2/bloomberg-sid/population';
import {
  collapseSidLineItems,
  isSidVendorInvoice,
} from '@/lib/v2/bloomberg-sid/spend';
import { loadAllocationContext } from '@/lib/v2/cost-allocation/context';
import { resolveAllocations } from '@/lib/v2/cost-allocation/resolver';
import type {
  AllocationContext,
  AllocationEmployee,
} from '@/lib/v2/cost-allocation/types';
import { buildSpendRateProvider } from '@/lib/v2/core/spendRates';
import { ValidationError } from '@/lib/errors';
import { BASE_CURRENCY_DEFAULT } from '@/lib/base-currency';
import {
  createCachedSegmentResolver,
  type SegmentStore,
} from './derivation-store';
import logger from '@/utils/pino';
import { timed } from '@/utils/logging/timed';

// Entries also self-invalidate via the key (component signature + asOf day),
// so the TTL only bounds storage for keys that stop being requested.
const DERIVATION_TTL_SECONDS = 86_400;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// The window is the one input that sizes the work: at month granularity
// enumeratePeriods builds a bucket key per month, so an unbounded range costs
// ~120k of them per request, and a fiscalYear far outside these bounds
// overflows Date.UTC into an Invalid Date that empties the result by accident
// rather than by design. Callers send currentFY/nextFY or a recent fiscal
// year; the price-history page resolves its own long windows through the
// service layer, not this route.
const FISCAL_YEAR_MIN = 1900;
const FISCAL_YEAR_MAX = 2200;
const MAX_WINDOW_YEARS = 100;

const windowSchema = z.union([
  z.literal('currentFY'),
  z.literal('nextFY'),
  z
    .object({
      fiscalYear: z.number().int().min(FISCAL_YEAR_MIN).max(FISCAL_YEAR_MAX),
    })
    .strict(),
  z
    .object({ from: isoDate, to: isoDate })
    .strict()
    // ISO dates compare lexicographically; the span bound compares real
    // dates, since a bare year-prefix difference lets a Jan..Dec range
    // smuggle in almost an extra year.
    .refine((w) => w.to > w.from, { message: 'to must be after from' })
    .refine(
      (w) => {
        const limit = parseUTCDate(w.from);
        limit.setUTCFullYear(limit.getUTCFullYear() + MAX_WINDOW_YEARS);
        // Windows are half-open, so `to` landing exactly on the limit is a
        // span of exactly MAX_WINDOW_YEARS.
        return parseUTCDate(w.to) <= limit;
      },
      { message: `window must span at most ${MAX_WINDOW_YEARS} years` },
    ),
]);

const allocationLevels = [
  ...ORG_UNIT_TREE_LEVELS,
  'cost_center',
  'user',
] as const;

// The legacy 'group' string is gone with the dimension it named (psk-1846
// phase 3); the schema simply no longer admits it — no production caller ever
// sent it, so a stale caller gets the ordinary 400 with the invalid value
// named in `details`.
const groupBySchema = z.union([
  z.enum(['total', 'vendor', 'contract', 'product', 'sponsor']),
  z
    .object({ kind: z.literal('allocation'), level: z.enum(allocationLevels) })
    .strict(),
]);

const shared = {
  window: windowSchema,
  granularity: z.enum(['month', 'quarter', 'year']),
  groupBy: groupBySchema,
};

export const spendQueryInputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('spend'),
      basis: z.enum(['committed', 'amortized', 'actual']),
      proration: z.enum(['monthly', 'daily']).optional(),
      ...shared,
    })
    .strict(),
  z.object({ kind: z.literal('renewals'), ...shared }).strict(),
  z.object({ kind: z.literal('tcv'), ...shared }).strict(),
  z
    .object({
      kind: z.literal('commitments'),
      // 'term' = full multi-year obligation at signing (TCV-style);
      // 'annual' = each 12-month slice in its own year (run-rate).
      valuation: z.enum(['term', 'annual']).optional(),
      // 'cancel-by' (default) dates renewals at their deadline where an
      // offset exists; 'term-start' keeps every event on its cycle start —
      // psk-1844's Contract Term placement.
      recognition: z.enum(['cancel-by', 'term-start']).optional(),
      ...shared,
    })
    .strict(),
]);

export type SpendQueryInput = z.infer<typeof spendQueryInputSchema>;

export interface SpendRef {
  label: string;
  vendorDomain?: string;
  // Contract keys: the first live product. Product keys: the product itself
  // — on a seat key `label` names the seat and this names the Bloomberg
  // product it is a terminal of.
  productName?: string;
  /** Product keys: the vendor the bucket's contract (or seat account) belongs to. */
  vendorId?: number;
  /**
   * Product keys: the product the bucket is for — the catalog product on a
   * contract key, the Bloomberg product code on a seat key. A per-product
   * rollup merges on it, which folds every terminal of one product into one
   * line instead of one line per seat.
   */
  productId?: number;
}

export interface SpendQueryResponse {
  kind: SpendQueryInput['kind'];
  basis?: SpendBasis;
  // The policy the values were computed under, mode only: a 'base' policy also
  // carries its prefetched rate LOOKUPS, which are functions and would cross
  // the wire as an empty object.
  currency: CurrencyPolicy['mode'];
  // ISO code every `value` below is denominated in — clients format symbols
  // from it rather than assuming USD.
  targetCurrency: string;
  window: { start: string; end: string; fiscalYear: number };
  // Every bucket key the window can produce — the zero-fill axis, so clients
  // never re-derive fiscal math.
  periods: string[];
  // kind is present only on 'commitments' items.
  items: Array<SpendLineItem & { kind?: CommitmentKind }>;
  // Display metadata for groupKeys ('total'/'sponsor'/'group' keys are their
  // own labels and get no entry).
  refs: Record<string, SpendRef>;
}

interface VendorFields {
  vendor_id?: number | null;
  vendors?: { name?: string | null; domain?: string | null } | null;
}

interface AllocationRefSource {
  unitsById: AllocationContext['unitsById'];
  employeesById: ReadonlyMap<number, AllocationEmployee>;
}

function buildAllocationRefs(
  items: SpendLineItem[],
  ctx: AllocationRefSource,
): Record<string, SpendRef> {
  // 'unassigned' is its own label, like sponsor keys, and gets no entry.
  const refs: Record<string, SpendRef> = {};
  for (const key of new Set(items.map((item) => item.groupKey))) {
    const [kind, rawId] = key.split(':');
    const id = Number(rawId);
    if (kind === 'unit') {
      const unit = ctx.unitsById.get(id);
      if (unit) refs[key] = { label: unit.name };
    } else if (kind === 'user') {
      const employee = ctx.employeesById.get(id);
      if (employee) refs[key] = { label: employee.name };
    }
  }
  return refs;
}

function buildRefs(
  groupBy: SpendQueryInput['groupBy'],
  items: SpendLineItem[],
  kept: ContractWithPricing[],
  allocationCtx?: AllocationRefSource,
): Record<string, SpendRef> {
  const refs: Record<string, SpendRef> = {};
  if (typeof groupBy === 'object') {
    return allocationCtx ? buildAllocationRefs(items, allocationCtx) : refs;
  }
  if (groupBy === 'total' || groupBy === 'sponsor') {
    return refs;
  }

  const keys = new Set(items.map((item) => item.groupKey));
  for (const ec of kept) {
    const { vendor_id: vendorId, vendors: vendor } =
      ec.contract as VendorFields;
    const vendorDomain = vendor?.domain ?? undefined;

    if (groupBy === 'vendor') {
      const key = String(ec.contract.vendor_id);
      if (keys.has(key) && !refs[key]) {
        refs[key] = { label: vendor?.name ?? key, vendorDomain };
      }
    } else if (groupBy === 'contract') {
      const key = String(ec.id);
      if (keys.has(key)) {
        // Label with the first LIVE product: superseded and lineage-event
        // cancelled products are struck from every table (PSK-1830), so a
        // bar popover must not resurrect their names. A fully-struck
        // contract gets no product line.
        const live = ec.products.find(
          (p) => !p.isSuperseded && p.isCancelled !== true,
        );
        refs[key] = {
          label: vendor?.name ?? `#${ec.id}`,
          vendorDomain,
          productName: live?.name ?? undefined,
        };
      }
    } else {
      for (const product of ec.products) {
        const key = `${ec.id}:${product.product_id}`;
        if (keys.has(key)) {
          const name = product.name ?? String(product.product_id);
          // The same id the engine's vendor buckets key on, so a product
          // bucket rolls up under exactly the vendor bucket it is part of.
          refs[key] = {
            label: name,
            vendorDomain,
            productName: name,
            ...(vendorId != null ? { vendorId } : {}),
            productId: product.product_id,
          };
        }
      }
    }
  }
  return refs;
}

/**
 * Narrows the population a query runs over. `vendorId` keeps one vendor's
 * contracts (lineage and cache signatures still form over the whole set, so
 * a family member outside the vendor still cuts its parent). `bloombergSid`
 * folds the org's Bloomberg seats in as a second population — the same
 * window, basis, currency policy and grouping, resolved through their own
 * resolver and merged bucket by bucket — so a surface that opts in reports
 * terminal seats beside contracts as one number. `true` loads the population
 * here; a caller issuing several queries loads it once and passes it in.
 */
export interface SpendQueryScope {
  vendorId?: number;
  bloombergSid?: boolean | SidSpendPopulation;
  /**
   * 'seats' runs over the Bloomberg population alone and never enriches the
   * org's contracts: for the surfaces that read only the seat rollup keys and
   * price them on Contract Term whatever the org's method, so no
   * contracts-and-seats run of theirs can be reused. Needs `bloombergSid`.
   */
  population?: 'seats';
}

type EnrichedSet = Awaited<ReturnType<typeof getEnrichedContracts>>;

const noContracts = (): Pick<
  EnrichedSet,
  'contracts' | 'relationships' | 'cutoffsByContract'
> => ({ contracts: [], relationships: [], cutoffsByContract: new Map() });

/**
 * The one canonical spend computation behind every "how much do we spend"
 * surface: budget overview, the dashboard's Spend Overview, and the
 * assistant's get_spend tool all call this, so their numbers cannot drift.
 * Callers must ensure userMetadata carries an organizationId — the derivation
 * cache below is namespaced by org, and without an id every request would
 * read and write one shared `org:undefined:` namespace across tenants.
 */
export async function runSpendQuery(
  userMetadata: UserMetadata,
  input: SpendQueryInput,
  scope: SpendQueryScope = {},
): Promise<SpendQueryResponse> {
  // Fail fast rather than trusting caller discipline: an empty id would
  // collapse every tenant into one shared `org:undefined:` cache namespace.
  if (!userMetadata?.organizationId) {
    throw new ValidationError('Missing organization context');
  }
  const seatsOnly = scope.population === 'seats';
  if (seatsOnly && !scope.bloombergSid) {
    throw new ValidationError(
      'A seats-only spend query needs the Bloomberg population',
    );
  }
  const asOf = new Date();
  const targetCurrency = userMetadata.baseCurrency ?? BASE_CURRENCY_DEFAULT;

  const fiscalConfig: FiscalConfig = {
    startMonth: userMetadata.organizationFY || 1,
  };
  const resolved = resolveWindow(input.window, asOf, fiscalConfig);
  // A window in a past FY reaches contracts archived since then — they were
  // real spend that year and the historical row set includes them, so the
  // chart and cards must query the same population.
  const includeArchived =
    resolved.fyNum < resolveWindow('currentFY', asOf, fiscalConfig).fyNum;

  const wantsAllocation = dimensionOf(input.groupBy) === 'allocation';

  // The un-stamped pipeline: this handler feeds the engine directly, so
  // paying for engineSpend stamps (two more queryCommitments passes) would
  // be pure waste. Relationships ride along instead of being re-fetched.
  const [{ contracts: enriched, relationships, cutoffsByContract }, sid] =
    await Promise.all([
      seatsOnly
        ? noContracts()
        : timed('spend.getEnrichedContracts', () =>
            getEnrichedContracts('active', false, includeArchived, 0, false),
          ),
      scope.bloombergSid === true
        ? timed('spend.loadSidSpendPopulation', () =>
            loadSidSpendPopulation(userMetadata.organizationId, {
              window: resolved,
              vendorId: scope.vendorId,
              matchEmployees: wantsAllocation,
            }),
          )
        : scope.bloombergSid || EMPTY_SID_SPEND_POPULATION,
    ]);

  // The budget chart's exact inclusion chain (buildBudgetSummary): budget
  // filter, then aggregation filter. Lineage and component signatures run
  // over the FULL enriched set — a filtered-out family member still cuts
  // its parent and still shapes the cache signature. Confirmed
  // lineage-event cancellations (PSK-1830) merge into the cutoff graph so
  // the chart and cards strike cancelled products like every other engine
  // surface.
  // A SID-covered vendor's invoices bill the seats already in the population,
  // so they step aside for the seats instead of counting the same money twice.
  const kept = filterForAggregation(filterToBudgetContracts(enriched)).filter(
    (ec) =>
      (scope.vendorId === undefined || ec.vendor_id === scope.vendorId) &&
      !isSidVendorInvoice(ec, sid.vendorIds),
  );
  const contracts: SpendContractInput[] = kept.map((ec) => ec.contract);
  const lineage = buildSpendLineageFromEnriched(
    enriched,
    relationships,
    cutoffsByContract,
  );
  const signatures = buildComponentSignatures(
    enriched.map((ec) => ({
      id: ec.id,
      updated_at: (ec.contract as { updated_at?: string | null }).updated_at,
      feeDigest: feeDigestOf(ec.contract),
      cutoffDigest: cutoffDigestOf(cutoffsByContract.get(ec.id)),
    })),
    relationships,
  );

  // The flow bases recognise money month by month and so only ever read a
  // month's average from inside the window; everything else converts at a
  // term's start date, which predates it (a Bloomberg seat's reaches back to
  // 2000).
  const flowBasis =
    input.kind === 'spend' &&
    (input.basis === 'amortized' || input.basis === 'actual');

  // Prefetched once for the whole request: the engine looks rates up
  // synchronously, and the kept set is exactly the population it will ask
  // about. An org already denominated in its base currency fetches nothing.
  const currency: CurrencyPolicy = {
    mode: 'base',
    target: targetCurrency,
    rates: await timed('spend.buildSpendRateProvider', () =>
      buildSpendRateProvider({
        contracts: [...contracts, ...sid.contracts],
        target: targetCurrency,
        asOf,
        span: { start: resolved.start, end: resolved.end },
        dailyRange: flowBasis ? 'span' : 'term-starts',
      }),
    ),
  };

  // The allocation dimension's map is resolved here, outside the engine, so
  // the Redis-cached contract select never joins allocations. Relationships
  // ride along from getEnrichedContracts rather than being re-fetched.
  const allocationCtx = wantsAllocation
    ? await timed('spend.loadAllocationContext', () =>
        loadAllocationContext(
          userMetadata.organizationId,
          undefined,
          relationships,
        ),
      )
    : undefined;
  const allocations: SpendAllocationInput | undefined = allocationCtx && {
    resolved: resolveAllocations(contracts, allocationCtx),
    unitsById: allocationCtx.unitsById,
  };
  const sidAllocations: SpendAllocationInput | undefined = allocationCtx &&
    sid.allocations && {
      resolved: sid.allocations,
      unitsById: allocationCtx.unitsById,
    };

  const cacheService = await getCacheService();
  // Derived segments are ORG-level data, so the entries are scoped by org
  // rather than by user (passing userMetadata would route through
  // getUserKey and prefix `user:<userId>:` instead). That is safe because
  // the component signature already encodes each user's ACL-visible lineage
  // membership: two users who see different family members hash different
  // signatures and therefore read different keys. User scoping bought no
  // correctness for that reason, while storing one copy per user per org and
  // making targeted invalidation impractical on cluster-mode Redis.
  const orgKey = (key: string) => `org:${userMetadata.organizationId}:${key}`;
  const store: SegmentStore = {
    mget: (keys) => cacheService.redisService.mget(keys.map(orgKey), undefined),
    mset: (pairs) =>
      cacheService.redisService.mset(
        pairs.map(({ key, value }) => ({ key: orgKey(key), value })),
        undefined,
        DERIVATION_TTL_SECONDS,
      ),
  };
  // Mirrors queryCommitments' internal horizon exactly: padded only when
  // deadline recognition can shift events earlier than the window end.
  const padHorizon =
    input.kind === 'commitments' && input.recognition !== 'term-start';
  const { resolveSegments, flush } = await timed(
    'spend.createCachedSegmentResolver',
    () =>
      createCachedSegmentResolver({
        store,
        contracts,
        signatures,
        horizonEndOf: padHorizon
          ? (contract) => commitmentHorizonEnd(contract, resolved.end, lineage)
          : () => resolved.end,
        asOf,
        currency,
      }),
  );

  const engineQuery = {
    window: input.window,
    granularity: input.granularity,
    groupBy: input.groupBy,
    currency,
    fiscalConfig,
    asOf,
  };
  const runEngine = (
    population: SpendContractInput[],
    populationLineage: SpendLineage,
    options: SpendQueryOptions,
  ): Array<SpendLineItem & { kind?: CommitmentKind }> =>
    input.kind === 'spend'
      ? querySpend(
          population,
          {
            ...engineQuery,
            basis: input.basis,
            source: 'expected',
            proration: input.proration,
          },
          populationLineage,
          options,
        ).items
      : input.kind === 'renewals'
        ? queryRenewals(population, engineQuery, populationLineage, options)
            .items
        : input.kind === 'tcv'
          ? queryTCV(population, engineQuery, populationLineage, options).items
          : queryCommitments(
              population,
              {
                ...engineQuery,
                valuation: input.valuation,
                recognition: input.recognition,
              },
              populationLineage,
              options,
            ).items;

  // Seats resolve through their own resolver and never touch the derivation
  // cache: their inputs are rebuilt from the latest report on every request,
  // so there is no stored derivation to key.
  const merged = await timed('spend.engine', async () =>
    mergeLineItems([
      runEngine(contracts, lineage, { resolveSegments, allocations }),
      runEngine(sid.contracts, EMPTY_LINEAGE, {
        resolveSegments: sid.resolveSegments,
        allocations: sidAllocations,
      }),
    ]),
  );
  // Contract grouping is the chart's breakdown, and product asked for one
  // Bloomberg line there rather than one per billing account.
  const { items, refs: seatRefs } =
    input.groupBy === 'contract'
      ? collapseSidLineItems(merged, sid.refs)
      : { items: merged, refs: sid.refs };

  await timed('spend.flushSegmentCache', flush);

  const refSource: AllocationRefSource | undefined = allocationCtx && {
    unitsById: allocationCtx.unitsById,
    employeesById: new Map([
      ...allocationCtx.employeesById,
      ...sid.employeesById,
    ]),
  };
  const keys = new Set(items.map((item) => item.groupKey));
  const sidRefs = Object.fromEntries(
    Object.entries(seatRefs).filter(([key]) => keys.has(key)),
  );

  const response: SpendQueryResponse = {
    kind: input.kind,
    ...(input.kind === 'spend' ? { basis: input.basis } : {}),
    currency: currency.mode,
    targetCurrency,
    window: {
      start: formatUTCDate(resolved.start),
      end: formatUTCDate(resolved.end),
      fiscalYear: resolved.fyNum,
    },
    periods: enumeratePeriods(
      resolved.start,
      resolved.end,
      input.granularity,
      fiscalConfig,
    ),
    items,
    refs: { ...sidRefs, ...buildRefs(input.groupBy, items, kept, refSource) },
  };
  return response;
}

export async function querySpendHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata') as UserMetadata;
    if (!userMetadata?.organizationId) {
      return c.json({ error: 'Missing organization context' }, 400);
    }
    const parsed = spendQueryInputSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: 'Invalid spend query', details: parsed.error.flatten() },
        400,
      );
    }
    // Seats ride the flow bases only (product ruling 2026-09-08): Contract
    // Term stays contracts-only, where the SID vendor's invoices count again.
    const { kind, window, granularity, groupBy } = parsed.data;
    return c.json(
      await timed(
        'spend.query',
        () =>
          runSpendQuery(userMetadata, parsed.data, {
            bloombergSid: kind === 'spend',
          }),
        { kind, window, granularity, groupBy },
      ),
    );
  } catch (error) {
    logger.error({ err: error }, 'Failed to run spend query');
    return c.json({ error: 'Internal server error' }, 500);
  }
}
