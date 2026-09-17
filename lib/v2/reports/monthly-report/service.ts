import { fetchContractsBase } from '@/app/lib/contracts/actions';
import { fetchAllRelationshipsForOrg } from '@/data/superuser/contracts';
import { getUserMetadata } from '@/data/users';
import { contractsToChainContracts } from '@/lib/contracts/productLineageResolution';
import { resolveProductFeeCutoffs } from '@/lib/contracts/resolveRemovedProductsForContracts';
import { enrichWithLineage } from '@/lib/v2/core/lineage';
import {
  enrichWithPricing,
  enrichWithEffectiveFees,
} from '@/lib/v2/core/pricing';
import { filterContracts } from '@/app/lib/contracts/filtering';
import { filterLinkedChildInvoices } from '@/app/lib/contracts/utils';
import {
  filterForAggregation,
  filterToBudgetContracts,
} from '@/lib/v2/core/filters';
import { adjustContractsForMonthlyReport } from '@/app/lib/budget/monthlyReportTransformers';
import {
  buildSpendByBusinessSponsor,
  buildSpendByBusinessGroup,
  transformToPriceChanges,
  transformToTopVendorsBySpend,
} from './transforms';
import {
  buildMonthlyValuesByContract,
  monthlyReportWindows,
  type MonthlyValues,
} from './engine';
import { buildSpendRateProvider } from '@/lib/v2/core/spendRates';
import type { CurrencyPolicy, RelationshipEdge } from '@/lib/v2/spend';
import { getFiscalYearInfo } from '@/app/lib/budget';
import { ContractWithPricing } from '@/lib/v2/core/types';
import { PriceHistory } from '@/app/lib/budget/types';

export interface MonthlyReportData {
  overview: {
    currentMonthSpend: { amount: number; label: string };
    nextMonthSpend: {
      amount: number;
      change: number;
      changePercent: number;
      label: string;
    };
  };
  spendByBusinessGroup: any[];
  spendByBusinessSponsor: any[];
  priceChanges: any[];
  topVendorsBySpend: any[];
}

/**
 * The FX a converted month was actually derived from, for one source currency.
 * Disclosed on the page so a reader can reconcile a base-currency figure
 * against the contract's own amount (PSK-1796).
 */
export interface FxRateDisclosure {
  /** Source currency of the contracts that needed converting. */
  from: string;
  /**
   * 'yyyy-MM' the current-month rate belongs to. Carried alongside the rate
   * rather than re-derived in the browser: the client renders a month label,
   * and a client clock in another timezone would name a different month than
   * the one the report was actually computed for.
   */
  currentMonthKey: string;
  /** Multiplier into the base currency applied to the current month. */
  currentMonthRate: number;
  /** 'yyyy-MM' the next-month rate belongs to. */
  nextMonthKey: string;
  /** Multiplier into the base currency applied to next month. */
  nextMonthRate: number;
}

export interface MonthlyReportResult {
  amortizedData: MonthlyReportData;
  actualCostData: MonthlyReportData;
  contracts: any[];
  enrichedContracts: ContractWithPricing[];
  priceHistories: PriceHistory[];
  upcomingRenewals: ContractWithPricing[];
  fiscalYearInfo: any;
  /** Empty when no conversion happened (single-currency org). */
  fxRates: FxRateDisclosure[];
}

/**
 * The rates the report's two months were converted at, one row per source
 * currency present among the contracts. Empty under a non-base policy or when
 * every contract is already priced in the target — there is nothing to
 * disclose when nothing was converted.
 */
export function buildFxDisclosure(
  contracts: Array<{ currency?: string | null }>,
  policy: CurrencyPolicy,
  currentMonthKey: string,
  nextMonthKey: string,
): FxRateDisclosure[] {
  if (policy.mode !== 'base') return [];

  const target = normalizeCurrency(policy.target);
  const sources = [
    ...new Set(contracts.map((c) => normalizeCurrency(c.currency))),
  ]
    .filter((code) => code !== target)
    .sort();

  return sources.map((from) => ({
    from,
    currentMonthKey,
    currentMonthRate: policy.rates.monthRate(from, currentMonthKey),
    nextMonthKey,
    nextMonthRate: policy.rates.monthRate(from, nextMonthKey),
  }));
}

/** Matches the rate provider's own coercion, so lookups cannot miss on case. */
function normalizeCurrency(code: string | null | undefined): string {
  return (code ?? '').trim().toUpperCase() || 'USD';
}

/**
 * Get monthly report data with V2 enrichments.
 *
 * Flow: fetch → filter → adjust dates → enrich (lineage + pricing) →
 * engine values → transform. Monthly numbers come from the spend engine
 * (deterministic under the injected asOf); enrichment still supplies display
 * metadata and the priceHistories/enrichedContracts result fields.
 * @param alertRange - Number of days to look ahead for upcoming renewals
 * @param providedUserMetadata - Optional user metadata to avoid duplicate fetching
 * @param asOf - "Today" for all report math; defaults to the wall clock
 */
export async function getMonthlyReportData(
  alertRange: number = 90,
  providedUserMetadata?: Awaited<ReturnType<typeof getUserMetadata>>,
  asOf: Date = new Date(),
): Promise<MonthlyReportResult | null> {
  const userMetadata = providedUserMetadata ?? (await getUserMetadata());
  if (!userMetadata) {
    return null;
  }

  const fiscalYearStart = userMetadata.organizationFY || 1;

  // DATA LAYER - fetch base data once
  const [baseContracts, relationships] = await Promise.all([
    fetchContractsBase(),
    fetchAllRelationshipsForOrg(userMetadata.organizationId),
  ]);

  // Filter contracts for monthly report (published, hide failed)
  const filteredContracts = filterContracts(baseContracts, {
    hideFailed: true,
    contractStatus: 4,
  });

  // Filter contracts for upcoming renewals (unadjusted - needs original dates)
  const upcomingRenewalsRaw = filterContracts(baseContracts, {
    range: alertRange,
    hideFailed: true,
    contractStatus: 4,
    status: 'active',
  });

  // Filter out linked child invoices
  const contractsWithoutChildren = filterLinkedChildInvoices(
    filteredContracts,
    relationships,
  );

  // Adjust contracts for monthly report (handle future term dates)
  // This MUST happen before pricing enrichment
  const adjustedContracts = adjustContractsForMonthlyReport(
    contractsWithoutChildren,
    asOf,
  );

  // Confirmed cancellation cutoffs (PSK-1830), resolved from the UNFILTERED
  // base set (matching getContractsList and inventory): cutoff dates follow
  // the contracts' real term dates, and a declaring addendum hidden by the
  // report's filters must still strike. Degrades to an empty map (plus a
  // paged alert) on failure.
  const cutoffsByContract = await resolveProductFeeCutoffs({
    organizationId: userMetadata.organizationId,
    chainContracts: contractsToChainContracts(baseContracts),
    relationships,
  });

  // LOGIC LAYER - apply V2 enrichments to adjusted contracts
  const withLineage = enrichWithLineage(adjustedContracts, relationships);
  const withPricing = await enrichWithPricing(withLineage, fiscalYearStart, {
    cutoffsByContract,
    baseCurrency: userMetadata.baseCurrency,
  });
  const withEffectiveFees = enrichWithEffectiveFees(withPricing);

  // Also enrich upcoming renewals (unadjusted)
  const renewalsWithLineage = enrichWithLineage(
    upcomingRenewalsRaw,
    relationships,
  );
  const renewalsWithPricing = await enrichWithPricing(
    renewalsWithLineage,
    fiscalYearStart,
    { cutoffsByContract, baseCurrency: userMetadata.baseCurrency },
  );
  const upcomingRenewals = enrichWithEffectiveFees(renewalsWithPricing);

  // Extract price histories array for transformers
  const priceHistories = extractPriceHistories(withEffectiveFees);

  // Extract raw contracts for transformers (they expect the original format)
  const rawContracts = withEffectiveFees.map((c) => c.contract);

  // Get fiscal year info
  const fiscalYearInfo = getFiscalYearInfo(fiscalYearStart, asOf);

  // ENGINE LAYER - per-contract current/next month values for both views.
  // Query the budget chart's exact kept set (QA: struck products' pre-cutoff
  // share and fully-superseded rows made Monthly Intelligence disagree with
  // the chart): budget-relevant rows only, linked children and
  // fully-superseded contracts excluded. Lineage still builds over the FULL
  // enriched set so a filtered-out family member keeps cutting its parent
  // and donating its term, with confirmed lineage-event cancellations
  // folded into the cutoff graph (PSK-1830). Rows outside the kept set get
  // no engine values, so every transform below skips them as zero.
  const keptForSpend = filterForAggregation(
    filterToBudgetContracts(withEffectiveFees),
  );
  // Both views are amortized/actual, which recognise money per calendar month
  // and so convert at each month's average rate — hence the span is the two
  // report windows, prefetched here because the engine is synchronous.
  const fiscalConfig = { startMonth: fiscalYearStart };
  const { currentMonthKey, nextMonthKey, currentWindow, nextWindow } =
    monthlyReportWindows(asOf, fiscalConfig);
  const currency: CurrencyPolicy = {
    mode: 'base',
    target: userMetadata.baseCurrency,
    rates: await buildSpendRateProvider({
      contracts: keptForSpend.map((ec) => ec.contract),
      target: userMetadata.baseCurrency,
      asOf,
      span: {
        start: new Date(
          `${currentWindow.from < nextWindow.from ? currentWindow.from : nextWindow.from}T00:00:00.000Z`,
        ),
        end: new Date(`${currentWindow.to}T00:00:00.000Z`),
      },
    }),
  };
  const engineValues = buildMonthlyValuesByContract(
    keptForSpend,
    relationships,
    fiscalConfig,
    asOf,
    {
      currency,
      lineageSource: withEffectiveFees,
      eventCutoffs: cutoffsByContract,
    },
  );

  // TRANSFORM LAYER - calculate both views. The native maps ride out of the
  // SAME engine run as the base figures: every per-contract bucket carries the
  // engine's nativeValue stamp, so nothing re-queries to learn what a contract
  // was priced in. Price changes are detected on those native figures — the
  // base figures convert each month at that month's average rate, so
  // subtracting them would mix a real price movement with FX drift and
  // surface a flat foreign contract as a "Price increase" (PSK-1796).
  const amortizedData = buildReportData(
    withEffectiveFees,
    engineValues.amortized,
    asOf,
    'amortized',
    userMetadata.baseCurrency,
    relationships,
    engineValues.amortizedNative,
  );

  const actualCostData = buildReportData(
    withEffectiveFees,
    engineValues.actual,
    asOf,
    'actual',
    userMetadata.baseCurrency,
    relationships,
    engineValues.actualNative,
  );

  return {
    amortizedData,
    actualCostData,
    contracts: rawContracts,
    enrichedContracts: withEffectiveFees,
    priceHistories,
    upcomingRenewals,
    fiscalYearInfo,
    fxRates: buildFxDisclosure(
      keptForSpend.map((ec) => ec.contract),
      currency,
      currentMonthKey,
      nextMonthKey,
    ),
  };
}

/**
 * Extract price histories from enriched contracts into separate array.
 * Transformers expect (contracts, priceHistories) as separate params.
 */
function extractPriceHistories(
  contracts: ContractWithPricing[],
): PriceHistory[] {
  return contracts
    .filter((c) => c.priceHistory)
    .map((c) => c.priceHistory as PriceHistory);
}

/**
 * Build report data for a specific view mode.
 */
function buildReportData(
  enrichedContracts: ContractWithPricing[],
  values: Map<number, MonthlyValues>,
  asOf: Date,
  viewMode: 'amortized' | 'actual',
  // nativeValues is present only for contracts priced outside the org base
  // currency; everything else is already native in `values`. baseCurrency is
  // required — a silent default here would denominate a EUR org's parent rows
  // in USD without an error.
  baseCurrency: string,
  relationships: RelationshipEdge[],
  nativeValues?: Map<number, MonthlyValues>,
): MonthlyReportData {
  const denomination = { nativeValues, baseCurrency };

  const spendByBusinessSponsor = buildSpendByBusinessSponsor(
    enrichedContracts,
    values,
    denomination,
  );

  const spendByBusinessGroup = buildSpendByBusinessGroup(
    enrichedContracts,
    values,
    relationships,
    denomination,
  );

  const priceChanges = transformToPriceChanges(
    enrichedContracts,
    values,
    asOf,
    nativeValues,
  );

  const topVendorsBySpend = transformToTopVendorsBySpend(
    enrichedContracts,
    values,
  );

  // Calculate overview totals
  const currentMonthSpend = spendByBusinessSponsor.reduce(
    (total, sponsor) => total + sponsor.currentMonth,
    0,
  );

  const nextMonthSpend = spendByBusinessSponsor.reduce(
    (total, sponsor) => total + sponsor.nextMonth,
    0,
  );

  const change = nextMonthSpend - currentMonthSpend;
  const changePercent =
    currentMonthSpend > 0 ? (change / currentMonthSpend) * 100 : 0;

  const viewLabel = viewMode === 'amortized' ? 'Amortized' : 'Actual Cost';

  return {
    overview: {
      currentMonthSpend: {
        amount: currentMonthSpend,
        label: `Current Month Spend (${viewLabel})`,
      },
      nextMonthSpend: {
        amount: nextMonthSpend,
        change,
        changePercent,
        label: `Next Month Spend (${viewLabel})`,
      },
    },
    spendByBusinessGroup,
    spendByBusinessSponsor,
    priceChanges,
    topVendorsBySpend,
  };
}
