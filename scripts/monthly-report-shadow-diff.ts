/**
 * Shadow diff for the 5.2.4 monthly-report port: the DELETED legacy values
 * path (chart extractors + FY-straddle branching over minimal price history,
 * reproduced inline from the pre-port transforms) vs the engine path the
 * report now runs (buildMonthlyValuesByContract with real lineage), over a
 * REAL org, read-only.
 *
 * Both sides see the report's own inclusion chain — published, linked child
 * invoices dropped, future-term dates adjusted — and NATIVE fees (no FX), so
 * deltas are behavior, never conversion. LIMITATION: the legacy side skips
 * enrichWithEffectiveFees (async pricing enrichment), so amended contracts
 * show raw fees — their legacy figure is slightly overstated vs production;
 * they land in the amendment bucket either way. Expected buckets (progress
 * doc §5.2.4 / §5.1): decision-#13 group moves, supersession zero-at-cutoff
 * vs legacy full-exclusion, invoice no-projection (#11), minimal-mode leading
 * gap. Anything else is a bug to explain BEFORE calling the port done.
 *
 * Usage:
 *   npx tsx scripts/monthly-report-shadow-diff.ts                 # Berenberg
 *   ORG_ID=<uuid> npx tsx scripts/monthly-report-shadow-diff.ts   # other org
 */
import { createClient } from '@supabase/supabase-js';
import { addMonths, format, startOfMonth } from 'date-fns';
import dotenv from 'dotenv';
import type { Database } from '../database.types';
import type { Contract, PriceHistory } from '../app/lib/budget/types';
import { generatePriceHistory } from '../app/lib/budget/priceHistoryCalculator';
import {
  extractAmortizedData,
  extractActualCostData,
} from '../app/lib/budget/priceHistoryChartUtils';
import { getFiscalYearInfo } from '../app/lib/budget/dateUtils';
import { adjustContractsForMonthlyReport } from '../app/lib/budget/monthlyReportTransformers';
import { enrichWithLineage } from '../lib/v2/core/lineage';
import { hasFeeOverrides } from '../lib/v2/products/transforms';
import {
  buildMonthlyValuesByContract,
  type MonthlyValues,
} from '../lib/v2/reports/monthly-report/engine';
import type { ContractWithPricing } from '../lib/v2/core/types';

dotenv.config({ path: '.env.prod' });

const BERENBERG_BANK = '4d2bdb8f-63d9-43c6-9825-bb229205d70b';
const ORG_ID = process.env.ORG_ID || BERENBERG_BANK;
const ASOF = new Date();

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function money(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padEnd(width);
}

/**
 * The pre-port getMonthlyValues, verbatim in behavior: current month from the
 * 'current' FY extraction; next month from 'projected' when it crosses the FY
 * boundary. This is the code the port deleted — kept here as the comparison
 * oracle.
 */
function legacyMonthlyValues(
  priceHistory: PriceHistory,
  fiscalYearInfo: ReturnType<typeof getFiscalYearInfo>,
  extractor: typeof extractAmortizedData,
  asOf: Date,
): MonthlyValues {
  const currentCalendarMonth = startOfMonth(asOf);
  const nextCalendarMonth = addMonths(currentCalendarMonth, 1);
  const currentMonthKey = format(currentCalendarMonth, 'yyyy-MM');
  const nextMonthKey = format(nextCalendarMonth, 'yyyy-MM');

  const isNextMonthInNextFY =
    nextCalendarMonth >= fiscalYearInfo.nextFiscalYearStart;

  const currentFYData = extractor([priceHistory], 'current', fiscalYearInfo);
  const currentMonth =
    currentFYData.data.find((d) => d.key === currentMonthKey)?.value || 0;

  const nextSource = isNextMonthInNextFY
    ? extractor([priceHistory], 'projected', fiscalYearInfo)
    : currentFYData;
  const nextMonth =
    nextSource.data.find((d) => d.key === nextMonthKey)?.value || 0;

  return { currentMonth, nextMonth, change: nextMonth - currentMonth };
}

function fullySuperseded(ec: { products: Array<{ isSuperseded: boolean }> }) {
  return ec.products.length > 0 && ec.products.every((p) => p.isSuperseded);
}

interface Row {
  id: number;
  vendor: string;
  legacy: MonthlyValues;
  engine: MonthlyValues;
  legacyExcluded: boolean;
}

function printSection(title: string, rows: Row[]): void {
  console.log(`\n=== ${title} ===`);
  const totals = (pick: (r: Row) => MonthlyValues, excludeLegacy: boolean) =>
    rows.reduce(
      (acc, r) => {
        if (excludeLegacy && r.legacyExcluded) return acc;
        const v = pick(r);
        return {
          currentMonth: acc.currentMonth + v.currentMonth,
          nextMonth: acc.nextMonth + v.nextMonth,
        };
      },
      { currentMonth: 0, nextMonth: 0 },
    );
  const legacyTotal = totals((r) => r.legacy, true);
  const engineTotal = totals((r) => r.engine, false);
  console.log(
    `totals current: legacy ${money(legacyTotal.currentMonth)} | engine ${money(engineTotal.currentMonth)} | delta ${money(engineTotal.currentMonth - legacyTotal.currentMonth)}`,
  );
  console.log(
    `totals next:    legacy ${money(legacyTotal.nextMonth)} | engine ${money(engineTotal.nextMonth)} | delta ${money(engineTotal.nextMonth - legacyTotal.nextMonth)}`,
  );

  const moved = rows
    .map((r) => ({
      ...r,
      delta:
        r.engine.currentMonth +
        r.engine.nextMonth -
        (r.legacyExcluded ? 0 : r.legacy.currentMonth + r.legacy.nextMonth),
    }))
    .filter((r) => Math.abs(r.delta) >= 1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  console.log(`contracts moved (|Δ| ≥ $1 across the two months):`);
  for (const r of moved) {
    const note = r.legacyExcluded ? ' [legacy EXCLUDED: fully superseded]' : '';
    console.log(
      `  ${pad(`#${r.id}`, 7)} ${pad(r.vendor, 30)} cur ${pad(money(r.legacy.currentMonth), 10)}→${pad(money(r.engine.currentMonth), 10)} next ${pad(money(r.legacy.nextMonth), 10)}→${pad(money(r.engine.nextMonth), 10)}${note}`,
    );
  }
  if (moved.length === 0) console.log('  (none)');
}

async function main(): Promise<void> {
  const { data: org } = await supabase
    .from('organizations')
    .select('name, fiscal_year_start_month')
    .eq('id', ORG_ID)
    .single();
  const fiscalMonth = org?.fiscal_year_start_month ?? 1;
  console.log(
    `\n=== Monthly-report shadow diff — ${org?.name} (FY start month ${fiscalMonth}) — asOf ${ASOF.toISOString().slice(0, 10)} ===`,
  );

  const { data: orgUsers } = await supabase
    .from('users')
    .select('id')
    .eq('organization_id', ORG_ID);
  const userIds = (orgUsers ?? []).map((u) => u.id);

  const { data } = await supabase
    .from('contracts')
    .select(
      '*, vendors:vendor_id(*), contract_types:type_id(*), vendor_products_details(*, vendor_products:product_id(*)), contract_tags(user_tags(name)), contract_acl_group(groups(id, name, public_uuid)), folder_contracts(folders(folder_acl_group(groups(id, name, public_uuid))))',
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

  // The report's own chain: drop linked child invoices, adjust future-dated
  // terms, then enrich. Both sides run over the SAME adjusted kept set.
  const preEnriched = enrichWithLineage(contracts, rels);
  const keptRaw = adjustContractsForMonthlyReport(
    preEnriched
      .filter((ec) => !ec.isLinkedChildInvoice)
      .map((ec) => ec.contract),
    ASOF,
  ) as Contract[];
  const enriched = enrichWithLineage(
    keptRaw,
    rels,
  ) as unknown as ContractWithPricing[];
  console.log(
    `contracts: ${contracts.length} fetched → ${keptRaw.length} after linked-invoice filter (same set both sides, native fees)`,
  );

  const fiscalYearInfo = getFiscalYearInfo(fiscalMonth, ASOF);
  const phById = new Map<number, PriceHistory>();
  for (const c of keptRaw) {
    phById.set(
      c.id,
      generatePriceHistory(c, fiscalMonth, 'minimal', {
        hasFeeOverrides: hasFeeOverrides(
          c as unknown as Parameters<typeof hasFeeOverrides>[0],
        ),
      }),
    );
  }

  const engineValues = buildMonthlyValuesByContract(
    enriched,
    rels,
    { startMonth: fiscalMonth },
    ASOF,
    // Shadow diff runs on native fees both sides; no FX to reconcile.
    { currency: { mode: 'native' } },
  );

  const vendorOf = (c: Contract): string =>
    (c as { vendors?: { name?: string } }).vendors?.name ?? '?';
  const enrichedById = new Map(enriched.map((ec) => [ec.id, ec]));

  const rowsFor = (
    extractor: typeof extractAmortizedData,
    values: Map<number, MonthlyValues>,
  ): Row[] =>
    keptRaw.map((c) => ({
      id: c.id,
      vendor: vendorOf(c),
      legacy: legacyMonthlyValues(
        phById.get(c.id)!,
        fiscalYearInfo,
        extractor,
        ASOF,
      ),
      engine: values.get(c.id) ?? { currentMonth: 0, nextMonth: 0, change: 0 },
      legacyExcluded: fullySuperseded(enrichedById.get(c.id)!),
    }));

  printSection(
    'AMORTIZED — current + next month',
    rowsFor(extractAmortizedData, engineValues.amortized),
  );
  printSection(
    'ACTUAL — current + next month',
    rowsFor(extractActualCostData, engineValues.actual),
  );

  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
