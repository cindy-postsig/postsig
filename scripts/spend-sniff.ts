/**
 * Spend-engine sniff test over a REAL org's contracts (read-only).
 *
 * Runs querySpend (shadow engine) against the org's live contract set and
 * prints per-vendor fiscal-year numbers, the contracts hitting decision-#9
 * shapes (annual fee over a multi-year span), and an inferred-segment
 * histogram — so real numbers/dates/terms can be eyeballed without trusting
 * legacy as the oracle.
 *
 * NOTE: fees are NATIVE currency (no convertAllProductsToUSD here) — totals
 * are labeled per currency and a mixed-currency vendor is flagged. The in-app
 * numbers are USD-converted, so compare cadence and multipliers, not FX.
 *
 * Usage:
 *   npx tsx scripts/spend-sniff.ts                 # Berenberg Bank
 *   ORG_ID=<uuid> npx tsx scripts/spend-sniff.ts   # another org
 *   npx tsx scripts/spend-sniff.ts --contract 123  # dump one contract's segments
 *
 * Real lineage (cutoffs + parent terms) is built by default; pass
 * --no-lineage for the shadow-era per-contract-independent numbers.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import type { Database } from '../database.types';
import type { Contract } from '../app/lib/budget/types';
import { querySpend, buildSpendLineageFromEnriched } from '../lib/v2/spend';
import type { SpendBasis, FeeSegment, SpendLineage } from '../lib/v2/spend';
import {
  resolveFeeSegments,
  getTermLength,
  lineageFor,
  EMPTY_LINEAGE,
} from '../lib/v2/spend/resolver';
import { enrichWithLineage } from '../lib/v2/core/lineage';

dotenv.config({ path: '.env.prod' });

const BERENBERG_BANK = '4d2bdb8f-63d9-43c6-9825-bb229205d70b';
const CONTRACT_TYPE_INVOICE = 6;
const ORG_ID = process.env.ORG_ID || BERENBERG_BANK;

const ASOF = new Date();
const CURRENT_FY = ASOF.getUTCFullYear();
const HORIZON_START = new Date(Date.UTC(CURRENT_FY - 10, 0, 1));
const HORIZON_END = new Date(Date.UTC(CURRENT_FY + 2, 0, 1));

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const usd = { mode: 'preconverted-usd' } as const;

function money(value: number | undefined): string {
  if (!value) return '—';
  return Math.round(value).toLocaleString('en-US');
}

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padEnd(width);
}

async function fetchContracts(): Promise<{
  kept: Contract[];
  lineage: SpendLineage;
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
  console.log(
    `Contracts: ${contracts.length} fetched, ${contracts.length - kept.length} linked child invoices dropped, ${kept.length} in play\n`,
  );

  // Real lineage over the FULL fetched set (hierarchy edges need both
  // endpoints loaded); the engine still only sees the kept contracts.
  // --no-lineage shows the shadow-era per-contract-independent numbers.
  const lineage = process.argv.includes('--no-lineage')
    ? EMPTY_LINEAGE
    : buildSpendLineageFromEnriched(enrichWithLineage(contracts, rels), rels);
  return { kept, lineage };
}

function maxYearOf(contract: Contract): number {
  const details = contract.vendor_products_details ?? [];
  if (details.length === 0) return 1;
  return Math.max(...details.map((p) => p.year || 1));
}

function spanMonthsOf(contract: Contract): number {
  const start = contract.term_start_date?.[0]?.date;
  const end = contract.term_end_date?.[0]?.date;
  if (!start) return 0;
  return getTermLength(start, end);
}

function isDecision9Shape(contract: Contract): boolean {
  if (maxYearOf(contract) !== 1) return false;
  const span = spanMonthsOf(contract);
  const sub = contract.subscription_term;
  const initialRepeats =
    span > 12 &&
    (span % 12 === 0 || Boolean(sub && sub % 12 === 0 && sub < span));
  const renewalLength = contract.renewal_period || sub || span;
  const renewalSplits = renewalLength > 12 && renewalLength % 12 === 0;
  return initialRepeats || renewalSplits;
}

function dumpContract(contract: Contract, lineage: SpendLineage): void {
  const vendor = (contract as { vendors?: { name?: string } }).vendors?.name;
  console.log(
    `\n#${contract.id} ${vendor ?? '?'} — ${contract.currency ?? 'usd'} | term ${contract.term_start_date?.[0]?.date} → ${contract.term_end_date?.[0]?.date} | sub_term ${contract.subscription_term ?? '—'} | renewal_period ${contract.renewal_period ?? '—'} | ${contract.renewal_type ?? 'Auto'} | billing ${contract.billing_frequency ?? '—'} | status ${contract.status}`,
  );
  for (const p of contract.vendor_products_details ?? []) {
    console.log(
      `    product ${p.product_id} year ${p.year ?? 1}: ${money(p.fees ?? 0)}`,
    );
  }
  const segments = resolveFeeSegments(
    contract,
    lineageFor(lineage, contract.id),
    {
      asOf: ASOF,
      horizonStart: HORIZON_START,
      horizonEnd: HORIZON_END,
      currency: usd,
    },
  );
  for (const s of segments) {
    console.log(
      `    [${s.from} → ${s.to})  ${pad(money(s.fee), 12)} ${pad(s.source, 20)} ${s.confidence}${s.reason ? `  (${s.reason})` : ''}`,
    );
  }
}

async function main(): Promise<void> {
  const { data: org } = await supabase
    .from('organizations')
    .select('name, fiscal_year_start_month')
    .eq('id', ORG_ID)
    .single();
  console.log(
    `\n=== Spend sniff — ${org?.name} (FY start month ${org?.fiscal_year_start_month ?? 1}) — asOf ${ASOF.toISOString().slice(0, 10)} ===\n`,
  );
  const fiscalConfig = { startMonth: org?.fiscal_year_start_month ?? 1 };

  const { kept: contracts, lineage } = await fetchContracts();

  const contractArg = process.argv.indexOf('--contract');
  if (contractArg !== -1) {
    const id = Number(process.argv[contractArg + 1]);
    const contract = contracts.find((c) => c.id === id);
    if (!contract) throw new Error(`contract ${id} not in the filtered set`);
    dumpContract(contract, lineage);
    return;
  }

  if (process.argv.includes('--by-contract')) {
    const names = new Map(
      contracts.map((c) => [
        String(c.id),
        `${(c as { vendors?: { name?: string } }).vendors?.name} #${c.id} (${(c.currency || 'usd').toLowerCase()})`,
      ]),
    );
    const result = querySpend(
      contracts,
      {
        basis: 'amortized',
        source: 'expected',
        window: { fiscalYear: CURRENT_FY },
        granularity: 'year',
        groupBy: 'contract',
        currency: usd,
        fiscalConfig,
        asOf: ASOF,
      },
      lineage,
    );
    console.log(`Per-contract amortized FY${CURRENT_FY} (native ccy):\n`);
    for (const item of [...result.items].sort((a, b) => b.value - a.value)) {
      console.log(
        `${money(item.value).padStart(12)}  ${names.get(item.groupKey) ?? item.groupKey}`,
      );
    }
    return;
  }

  const currencies = new Map<string, number>();
  for (const c of contracts) {
    const ccy = (c.currency || 'usd').toLowerCase();
    currencies.set(ccy, (currencies.get(ccy) ?? 0) + 1);
  }
  console.log(
    `Currency mix (NATIVE fees, no FX): ${[...currencies.entries()].map(([c, n]) => `${c}:${n}`).join('  ')}\n`,
  );

  const vendorNames = new Map<number, string>();
  const vendorCurrencies = new Map<number, Set<string>>();
  for (const c of contracts) {
    const v = (c as { vendors?: { name?: string } }).vendors?.name;
    if (c.vendor_id != null && v) vendorNames.set(c.vendor_id, v);
    if (c.vendor_id != null) {
      const set = vendorCurrencies.get(c.vendor_id) ?? new Set<string>();
      set.add((c.currency || 'usd').toLowerCase());
      vendorCurrencies.set(c.vendor_id, set);
    }
  }

  const bases: SpendBasis[] = ['committed', 'amortized', 'actual'];
  const years = [CURRENT_FY - 1, CURRENT_FY, CURRENT_FY + 1];
  const byVendor = new Map<string, Map<string, number>>();
  for (const basis of bases) {
    for (const fy of years) {
      const result = querySpend(
        contracts,
        {
          basis,
          source: 'expected',
          window: { fiscalYear: fy },
          granularity: 'year',
          groupBy: 'vendor',
          currency: usd,
          fiscalConfig,
          asOf: ASOF,
        },
        lineage,
      );
      for (const item of result.items) {
        const row = byVendor.get(item.groupKey) ?? new Map<string, number>();
        row.set(`${basis}:${fy}`, item.value);
        byVendor.set(item.groupKey, row);
      }
    }
  }

  const sorted = [...byVendor.entries()].sort(
    (a, b) =>
      (b[1].get(`amortized:${CURRENT_FY}`) ?? 0) -
      (a[1].get(`amortized:${CURRENT_FY}`) ?? 0),
  );

  console.log(
    `Per-vendor (native ccy) — FY${CURRENT_FY} committed | amortized | actual, then amortized FY${CURRENT_FY - 1} / FY${CURRENT_FY + 1}:\n`,
  );
  console.log(
    `${pad('vendor', 32)} ${pad('ccy', 8)} ${pad(`com${CURRENT_FY}`, 12)} ${pad(`amo${CURRENT_FY}`, 12)} ${pad(`act${CURRENT_FY}`, 12)} ${pad(`amo${CURRENT_FY - 1}`, 12)} ${pad(`amo${CURRENT_FY + 1}`, 12)}`,
  );
  for (const [vendorKey, row] of sorted) {
    const vendorId = Number(vendorKey);
    const ccys = [...(vendorCurrencies.get(vendorId) ?? [])];
    const label =
      ccys.length > 1 ? `MIXED(${ccys.join('+')})` : (ccys[0] ?? '?');
    console.log(
      `${pad(vendorNames.get(vendorId) ?? vendorKey, 32)} ${pad(label, 8)} ${pad(money(row.get(`committed:${CURRENT_FY}`)), 12)} ${pad(money(row.get(`amortized:${CURRENT_FY}`)), 12)} ${pad(money(row.get(`actual:${CURRENT_FY}`)), 12)} ${pad(money(row.get(`amortized:${CURRENT_FY - 1}`)), 12)} ${pad(money(row.get(`amortized:${CURRENT_FY + 1}`)), 12)}`,
    );
  }

  console.log(
    '\n\nPer-contract terms (eyeball against the real agreements):\n',
  );
  console.log(
    `${pad('id', 6)} ${pad('vendor', 28)} ${pad('doc', 5)} ${pad('ccy', 4)} ${pad('term', 24)} ${pad('sub', 4)} ${pad('renw', 5)} ${pad('type', 9)} ${pad('billing', 10)} ${pad('yr-fees', 30)}`,
  );
  const byVendorName = [...contracts].sort((a, b) => {
    const av = (a as { vendors?: { name?: string } }).vendors?.name ?? '';
    const bv = (b as { vendors?: { name?: string } }).vendors?.name ?? '';
    return av.localeCompare(bv) || a.id - b.id;
  });
  for (const c of byVendorName) {
    const vendor = (c as { vendors?: { name?: string } }).vendors?.name ?? '?';
    const docType =
      (c as { contract_types?: { abbreviation?: string; name?: string } })
        .contract_types?.abbreviation ??
      (c as { contract_types?: { name?: string } }).contract_types?.name ??
      '?';
    const fees = (c.vendor_products_details ?? [])
      .map((p) => `y${p.year ?? 1}:${money(p.fees ?? 0)}`)
      .join(' ');
    console.log(
      `${pad(String(c.id), 6)} ${pad(vendor, 28)} ${pad(docType, 5)} ${pad((c.currency || 'usd').toLowerCase(), 4)} ${pad(`${c.term_start_date?.[0]?.date ?? '?'}→${c.term_end_date?.[0]?.date ?? '?'}`, 24)} ${pad(String(c.subscription_term ?? '—'), 4)} ${pad(String(c.renewal_period ?? '—'), 5)} ${pad(c.renewal_type ?? 'Auto', 9)} ${pad(c.billing_frequency ?? '—', 10)} ${pad(fees, 30)}`,
    );
  }

  const decision9 = contracts.filter(isDecision9Shape);
  console.log(
    `\n\nDecision-#9 shapes (single-year fee over a multi-year span — the numbers that CHANGED): ${decision9.length} contracts`,
  );
  for (const c of decision9) {
    dumpContract(c, lineage);
  }

  const reasonCounts = new Map<string, Set<number>>();
  for (const c of contracts) {
    const segments = resolveFeeSegments(c, lineageFor(lineage, c.id), {
      asOf: ASOF,
      horizonStart: HORIZON_START,
      horizonEnd: HORIZON_END,
      currency: usd,
    });
    for (const s of segments) {
      if (s.confidence === 'inferred' && s.reason) {
        const set = reasonCounts.get(s.reason) ?? new Set<number>();
        set.add(c.id);
        reasonCounts.set(s.reason, set);
      }
    }
  }
  console.log(
    '\n\nInferred-segment reasons (mini integrity report — contracts per heuristic):',
  );
  for (const [reason, ids] of [...reasonCounts.entries()].sort(
    (a, b) => b[1].size - a[1].size,
  )) {
    console.log(
      `  ${ids.size.toString().padStart(4)}  ${reason}  [e.g. #${[...ids].slice(0, 5).join(', #')}]`,
    );
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
