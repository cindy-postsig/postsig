/**
 * Shadow diff: LIVE legacy spend path vs querySpend over a REAL org
 * (read-only). Run before flipping any surface in phase 5.2.
 *
 * Legacy side reproduces the budget-chart pipeline — enrichWithLineage →
 * filterForAggregation → generatePriceHistory('minimal', hasFeeOverrides) →
 * chart extractors. Engine side runs querySpend / queryRenewals / queryTCV
 * with REAL lineage over the same kept set. Both sides see NATIVE fees (no
 * FX), so deltas are behavior, never conversion.
 *
 * Every nonzero delta must be attributable to a recorded number-move
 * (docs/spend-engine-progress.md §5.1): mid-term amendment truncate+scale,
 * decision-#9 shapes, #1594 renewal hints, billing-frequency fold, renewal
 * event semantics. Anything else is a bug to explain BEFORE porting.
 *
 * Usage:
 *   npx tsx scripts/spend-shadow-diff.ts                 # Berenberg Bank
 *   ORG_ID=<uuid> npx tsx scripts/spend-shadow-diff.ts   # another org
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import type { Database } from '../database.types';
import type { Contract, PriceHistory } from '../app/lib/budget/types';
import { generatePriceHistory } from '../app/lib/budget/priceHistoryCalculator';
import {
  extractAmortizedData,
  extractActualCostData,
  extractRenewalsData,
  extractChartData,
} from '../app/lib/budget/priceHistoryChartUtils';
import { getFiscalYearInfo } from '../app/lib/budget/dateUtils';
import { enrichWithLineage } from '../lib/v2/core/lineage';
import { filterForAggregation } from '../lib/v2/core/filters';
import { hasFeeOverrides } from '../lib/v2/products/transforms';
import {
  querySpend,
  queryRenewals,
  queryTCV,
  buildSpendLineageFromEnriched,
} from '../lib/v2/spend';
import type { SpendLineItem } from '../lib/v2/spend';

dotenv.config({ path: '.env.prod' });

const BERENBERG_BANK = '4d2bdb8f-63d9-43c6-9825-bb229205d70b';
const ORG_ID = process.env.ORG_ID || BERENBERG_BANK;
const ASOF = new Date();
const usd = { mode: 'preconverted-usd' } as const;

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function money(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padEnd(width);
}

type Series = Map<string, number>;

function addTo(series: Series, key: string, value: number): void {
  series.set(key, (series.get(key) ?? 0) + value);
}

function sum(series: Series): number {
  return [...series.values()].reduce((s, v) => s + v, 0);
}

function itemsToSeries(items: SpendLineItem[], groupKey: string): Series {
  const series: Series = new Map();
  for (const item of items) {
    if (item.groupKey === groupKey) addTo(series, item.period, item.value);
  }
  return series;
}

interface ContractDiff {
  id: number;
  vendor: string;
  legacy: Series;
  engine: Series;
}

function printDiffSection(
  title: string,
  diffs: ContractDiff[],
  { showMonths = false }: { showMonths?: boolean } = {},
): void {
  console.log(`\n=== ${title} ===`);

  // Monthly cent-rounding legitimately wobbles FY sums by a few cents; only
  // sub-dollar deltas are noise, anything at $1+ needs attribution.
  const moved = diffs
    .map((d) => ({ ...d, delta: sum(d.engine) - sum(d.legacy) }))
    .filter((d) => Math.abs(d.delta) >= 1);

  const legacyTotal = diffs.reduce((s, d) => s + sum(d.legacy), 0);
  const engineTotal = diffs.reduce((s, d) => s + sum(d.engine), 0);
  console.log(
    `totals: legacy ${money(legacyTotal)} | engine ${money(engineTotal)} | delta ${money(engineTotal - legacyTotal)} | contracts moved: ${moved.length}/${diffs.length}`,
  );

  for (const d of moved.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))) {
    console.log(
      `  ${pad(`#${d.id}`, 7)} ${pad(d.vendor, 30)} legacy ${pad(money(sum(d.legacy)), 12)} engine ${pad(money(sum(d.engine)), 12)} delta ${money(d.delta)}`,
    );
    if (showMonths) {
      const keys = [
        ...new Set([...d.legacy.keys(), ...d.engine.keys()]),
      ].sort();
      for (const key of keys) {
        const l = d.legacy.get(key) ?? 0;
        const e = d.engine.get(key) ?? 0;
        if (Math.abs(e - l) > 0.01) {
          console.log(
            `      ${key}  legacy ${pad(money(l), 12)} engine ${pad(money(e), 12)}`,
          );
        }
      }
    }
  }
}

async function main(): Promise<void> {
  const { data: org } = await supabase
    .from('organizations')
    .select('name, fiscal_year_start_month')
    .eq('id', ORG_ID)
    .single();
  const fiscalMonth = org?.fiscal_year_start_month ?? 1;
  const fiscalConfig = { startMonth: fiscalMonth };
  console.log(
    `\n=== Spend shadow diff — ${org?.name} (FY start month ${fiscalMonth}) — asOf ${ASOF.toISOString().slice(0, 10)} ===`,
  );

  const { data: orgUsers } = await supabase
    .from('users')
    .select('id')
    .eq('organization_id', ORG_ID);
  const userIds = (orgUsers ?? []).map((u) => u.id);

  const { data } = await supabase
    .from('contracts')
    .select(
      '*, vendors:vendor_id(*), contract_types:type_id(*), vendor_products_details(*, vendor_products:product_id(*)), users:user_id(organizations!users_organization_id_fkey(fiscal_year_start_month))',
    )
    .in('user_id', userIds)
    .or('status.eq.active,status.eq.unconfirmed')
    .eq('status_id', 4);
  const contracts = (data ?? []) as unknown as Contract[];
  const ids = contracts.map((c) => c.id);

  // relationship_type must be selected: isHierarchyEdge tests `== null`, so a
  // row that never loaded the column reads as a hierarchy edge and the
  // builders' billing filter becomes a no-op here — the diff would then report
  // a spurious regression against production, which does filter.
  const { data: relRows } = await supabase
    .from('contract_relationships')
    .select('parent_contract_id, child_contract_id, relationship_type')
    .in('child_contract_id', ids)
    .eq('active', true)
    .or('disabled.is.null,disabled.eq.false');
  const rels = relRows ?? [];

  const enriched = enrichWithLineage(contracts, rels);
  const keptEnriched = filterForAggregation(enriched);
  const keptById = new Map(keptEnriched.map((ec) => [ec.id, ec]));
  const kept = contracts.filter((c) => keptById.has(c.id));
  const lineage = buildSpendLineageFromEnriched(enriched, rels);
  console.log(
    `contracts: ${contracts.length} fetched → ${kept.length} after filterForAggregation (both sides see the SAME set)\n` +
      `legacy = enrich → generatePriceHistory('minimal') → chart extractors; engine = querySpend + real lineage. Native fees on both sides.`,
  );

  const vendorOf = (c: Contract): string =>
    (c as { vendors?: { name?: string } }).vendors?.name ?? '?';

  const fiscalYearInfo = getFiscalYearInfo(fiscalMonth);
  const currentFY = fiscalYearInfo.currentFiscalYear;

  const phById = new Map<number, PriceHistory>();
  for (const c of kept) {
    phById.set(
      c.id,
      generatePriceHistory(c, fiscalMonth, 'minimal', {
        hasFeeOverrides: hasFeeOverrides(
          c as unknown as Parameters<typeof hasFeeOverrides>[0],
        ),
      }),
    );
  }

  const chartSeries = (
    extractor: typeof extractAmortizedData,
    c: Contract,
  ): Series => {
    const series: Series = new Map();
    const result = extractor([phById.get(c.id)!], 'current', fiscalYearInfo);
    for (const point of result.data) {
      if (point.value !== 0) addTo(series, point.key, point.value);
    }
    return series;
  };

  const engineSeries = (basis: 'amortized' | 'actual'): SpendLineItem[] =>
    querySpend(
      kept,
      {
        basis,
        source: 'expected',
        window: 'currentFY',
        granularity: 'month',
        groupBy: 'contract',
        currency: usd,
        fiscalConfig,
        asOf: ASOF,
      },
      lineage,
    ).items;

  const amortizedItems = engineSeries('amortized');
  const actualItems = engineSeries('actual');

  printDiffSection(
    `AMORTIZED — chart 'current' FY${currentFY} monthly`,
    kept.map((c) => ({
      id: c.id,
      vendor: vendorOf(c),
      legacy: chartSeries(extractAmortizedData, c),
      engine: itemsToSeries(amortizedItems, String(c.id)),
    })),
    { showMonths: process.argv.includes('--months') },
  );

  printDiffSection(
    `ACTUAL — chart 'current' FY${currentFY} monthly`,
    kept.map((c) => ({
      id: c.id,
      vendor: vendorOf(c),
      legacy: chartSeries(extractActualCostData, c),
      engine: itemsToSeries(actualItems, String(c.id)),
    })),
    { showMonths: process.argv.includes('--months') },
  );

  const renewalItems = queryRenewals(
    kept,
    {
      window: 'currentFY',
      granularity: 'month',
      groupBy: 'contract',
      currency: usd,
      fiscalConfig,
      asOf: ASOF,
    },
    lineage,
  ).items;

  printDiffSection(
    `RENEWALS — FY${currentFY} (legacy: one event, next-year fee, cancel-by positioning; engine: term events at full incoming-term value — semantic deltas EXPECTED)`,
    kept.map((c) => ({
      id: c.id,
      vendor: vendorOf(c),
      legacy: chartSeries(
        (contracts, chartType, info) =>
          extractRenewalsData(contracts, chartType, info),
        c,
      ),
      engine: itemsToSeries(renewalItems, String(c.id)),
    })),
  );

  const monthStart = `${ASOF.toISOString().slice(0, 7)}-01`;
  const tcvItems = queryTCV(
    kept,
    {
      window: { from: monthStart, to: `${ASOF.getUTCFullYear() + 10}-01-01` },
      granularity: 'month',
      groupBy: 'contract',
      currency: usd,
      fiscalConfig,
      asOf: ASOF,
    },
    lineage,
  ).items;

  printDiffSection(
    'TCV — committed value at term end, current month onward (legacy: total value at currentTermEnd; engine: committed segments at committed end)',
    kept.map((c) => {
      const series: Series = new Map();
      const result = extractChartData(
        [phById.get(c.id)!],
        'renewals',
        'tcv',
        fiscalYearInfo,
      );
      for (const point of result.data) {
        if (point.value !== 0) addTo(series, point.key, point.value);
      }
      return {
        id: c.id,
        vendor: vendorOf(c),
        legacy: series,
        engine: itemsToSeries(tcvItems, String(c.id)),
      };
    }),
  );

  console.log(
    '\nEvery contract above must map to a recorded number-move (progress doc §5.1); anything unexplained is a port blocker.\n',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
