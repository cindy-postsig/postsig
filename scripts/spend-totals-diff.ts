/**
 * Why do the budget SummaryCards move? (read-only)
 *
 * Compares, per contract, the legacy per-contract budget scalar that
 * getUSDValue reads (generatePriceHistory('minimal') ->
 * extractBudgetFromPriceHistory -> effectiveCurrentUSD) against the engine's
 * FY-windowed committed value that enrichWithEngineSpend now stamps.
 *
 * Fees are NATIVE here (no convertAllProductsToUSD), so absolute totals will
 * not match the in-app USD cards — the point is the per-contract MULTIPLIER
 * and which contracts drive the gap.
 *
 * Usage:
 *   npx tsx scripts/spend-totals-diff.ts
 *   ORG_ID=<uuid> npx tsx scripts/spend-totals-diff.ts
 *   npx tsx scripts/spend-totals-diff.ts --limit 40
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import type { Database } from '../database.types';
import type { Contract } from '../app/lib/budget/types';
import {
  querySpend,
  queryCommitments,
  buildSpendLineageFromEnriched,
} from '../lib/v2/spend';
import type { SpendLineage } from '../lib/v2/spend';
import { EMPTY_LINEAGE, getTermLength } from '../lib/v2/spend/resolver';
import { enrichWithLineage } from '../lib/v2/core/lineage';
import { generatePriceHistory } from '../app/lib/budget/priceHistoryCalculator';
import { extractBudgetFromPriceHistory } from '../app/lib/budget/priceHistoryProducts';

dotenv.config({ path: '.env.prod' });

const BERENBERG_BANK = '4d2bdb8f-63d9-43c6-9825-bb229205d70b';
const CONTRACT_TYPE_INVOICE = 6;
const ORG_ID = process.env.ORG_ID || BERENBERG_BANK;
const LIMIT = Number(process.argv[process.argv.indexOf('--limit') + 1] || 25);

const ASOF = new Date();
const CURRENT_FY = ASOF.getUTCFullYear();

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const usd = { mode: 'preconverted-usd' } as const;

function money(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padEnd(width);
}

function lpad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padStart(width);
}

async function fetchContracts(): Promise<{
  kept: Contract[];
  lineage: SpendLineage;
  fiscalStart: number;
}> {
  const { data: orgUsers, error: usersError } = await supabase
    .from('users')
    .select('id')
    .eq('organization_id', ORG_ID);
  if (usersError) throw usersError;
  const userIds = (orgUsers ?? []).map((u) => u.id);

  const windowStart = `${CURRENT_FY - 2}-01-01`;
  const windowEnd = `${CURRENT_FY + 2}-12-31`;
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
    .or(
      [
        'renewal_type.is.null',
        'renewal_type.eq.Auto',
        'renewal_type.eq.Manual',
        `and(renewal_type.eq.One-Time,or(term_start_date.is.null,and(term_start_date->0->>date.gte.${windowStart},term_start_date->0->>date.lte.${windowEnd}),and(term_end_date->0->>date.gte.${windowStart},term_end_date->0->>date.lte.${windowEnd})))`,
      ].join(','),
    )
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
  const childIds = new Set(rels.map((r) => r.child_contract_id));

  const kept = contracts.filter(
    (c) =>
      !(
        (c as { type_id?: number }).type_id === CONTRACT_TYPE_INVOICE &&
        childIds.has(c.id)
      ),
  );

  const fiscalStart =
    (contracts[0] as any)?.users?.organizations?.fiscal_year_start_month || 1;

  console.log(
    `Contracts: ${contracts.length} fetched, ${contracts.length - kept.length} linked child invoices dropped, ${kept.length} in play`,
  );
  console.log(`Fiscal year start month: ${fiscalStart}\n`);

  const lineage = buildSpendLineageFromEnriched(
    enrichWithLineage(contracts, rels),
    rels,
  );
  return { kept, lineage, fiscalStart };
}

function legacyCurrent(contract: Contract, fiscalStart: number): number {
  try {
    const ph = generatePriceHistory(contract, fiscalStart, 'minimal', {});
    const budget = extractBudgetFromPriceHistory(ph as any) as any;
    return budget?.effectiveCurrentUSD ?? budget?.currentUSD ?? 0;
  } catch {
    return 0;
  }
}

function shapeHint(contract: Contract): string {
  const start = contract.term_start_date?.[0]?.date;
  const end = contract.term_end_date?.[0]?.date;
  const span = start ? getTermLength(start, end) : 0;
  const details = contract.vendor_products_details ?? [];
  const maxYear = details.length
    ? Math.max(...details.map((p) => p.year || 1))
    : 1;
  const bits: string[] = [];
  if (span > 12) bits.push(`span:${span}mo`);
  if (maxYear > 1) bits.push(`yr1-${maxYear}`);
  if (contract.subscription_term)
    bits.push(`term:${contract.subscription_term}`);
  if ((contract as any).status === 'unconfirmed') bits.push('UNCONFIRMED');
  if (end && new Date(end) < ASOF) bits.push('ENDED');
  if (contract.renewal_period && contract.renewal_period !== 12)
    bits.push(`cycle:${contract.renewal_period}mo`);
  return bits.join(' ') || '—';
}

async function main() {
  const { kept, lineage, fiscalStart } = await fetchContracts();

  const basis = (
    process.argv.includes('--amortized') ? 'amortized' : 'committed'
  ) as 'amortized' | 'committed';
  console.log(`Engine basis: ${basis}\n`);

  const shared = {
    window: 'currentFY' as const,
    granularity: 'year' as const,
    groupBy: 'contract' as const,
    currency: usd,
    fiscalConfig: { startMonth: fiscalStart },
    asOf: ASOF,
  };
  // 'committed' mirrors enrichWithEngineSpend: start-dated commitments
  // ('annual' valuation, term-start recognition), not basis:'committed'.
  const engineItems =
    basis === 'amortized'
      ? querySpend(
          kept,
          {
            basis,
            proration: 'monthly' as const,
            source: 'expected',
            ...shared,
          },
          lineage,
        ).items
      : queryCommitments(
          kept,
          { valuation: 'annual', recognition: 'term-start', ...shared },
          lineage,
        ).items;

  const engineByContract = new Map<number, number>();
  for (const item of engineItems) {
    const id = Number(item.groupKey);
    engineByContract.set(id, (engineByContract.get(id) ?? 0) + item.value);
  }

  const rows = kept.map((contract) => {
    const engine = engineByContract.get(contract.id) ?? 0;
    const legacy = legacyCurrent(contract, fiscalStart);
    return {
      id: contract.id,
      vendor: (contract as any).vendors?.name ?? '—',
      legacy,
      engine,
      delta: engine - legacy,
      ratio: legacy > 0 ? engine / legacy : engine > 0 ? Infinity : 1,
      hint: shapeHint(contract),
    };
  });

  const legacyTotal = rows.reduce((s, r) => s + r.legacy, 0);
  const engineTotal = rows.reduce((s, r) => s + r.engine, 0);

  console.log(
    `TOTAL (native fees)   legacy ${money(legacyTotal)}   engine ${money(engineTotal)}   delta ${money(engineTotal - legacyTotal)}  (${((engineTotal / (legacyTotal || 1) - 1) * 100).toFixed(1)}%)\n`,
  );

  const movers = rows
    .filter((r) => Math.abs(r.delta) > 1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  console.log(
    `${movers.length} contracts move. Top ${LIMIT} by absolute delta:\n`,
  );
  console.log(
    `${pad('id', 7)}${pad('vendor', 26)}${lpad('legacy', 13)}${lpad('engine', 13)}${lpad('delta', 13)}${lpad('x', 7)}  shape`,
  );
  for (const r of movers.slice(0, LIMIT)) {
    const x = r.ratio === Infinity ? 'NEW' : `${r.ratio.toFixed(2)}`;
    console.log(
      `${pad(String(r.id), 7)}${pad(r.vendor, 26)}${lpad(money(r.legacy), 13)}${lpad(money(r.engine), 13)}${lpad(money(r.delta), 13)}${lpad(x, 7)}  ${r.hint}`,
    );
  }

  const fyStart = new Date(Date.UTC(CURRENT_FY, fiscalStart - 1, 1));
  const endedBefore = kept.filter((c) => {
    const end = c.term_end_date?.[0]?.date;
    return end ? new Date(end) < fyStart : false;
  });
  const endedEngine = endedBefore.reduce(
    (s, c) => s + (engineByContract.get(c.id) ?? 0),
    0,
  );
  const endedInvoices = endedBefore.filter(
    (c) => (c as any).type_id === CONTRACT_TYPE_INVOICE,
  );
  const endedInvoiceEngine = endedInvoices.reduce(
    (s, c) => s + (engineByContract.get(c.id) ?? 0),
    0,
  );
  console.log(
    `\nContracts whose term ENDED before FY${CURRENT_FY} began, yet still contribute:` +
      `\n  all types : ${endedBefore.length} contracts, ${money(endedEngine)}  (${((endedEngine / (engineTotal || 1)) * 100).toFixed(1)}% of engine total)` +
      `\n  Invoices  : ${endedInvoices.length} contracts, ${money(endedInvoiceEngine)}`,
  );

  const newMoney = movers.filter((r) => r.legacy === 0 && r.engine > 0);
  const multiplied = movers.filter((r) => r.legacy > 0 && r.ratio >= 1.5);
  console.log(
    `\nBreakdown of the gap:` +
      `\n  legacy 0 -> engine >0 : ${newMoney.length} contracts, ${money(newMoney.reduce((s, r) => s + r.delta, 0))}` +
      `\n  multiplied >=1.5x     : ${multiplied.length} contracts, ${money(multiplied.reduce((s, r) => s + r.delta, 0))}` +
      `\n  everything else       : ${money(engineTotal - legacyTotal - newMoney.reduce((s, r) => s + r.delta, 0) - multiplied.reduce((s, r) => s + r.delta, 0))}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
