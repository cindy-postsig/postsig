/**
 * Product-reviewable audit workbook: legacy vs spend-engine, per contract.
 *
 * Emits an xlsx with one row per contract archetype: the recorded terms and
 * fees, then legacy vs engine side by side for each figure the budget surfaces
 * show.
 *
 * Fees are NATIVE currency on BOTH sides (this bypasses convertAllProductsToUSD,
 * as every sniff script does), so totals will not match the USD figures in the
 * app. Compare cadence and multipliers, not absolute FX.
 *
 * Usage:
 *   npx tsx scripts/spend-audit-workbook.ts
 *   npx tsx scripts/spend-audit-workbook.ts --contracts 3102,3118,111
 *   ORG_ID=<uuid> npx tsx scripts/spend-audit-workbook.ts --out tmp/audit.xlsx
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Database } from '../database.types';
import type { Contract, PriceHistory } from '../app/lib/budget/types';
import {
  querySpend,
  queryCommitments,
  buildSpendLineageFromEnriched,
} from '../lib/v2/spend';
import type { SpendLineage } from '../lib/v2/spend';
import { enrichWithLineage } from '../lib/v2/core/lineage';
import { generatePriceHistory } from '../app/lib/budget/priceHistoryCalculator';
import { extractBudgetFromPriceHistory } from '../app/lib/budget/priceHistoryProducts';
import {
  extractAmortizedData,
  extractActualCostData,
} from '../app/lib/budget/priceHistoryChartUtils';
import { getFiscalYearInfo } from '../app/lib/budget';
import { hasFeeOverrides } from '../lib/v2/products/transforms';

dotenv.config({ path: '.env.prod' });

const BERENBERG_BANK = '4d2bdb8f-63d9-43c6-9825-bb229205d70b';
const CONTRACT_TYPE_INVOICE = 6;
const ORG_ID = process.env.ORG_ID || BERENBERG_BANK;
const ASOF = new Date();
const CURRENT_FY = ASOF.getUTCFullYear();
const usd = { mode: 'preconverted-usd' } as const;

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

const OUT = argValue('--out') || 'tmp/spend-audit.xlsx';

/**
 * One contract per archetype behind the legacy/engine deltas, so a reviewer
 * sees each distinct cause once rather than 13 rows of the same thing.
 */
const ARCHETYPES: Array<{ id: number; archetype: string }> = [
  {
    id: 3102,
    archetype:
      'DATA DEFECT — relationship row has active:null, so this invoice is not filtered as a linked child',
  },
  {
    id: 3118,
    archetype:
      'DATA DEFECT — same active:null issue; current period (2026 H1) of the same series',
  },
  {
    id: 3124,
    archetype: 'Annual invoice series — ENDED (2024), still projecting',
  },
  { id: 3126, archetype: 'Annual invoice series — current (2026)' },
  {
    id: 3000,
    archetype: '2-month invoice annualising (previously reviewed as correct)',
  },
  {
    id: 3099,
    archetype: 'Service Order from 2010, no end date — projects forever',
  },
  {
    id: 111,
    archetype: 'Leading-gap fill: legacy shows $0 for pre-cycle months',
  },
  {
    id: 112,
    archetype:
      'Renewal-index shift (#1594): engine is one renewal ahead — 6,655 is legacy\u2019s 2027 figure',
  },
  {
    id: 3019,
    archetype:
      'DATA DEFECT — orphaned by archiving parent #3017; PSK-1843 auto-archives these going forward',
  },
  { id: 3018, archetype: 'Sibling of #3019 — same orphaned-invoice series' },
  {
    id: 3040,
    archetype: 'Mid-term amendment — engine truncates, legacy double-counts',
  },
  { id: 3047, archetype: '36-month multi-year, year 1/2/3 fee rows' },
  { id: 88, archetype: '36-month term — no cycle starts in FY, committed = 0' },
];

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function fetchContracts(): Promise<{
  kept: Contract[];
  lineage: SpendLineage;
  fiscalMonth: number;
}> {
  const { data: orgUsers, error: usersError } = await supabase
    .from('users')
    .select('id')
    .eq('organization_id', ORG_ID);
  if (usersError) throw usersError;
  const userIds = (orgUsers ?? []).map((u) => u.id);

  const { data, error } = await supabase
    .from('contracts')
    .select(
      `
      *,
      vendors:vendor_id(*),
      contract_types:type_id(*),
      vendor_products_details(*, vendor_products:product_id(*)),
      users:user_id(organizations!users_organization_id_fkey(fiscal_year_start_month))
    `,
    )
    .in('user_id', userIds)
    .or('status.eq.active,status.eq.unconfirmed')
    .eq('status_id', 4);
  if (error) throw error;

  const contracts = (data ?? []) as unknown as Contract[];
  const ids = contracts.map((c) => c.id);

  // relationship_type must be selected: isHierarchyEdge tests `== null`, so a
  // row that never loaded the column reads as a hierarchy edge and the
  // builders' billing filter becomes a no-op here — the diff would then report
  // a spurious regression against production, which does filter.
  const { data: relationships, error: relError } = await supabase
    .from('contract_relationships')
    .select('parent_contract_id, child_contract_id, relationship_type')
    .in('child_contract_id', ids)
    .eq('active', true)
    .or('disabled.is.null,disabled.eq.false');
  if (relError) throw relError;
  const rels = relationships ?? [];
  const loaded = new Set(contracts.map((c) => c.id));
  // Mirror the app: a child invoice is only "linked" while its PARENT is in
  // the set. Archiving a parent orphans its invoices, and they start counting
  // standalone — which is exactly what happened to Moody's #3018/#3019.
  const linkedChildIds = new Set(
    rels
      .filter(
        (r) => r.parent_contract_id != null && loaded.has(r.parent_contract_id),
      )
      .map((r) => r.child_contract_id),
  );

  const kept = contracts.filter(
    (c) =>
      !(
        (c as { type_id?: number }).type_id === CONTRACT_TYPE_INVOICE &&
        linkedChildIds.has(c.id)
      ),
  );
  const fiscalMonth =
    (contracts[0] as any)?.users?.organizations?.fiscal_year_start_month || 1;
  const lineage = buildSpendLineageFromEnriched(
    enrichWithLineage(contracts, rels),
    rels,
  );
  return { kept, lineage, fiscalMonth };
}

// Per-year totals rather than a line per product row — a 16-product contract
// like WM #3102 is unreadable otherwise, and the year index is what drives the
// resolver anyway.
function feesRecorded(contract: Contract): string {
  const details = contract.vendor_products_details ?? [];
  if (!details.length) return '—';
  const byYear = new Map<number, number>();
  for (const detail of details as any[]) {
    const year = Number(detail.year ?? 1) || 1;
    byYear.set(year, (byYear.get(year) ?? 0) + Number(detail.fees ?? 0));
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(
      ([year, total]) =>
        `Yr ${year}: ${Math.round(total).toLocaleString('en-US')}`,
    )
    .join('\n');
}

function dateOf(value: any): string {
  return value?.[0]?.date ?? '—';
}

// Amortized is a monthly run-rate, so a single month reads more honestly than
// a fiscal-year sum. Actual stays FY: it is billing-date driven, and one month
// is either a billing month or a zero.
const MONTH_KEY = `${ASOF.getUTCFullYear()}-${String(ASOF.getUTCMonth() + 1).padStart(2, '0')}`;
const MONTH_LABEL = ASOF.toLocaleString('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function sumSeries(map: Map<string, number>): number {
  let total = 0;
  for (const value of map.values()) total += value;
  return total;
}

async function main() {
  const { kept, lineage, fiscalMonth } = await fetchContracts();
  const byId = new Map(kept.map((c) => [c.id, c]));
  const fiscalYearInfo = getFiscalYearInfo(fiscalMonth);

  const override = argValue('--contracts');
  const selected = override
    ? override
        .split(',')
        .map((s) => ({ id: Number(s.trim()), archetype: '(requested)' }))
    : ARCHETYPES;
  const rows = selected.filter((r) => byId.has(r.id));
  const missing = selected.filter((r) => !byId.has(r.id));
  if (missing.length) {
    console.log(
      `Not in this org's active set, skipped: ${missing.map((m) => m.id).join(', ')}`,
    );
  }

  const phById = new Map<number, PriceHistory>();
  for (const c of kept) {
    phById.set(
      c.id,
      generatePriceHistory(c, fiscalMonth, 'minimal', {
        hasFeeOverrides: hasFeeOverrides(c as any),
      }),
    );
  }

  const engineMonthly = (basis: 'amortized' | 'actual') =>
    querySpend(
      kept,
      {
        basis,
        source: 'expected',
        window: 'currentFY',
        granularity: 'month',
        groupBy: 'contract',
        currency: usd,
        fiscalConfig: { startMonth: fiscalMonth },
        asOf: ASOF,
      },
      lineage,
    ).items;

  // Mirrors enrichWithEngineSpend: Contract Term = start-dated commitments
  // ('annual' valuation, term-start recognition), not basis:'committed'.
  const engineCommitted = (window: 'currentFY' | 'nextFY') =>
    queryCommitments(
      kept,
      {
        valuation: 'annual',
        recognition: 'term-start',
        window,
        granularity: 'year',
        groupBy: 'contract',
        currency: usd,
        fiscalConfig: { startMonth: fiscalMonth },
        asOf: ASOF,
      },
      lineage,
    ).items;

  const seriesFor = (items: any[], id: number): Map<string, number> => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (Number(item.groupKey) !== id) continue;
      map.set(item.period, (map.get(item.period) ?? 0) + item.value);
    }
    return map;
  };

  const legacySeries = (
    extractor: typeof extractAmortizedData,
    id: number,
  ): Map<string, number> => {
    const map = new Map<string, number>();
    const result = extractor([phById.get(id)!], 'current', fiscalYearInfo);
    for (const point of result.data) {
      if (point.value !== 0)
        map.set(point.key, (map.get(point.key) ?? 0) + point.value);
    }
    return map;
  };

  const amortItems = engineMonthly('amortized');
  const actualItems = engineMonthly('actual');
  const currentItems = engineCommitted('currentFY');
  const nextItems = engineCommitted('nextFY');

  const book = new ExcelJS.Workbook();
  book.creator = 'postsig spend engine audit';

  // ---- Read me -------------------------------------------------------------
  const readme = book.addWorksheet('Read me');
  readme.columns = [{ width: 22 }, { width: 110 }];
  const note = (a: string, b: string) => readme.addRow([a, b]);
  readme.addRow(['Spend engine audit', '']).font = { bold: true, size: 14 };
  readme.addRow([]);
  note('Org', ORG_ID === BERENBERG_BANK ? 'Berenberg Bank' : ORG_ID);
  note('Generated', ASOF.toISOString());
  note('Fiscal year', `FY${CURRENT_FY}, starts month ${fiscalMonth}`);
  note(
    'Currency',
    'NATIVE fees on both sides — will NOT match the USD figures in the app. Compare ratios, not absolutes.',
  );
  readme.addRow([]);
  readme.addRow(['Reading the Comparison tab', '']).font = { bold: true };
  note(
    'One row per contract',
    'Each is a distinct CAUSE of a legacy/engine difference, not a full contract list. "Why it is here" names the cause.',
  );
  note(
    'DATA DEFECT rows',
    'These differences are NOT a design choice — they come from bad relationship data (a link recorded without its active flag, or an invoice orphaned when its parent was archived). Once the data is corrected these contracts drop out of the comparison entirely. Do not read them as intended behaviour.',
  );
  note(
    'Current / Projected',
    'Whole fiscal year. These are the two figures on the Spend Overview summary cards.',
  );
  note(
    `Amortized ${MONTH_LABEL}`,
    'A SINGLE month, not the fiscal year — amortized is a monthly run-rate, so one month is the honest unit.',
  );
  note(
    'Actual FY',
    'Whole fiscal year. Actual follows billing dates, so a single month is either a billing month or a zero.',
  );
  note(
    'Current x',
    'Engine divided by legacy. 1.00 = the two agree; 2.00 = the engine counts twice as much.',
  );
  readme.addRow([]);
  readme.addRow(['What the two systems do differently', '']).font = {
    bold: true,
  };
  note(
    'Current / Projected',
    'LEGACY = the fee of whichever cycle is active right now. ENGINE = every cycle that STARTS inside the fiscal year. For a 6-month contract that is 2 cycles, so the engine reads ~2x.',
  );
  note(
    'Both project',
    'Neither system stops at the recorded end date. An ended contract keeps projecting renewals until it is archived. Legacy projects one cycle-fee per year; the engine projects the real cycle count.',
  );
  note(
    'Invoice series',
    'Where each billing period is stored as its own contract, BOTH systems count every one of them, and the engine multiplies each by its cycle count. This is the largest single driver of the difference.',
  );
  note('Amortized', 'Fee spread evenly across the months of the term.');
  note(
    'Actual cost',
    'Fee placed on the months it is billed, per the billing frequency.',
  );
  note(
    'Leading gap',
    'Legacy shows $0 for fiscal-year months before the current cycle began; the engine fills them from the prior cycle.',
  );
  note(
    'Annual increase',
    'Legacy does not compound annual_increase into the current projected cycle; the engine does.',
  );

  // ---- Comparison ----------------------------------------------------------
  const cmp = book.addWorksheet('Comparison');
  cmp.columns = [
    { header: 'Contract', key: 'id', width: 10 },
    { header: 'Vendor', key: 'vendor', width: 26 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Why it is here', key: 'archetype', width: 52 },
    { header: 'Renewal type', key: 'renewal', width: 13 },
    { header: 'Renewal period', key: 'period', width: 14 },
    { header: 'Sub term', key: 'subTerm', width: 10 },
    { header: 'Term start', key: 'start', width: 12 },
    { header: 'Term end', key: 'end', width: 12 },
    { header: 'Fees recorded', key: 'fees', width: 18 },
    { header: 'Legacy current FY', key: 'lc', width: 17 },
    { header: 'Engine current FY', key: 'ec', width: 17 },
    { header: 'Current x', key: 'cx', width: 10 },
    { header: 'Legacy projected', key: 'lp', width: 17 },
    { header: 'Engine projected', key: 'ep', width: 17 },
    { header: `Legacy amortized ${MONTH_LABEL}`, key: 'la', width: 21 },
    { header: `Engine amortized ${MONTH_LABEL}`, key: 'ea', width: 21 },
    { header: 'Legacy actual FY', key: 'lac', width: 17 },
    { header: 'Engine actual FY', key: 'eac', width: 17 },
  ];
  cmp.getRow(1).font = { bold: true };
  cmp.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

  for (const { id, archetype } of rows) {
    const c = byId.get(id)!;
    const budget = extractBudgetFromPriceHistory(phById.get(id)! as any) as any;
    const legacyCurrent =
      budget?.effectiveCurrentUSD ?? budget?.currentUSD ?? 0;
    const legacyProjected =
      budget?.effectiveProjectedUSD ?? budget?.projectedUSD ?? 0;
    const engineCurrent = sumSeries(seriesFor(currentItems, id));
    const engineProjected = sumSeries(seriesFor(nextItems, id));

    cmp.addRow({
      id,
      vendor: (c as any).vendors?.name ?? '—',
      type: (c as any).contract_types?.name ?? '—',
      archetype,
      renewal: c.renewal_type ?? 'null',
      period: c.renewal_period ?? '—',
      subTerm: c.subscription_term ?? '—',
      start: dateOf(c.term_start_date),
      end: dateOf(c.term_end_date),
      fees: feesRecorded(c),
      lc: legacyCurrent,
      ec: engineCurrent,
      cx:
        legacyCurrent > 0
          ? Number((engineCurrent / legacyCurrent).toFixed(2))
          : null,
      lp: legacyProjected,
      ep: engineProjected,
      la: legacySeries(extractAmortizedData, id).get(MONTH_KEY) ?? 0,
      ea: seriesFor(amortItems, id).get(MONTH_KEY) ?? 0,
      lac: sumSeries(legacySeries(extractActualCostData, id)),
      eac: sumSeries(seriesFor(actualItems, id)),
    });
  }
  ['K', 'L', 'N', 'O', 'P', 'Q', 'R', 'S'].forEach((col) => {
    cmp.getColumn(col).numFmt = '#,##0';
  });
  cmp.getColumn('J').alignment = { wrapText: true, vertical: 'top' };
  cmp.getColumn('D').alignment = { wrapText: true, vertical: 'top' };

  mkdirSync(dirname(OUT), { recursive: true });
  await book.xlsx.writeFile(OUT);
  console.log(`\nWrote ${OUT}`);
  console.log(
    `${rows.length} contracts · sheets: ${book.worksheets.map((w) => w.name).join(', ')}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
