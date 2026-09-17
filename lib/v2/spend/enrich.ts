import type { SpendContractInput } from './contractInput';
import type { ContractWithPricing } from '@/lib/v2/core/types';
import { memoizedSegmentResolver, type SegmentResolver } from './pipeline';
import { cancelByOffsetDays, queryCommitments } from './queryEvents';
import { lineageFor, type SpendLineage } from './resolver';
import { resolveWindow } from './window';
import { addUTCDays, formatUTCDate, parseUTCDate } from './dates';
import { isStaleInvoice } from './invoiceRelevance';
import { convertAtTermStart } from './baseCurrency';
import { isInvoiceType } from '@/app/lib/constants';
import {
  buildSpendLineageFromEnriched,
  type RelationshipEdge,
} from './members';
import type {
  CurrencyPolicy,
  FeeSegment,
  FiscalConfig,
  SpendLineItem,
  SpendWindow,
} from './types';

// The cycle in force at the end of the queried window, resolver-derived: the
// term arrays only record some years, and cancel-by exists only as a day
// offset — historical (and gap-year) dates must be generated, never read.
export interface EngineCycleDates {
  termStart: string;
  // Inclusive display date (segments are half-open; this is `to` minus a day).
  termEnd: string;
  // Next cycle's deadline: termEnd minus the cancel-by offset, including a
  // psk-1855 notice period inherited from a linked MSA. Null without an offset.
  cancelBy: string | null;
}

// Per-product current/projected values for the stamped windows, in the
// contract's native currency (product rows render in row currency; the
// per-product USD pair has no consumer). Keyed by productId — the engine's
// composite `${contractId}:${productId}` key is split at stamp time because
// each stamp already lives on its contract.
export type EngineProductSpend = Record<
  number,
  { currentNative: number; projectedNative: number }
>;

export interface EngineSpendValues {
  // Denominated in the org's base display currency — whatever the caller's
  // CurrencyPolicy targets. Under the legacy 'preconverted-usd' policy that is
  // USD; under 'base' it is the org preference (USD or EUR today).
  currentBase: number;
  projectedBase: number;
  // Same queries resolved from each contract's original recorded fees — what
  // per-contract surfaces (table rows, CSV) display. Exact native cents; a
  // back-conversion from the base currency would drift by rounding.
  currentNative: number;
  projectedNative: number;
  // Present only when the caller asked for productValues (the budget table's
  // historical-FY path): the same windows answered per product, so product
  // sub-rows agree with their parent row by construction.
  products?: EngineProductSpend;
  // Invoice rows only: the whole amount the invoice records, answered over an
  // all-time window. An invoice's amount is a property of the document, not of
  // a fiscal window, and the invoices folder lists a register of what was
  // billed — a prior-period invoice must show what it charged rather than its
  // (correct) zero contribution to the current window. The windowed pair above
  // stays window-truthful so budget totals keep excluding it.
  recordedNative?: number;
  recordedBase?: number;
  // Present only when the caller asked for cycleDates (the historical-FY
  // table path); the default fetch-boundary stamps leave row dates on their
  // legacy array reads.
  cycle?: EngineCycleDates | null;
  // Whether the contract contributed spend to the current window: at least
  // one resolved segment overlaps it and the invoice-relevance rule keeps it.
  activeInWindow?: boolean;
}

export interface EngineSpendOptions {
  // How the base pair is denominated. Stated by the caller because only the
  // caller can reach the org's base currency and prefetch its rates — there is
  // no default, so no surface can silently fall back to USD.
  currency: CurrencyPolicy;
  // The pair of windows stamped as current/projected. Defaults to the live
  // view (currentFY/nextFY); the fiscal-year selector passes explicit years.
  windows?: { current: SpendWindow; projected: SpendWindow };
  cycleDates?: boolean;
  // Also stamp per-product values (EngineSpendValues.products) so product
  // sub-rows can follow the same windows as their parent row.
  productValues?: boolean;
  // Confirmed lineage-event cancellation cutoffs (PSK-1830), resolved by the
  // async caller; merged into the supersession cutoff graph earliest-wins.
  eventCutoffs?: Map<number, Map<number, Date>>;
}

const NATIVE: CurrencyPolicy = { mode: 'native' };

// The engine's full representable date range (parseUTCDate templates the
// string; segment bounds compare as 4-digit-year ISO strings), so every
// storable invoice date — including typos like a year-9998 term — falls
// inside. One knowing exception: windows are half-open, and no 4-digit ISO
// date exists after 9999-12-31 to serve as an exclusive bound, so a billing
// period STARTING on that final representable day stays out (pinned in
// spend-enrich tests). Closing a one-day gap at the calendar's edge would
// mean reworking the engine's date machinery.
const ALL_TIME: SpendWindow = { from: '0001-01-01', to: '9999-12-31' };

function sumByContract(items: SpendLineItem[]): Map<number, number> {
  const byContract = new Map<number, number>();
  for (const item of items) {
    const id = Number(item.groupKey);
    if (!Number.isFinite(id)) continue;
    byContract.set(id, (byContract.get(id) ?? 0) + item.value);
  }
  return byContract;
}

// groupBy 'product' keys are composite `${contractId}:${productId}`.
function sumByContractProduct(
  items: SpendLineItem[],
): Map<number, Map<number, number>> {
  const byContract = new Map<number, Map<number, number>>();
  for (const item of items) {
    const [contractPart, productPart] = item.groupKey.split(':');
    const contractId = Number(contractPart);
    const productId = Number(productPart);
    if (!Number.isFinite(contractId) || !Number.isFinite(productId)) continue;
    let products = byContract.get(contractId);
    if (!products) {
      products = new Map();
      byContract.set(contractId, products);
    }
    products.set(productId, (products.get(productId) ?? 0) + item.value);
  }
  return byContract;
}

/**
 * The annual value in force at one instant, per contract — the fallback for a
 * window that no cycle STARTS in.
 */
function inForceByContract(
  contracts: SpendContractInput[],
  lineage: SpendLineage,
  window: SpendWindow,
  fiscalConfig: FiscalConfig,
  asOf: Date,
  resolveSegments: SegmentResolver,
  currency: CurrencyPolicy,
  groupBy: 'contract' | 'product',
): Map<number, Map<number, number>> {
  const resolved = resolveWindow(window, asOf, fiscalConfig);
  const instant = formatUTCDate(resolved.start);
  const futureWindow = resolved.start > asOf;

  const byContract = new Map<number, Map<number, number>>();
  for (const contract of contracts) {
    if (isInvoiceType(contract.type_id)) continue;
    if (futureWindow && contract.will_not_renew) continue;
    const segments = resolveSegments(
      contract,
      lineageFor(lineage, contract.id),
      {
        asOf,
        horizonStart: resolved.start,
        horizonEnd: resolved.end,
        currency,
      },
    );
    // The resolver always reports native fees; conversion is a placement
    // concern, so the base policy applies its term-start rate here.
    const priced =
      currency.mode === 'base'
        ? convertAtTermStart(segments, currency)
        : segments;

    const values = new Map<number, number>();
    for (const segment of priced) {
      if (segment.from > instant || segment.to <= instant) continue;
      const key = groupBy === 'product' ? segment.productId : 0;
      values.set(key, (values.get(key) ?? 0) + segment.fee);
    }
    if (values.size > 0) byContract.set(contract.id, values);
  }
  return byContract;
}

/** Fills a zero window total with the value in force at its start. */
function withInForceFallback(
  committed: Map<number, number>,
  inForce: Map<number, Map<number, number>>,
  ids: number[],
): Map<number, number> {
  const filled = new Map(committed);
  for (const id of ids) {
    if ((filled.get(id) ?? 0) !== 0) continue;
    const value = inForce.get(id)?.get(0);
    if (value) filled.set(id, value);
  }
  return filled;
}

/** Per-product form of withInForceFallback, keyed contract -> product. */
function withInForceProductFallback(
  committed: Map<number, Map<number, number>>,
  inForce: Map<number, Map<number, number>>,
): Map<number, Map<number, number>> {
  const filled = new Map(committed);
  for (const [id, products] of inForce) {
    const existing = filled.get(id);
    if (existing && [...existing.values()].some((value) => value !== 0)) {
      continue;
    }
    filled.set(id, products);
  }
  return filled;
}

/**
 * Per-contract budget values from the engine, replacing the cycle-anchored
 * numbers `extractBudgetFromPriceHistory` reads off the cached minimal-mode
 * price history.
 *
 * Semantics (product decision 2026-08-04, psk-1850 — reverting the
 * provisional cancel-by dating): current/projected are the FY's START-DATED
 * COMMITMENTS — each cycle's full value in the FY containing its term or
 * renewal start, psk-1844's literal wording ('annual' valuation, so a
 * multi-year term contributes one year-slice per FY). Identical to
 * FY-windowed committed spend (test-pinned equivalence). This is the same
 * query the overview's Contract Term cards and chart issue, so the table
 * agrees with them by construction. Deliberately NOT parameterized by the
 * psk-1877 method: the table always answers Contract Term regardless of the
 * selector (product decision 2026-08-05, reversing the 2026-08-04 QA
 * direction) — recorded fees in the columns, not method-dependent
 * allocations.
 *
 * Runs over the FULL enriched set with no inclusion filter: callers exclude
 * superseded parents and linked child invoices at sum time via
 * `sumValuesInUSD`, and lineage needs every family member present regardless.
 *
 * TCV deliberately stays on the legacy read: it is a windowless scalar, and
 * `queryTCV` is a windowed event view — any window wide enough to catch every
 * committed end date also drives the projection horizon that far out.
 */
export function buildEngineSpendByContract(
  enriched: ContractWithPricing[],
  relationships: RelationshipEdge[],
  fiscalConfig: FiscalConfig,
  asOf: Date,
  options: EngineSpendOptions,
): Map<number, EngineSpendValues> {
  const base = options.currency;
  const windows = options.windows ?? {
    current: 'currentFY' as const,
    projected: 'nextFY' as const,
  };
  const contracts: SpendContractInput[] = enriched.map((ec) => ec.contract);
  const lineage = buildSpendLineageFromEnriched(
    enriched,
    relationships,
    options.eventCutoffs,
  );

  // queryCommitments resolves every contract twice per window (recorded +
  // projected passes, same horizon), so this fetch-boundary enrichment pays
  // one resolution per window per currency mode.
  const resolveSegments = memoizedSegmentResolver();

  const shared = {
    granularity: 'year' as const,
    valuation: 'annual' as const,
    recognition: 'term-start' as const,
    fiscalConfig,
    asOf,
  };

  const runItems = (
    contractSet: SpendContractInput[],
    window: SpendWindow,
    currency: CurrencyPolicy,
    groupBy: 'contract' | 'product',
  ) =>
    queryCommitments(
      contractSet,
      { ...shared, groupBy, window, currency },
      lineage,
      { resolveSegments },
    ).items;

  const ids = contracts.map((c) => c.id);
  const inForce = (
    window: SpendWindow,
    currency: CurrencyPolicy,
    groupBy: 'contract' | 'product',
  ) =>
    inForceByContract(
      contracts,
      lineage,
      window,
      fiscalConfig,
      asOf,
      resolveSegments,
      currency,
      groupBy,
    );

  const run = (window: SpendWindow, currency: CurrencyPolicy) =>
    withInForceFallback(
      sumByContract(runItems(contracts, window, currency, 'contract')),
      inForce(window, currency, 'contract'),
      ids,
    );

  const currentBase = run(windows.current, base);
  const projectedBase = run(windows.projected, base);
  const currentNative = run(windows.current, NATIVE);
  const projectedNative = run(windows.projected, NATIVE);

  const runProducts = (window: SpendWindow) =>
    withInForceProductFallback(
      sumByContractProduct(runItems(contracts, window, NATIVE, 'product')),
      inForce(window, NATIVE, 'product'),
    );

  const productCurrent = options.productValues
    ? runProducts(windows.current)
    : undefined;
  const productProjected = options.productValues
    ? runProducts(windows.projected)
    : undefined;

  // The same commitment query as the windowed pair — only the window widens —
  // so an invoice whose term sits inside the current window reads identically
  // on both stamps. Confined to invoice rows: they project no renewals
  // (resolver/renewals.ts), so the open horizon generates no synthetic
  // segments, and every other type keeps its window-relative reading.
  const invoiceContracts = contracts.filter((c) => isInvoiceType(c.type_id));
  const recordedNative = sumByContract(
    runItems(invoiceContracts, ALL_TIME, NATIVE, 'contract'),
  );
  const recordedBase = sumByContract(
    runItems(invoiceContracts, ALL_TIME, base, 'contract'),
  );

  const cycleFacts = options.cycleDates
    ? buildCycleFacts(
        contracts,
        lineage,
        windows.current,
        fiscalConfig,
        asOf,
        resolveSegments,
        base,
      )
    : undefined;

  const values = new Map<number, EngineSpendValues>();
  for (const ec of enriched) {
    const isInvoice = isInvoiceType(
      (ec.contract as { type_id?: number | null })?.type_id,
    );
    values.set(ec.id, {
      currentBase: currentBase.get(ec.id) ?? 0,
      projectedBase: projectedBase.get(ec.id) ?? 0,
      currentNative: currentNative.get(ec.id) ?? 0,
      projectedNative: projectedNative.get(ec.id) ?? 0,
      ...(isInvoice
        ? {
            recordedNative: recordedNative.get(ec.id) ?? 0,
            recordedBase: recordedBase.get(ec.id) ?? 0,
          }
        : {}),
      ...(productCurrent && productProjected
        ? {
            products: buildProductSpend(
              productCurrent.get(ec.id),
              productProjected.get(ec.id),
            ),
          }
        : {}),
      ...(cycleFacts ? (cycleFacts.get(ec.id) ?? INACTIVE_FACTS) : {}),
    });
  }
  return values;
}

// Union of the two windows' product keys: a product can start contributing in
// the projected FY (or stop after the current one) and still needs a stamp.
function buildProductSpend(
  current: Map<number, number> | undefined,
  projected: Map<number, number> | undefined,
): EngineProductSpend {
  const products: EngineProductSpend = {};
  for (const [productId, value] of current ?? []) {
    products[productId] = { currentNative: value, projectedNative: 0 };
  }
  for (const [productId, value] of projected ?? []) {
    const entry = products[productId];
    if (entry) entry.projectedNative = value;
    else products[productId] = { currentNative: 0, projectedNative: value };
  }
  return products;
}

const INACTIVE_FACTS = { cycle: null, activeInWindow: false } as const;

interface CycleFacts {
  cycle: EngineCycleDates | null;
  activeInWindow: boolean;
}

// One pass over the current window's already-memoized segments (same
// horizon/currency key as the base-currency query, so no extra resolution).
function buildCycleFacts(
  contracts: SpendContractInput[],
  lineage: SpendLineage,
  window: SpendWindow,
  fiscalConfig: FiscalConfig,
  asOf: Date,
  resolveSegments: SegmentResolver,
  currency: CurrencyPolicy,
): Map<number, CycleFacts> {
  const resolved = resolveWindow(window, asOf, fiscalConfig);
  const windowStart = formatUTCDate(resolved.start);
  const windowEnd = formatUTCDate(resolved.end);
  const lastDay = formatUTCDate(addUTCDays(resolved.end, -1));

  const facts = new Map<number, CycleFacts>();
  for (const contract of contracts) {
    if (isStaleInvoice(contract, resolved.start)) {
      facts.set(contract.id, INACTIVE_FACTS);
      continue;
    }
    const segments = resolveSegments(
      contract,
      lineageFor(lineage, contract.id),
      {
        asOf,
        horizonStart: resolved.start,
        horizonEnd: resolved.end,
        currency,
      },
    );
    const overlapping = segments.filter(
      (s) => s.from < windowEnd && s.to > windowStart,
    );
    if (overlapping.length === 0) {
      facts.set(contract.id, INACTIVE_FACTS);
      continue;
    }
    facts.set(contract.id, {
      cycle: cycleDatesFor(overlapping, lastDay, contract, lineage),
      activeInWindow: true,
    });
  }
  return facts;
}

function cycleDatesFor(
  overlapping: FeeSegment[],
  lastDay: string,
  contract: SpendContractInput,
  lineage: SpendLineage,
): EngineCycleDates {
  // Group by the resolver's termStart stamp so a multi-year deal reports its
  // WHOLE recorded term (the dates the user recognizes), not the engine's
  // internal 12-month accounting slices.
  const terms = new Map<string, { from: string; to: string }>();
  for (const s of overlapping) {
    const from = s.termStart ?? s.from;
    const term = terms.get(from);
    if (!term) terms.set(from, { from, to: s.to });
    else if (s.to > term.to) term.to = s.to;
  }
  const candidates = [...terms.values()];
  // The term in force on the window's last day; a contract that ended
  // mid-window falls back to its final term within it.
  const covering = candidates.filter(
    (i) => i.from <= lastDay && i.to > lastDay,
  );
  const pool = covering.length > 0 ? covering : candidates;
  const chosen = pool.reduce((a, b) => (b.from > a.from ? b : a));

  const termEndExclusive = parseUTCDate(chosen.to);
  const offsetDays = cancelByOffsetDays(contract, lineage);
  return {
    termStart: chosen.from,
    termEnd: formatUTCDate(addUTCDays(termEndExclusive, -1)),
    cancelBy:
      offsetDays > 0
        ? formatUTCDate(addUTCDays(termEndExclusive, -1 - offsetDays))
        : null,
  };
}

export function enrichWithEngineSpend(
  enriched: ContractWithPricing[],
  relationships: RelationshipEdge[],
  fiscalYearStartMonth: number,
  asOf: Date,
  options: EngineSpendOptions,
): ContractWithPricing[] {
  const values = buildEngineSpendByContract(
    enriched,
    relationships,
    { startMonth: fiscalYearStartMonth },
    asOf,
    options,
  );
  return enriched.map((ec) => ({ ...ec, engineSpend: values.get(ec.id) }));
}
