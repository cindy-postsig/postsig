/**
 * Shadow diff for the price-history port: the RETIRED legacy rollup
 * (max-mode generation + truncateSupersededAtChildStart +
 * distributeFeeAcrossYears, materialized from git history into
 * scripts/.legacy-price-history-summary.ts) vs the engine rollup's
 * Contract Term view, over a REAL org, read-only.
 *
 * Both sides see the page's inclusion (active + unconfirmed + archived,
 * invoices dropped inside the builders) and NATIVE fees. ACV is not compared
 * (legacy computes it from its own generation; the engine reads the cached
 * enrichment scalar this script does not build). Expected delta buckets:
 * decision-#9 per-cycle repeat, mid-cycle amendment truncate+day-scale,
 * cancel-by recognition shifting renewal years (psk-1844 Contract Term),
 * fiscal-vs-calendar labels (identical for January orgs).
 *
 * Regenerate the legacy oracle after any git history change:
 *   git show <sha>:app/lib/budget/priceHistorySummary.ts > scripts/.legacy-price-history-summary.ts
 *   (then relativize its '@/' imports)
 *
 * Usage:
 *   npx tsx scripts/price-history-shadow-diff.ts                 # Berenberg
 *   ORG_ID=<uuid> npx tsx scripts/price-history-shadow-diff.ts   # other org
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import type { Database } from '../database.types';
import { enrichWithLineage } from '../lib/v2/core/lineage';
import type { ContractWithPricing } from '../lib/v2/core/types';
import { buildVendorPriceSummaries as legacyBuild } from './.legacy-price-history-summary';
import { buildVendorPriceSummaries as engineBuild } from '../lib/v2/reports/price-history/summary';

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

type Matrix = Map<string, number>;

interface SummaryShape {
  vendors: Array<{
    vendorName: string;
    periods: Array<{ label: string; fees: number }>;
    products: Array<{
      productName: string;
      contracts: Array<{
        contractId: number;
        periods: Array<{ label: string; fees: number }>;
      }>;
    }>;
  }>;
}

function contractMatrix(summary: SummaryShape): Map<string, Matrix> {
  const out = new Map<string, Matrix>();
  for (const v of summary.vendors) {
    for (const prod of v.products) {
      for (const c of prod.contracts) {
        const key = `${v.vendorName} #${c.contractId} ${prod.productName}`;
        const m = out.get(key) ?? new Map<string, number>();
        for (const p of c.periods)
          m.set(p.label, (m.get(p.label) ?? 0) + p.fees);
        out.set(key, m);
      }
    }
  }
  return out;
}

// Merge by display name: both builders key vendors by id with a name
// fallback, so one name can carry several vendor entries — sum them rather
// than letting the last overwrite the rest.
function vendorMatrix(summary: {
  vendors: Array<{
    vendorName: string;
    periods: Array<{ label: string; fees: number }>;
  }>;
}): Map<string, Matrix> {
  const out = new Map<string, Matrix>();
  for (const v of summary.vendors) {
    const m = out.get(v.vendorName) ?? new Map<string, number>();
    for (const p of v.periods) m.set(p.label, (m.get(p.label) ?? 0) + p.fees);
    out.set(v.vendorName, m);
  }
  return out;
}

async function main(): Promise<void> {
  const { data: org } = await supabase
    .from('organizations')
    .select('name, fiscal_year_start_month')
    .eq('id', ORG_ID)
    .single();
  const fiscalMonth = org?.fiscal_year_start_month ?? 1;
  const targetYear = ASOF.getFullYear() + 1;
  console.log(
    `\n=== Price-history shadow diff — ${org?.name} (FY start month ${fiscalMonth}) — asOf ${ASOF.toISOString().slice(0, 10)}, targetYear ${targetYear} ===`,
  );

  const { data: orgUsers } = await supabase
    .from('users')
    .select('id')
    .eq('organization_id', ORG_ID);
  const userIds = (orgUsers ?? []).map((u) => u.id);

  const { data } = await supabase
    .from('contracts')
    .select(
      '*, vendors:vendor_id(*), contract_types:type_id(*), vendor_products_details(*, vendor_products:product_id(*))',
    )
    .in('user_id', userIds)
    .in('status', ['active', 'unconfirmed', 'inactive'])
    .eq('status_id', 4);
  const contracts = data ?? [];
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

  const enriched = enrichWithLineage(
    contracts,
    rels,
  ) as unknown as ContractWithPricing[];
  console.log(
    `contracts: ${contracts.length} (active+unconfirmed+archived; invoices dropped inside both builders), native fees both sides`,
  );

  const legacySummary = legacyBuild(enriched, fiscalMonth, targetYear);
  const engineSummary = engineBuild(
    enriched,
    fiscalMonth,
    targetYear,
    rels,
    ASOF,
    'committed',
    undefined,
    // Shadow diff runs on native fees both sides; no FX to reconcile.
    { mode: 'native' },
  );
  const legacy = vendorMatrix(legacySummary);
  const engine = vendorMatrix(engineSummary);
  const legacyContracts = contractMatrix(legacySummary as SummaryShape);
  const engineContracts = contractMatrix(engineSummary as SummaryShape);

  const names = [...new Set([...legacy.keys(), ...engine.keys()])].sort();
  let movedVendors = 0;
  for (const name of names) {
    const l = legacy.get(name) ?? new Map();
    const e = engine.get(name) ?? new Map();
    const years = [...new Set([...l.keys(), ...e.keys()])].sort();
    const movedYears = years.filter(
      (y) => Math.abs((e.get(y) ?? 0) - (l.get(y) ?? 0)) >= 1,
    );
    if (movedYears.length === 0) continue;
    movedVendors++;
    console.log(`\n${name}`);
    for (const y of movedYears) {
      console.log(
        `  ${y}  legacy ${pad(money(l.get(y) ?? 0), 12)} engine ${pad(money(e.get(y) ?? 0), 12)}`,
      );
    }
    const rowKeys = [
      ...new Set([...legacyContracts.keys(), ...engineContracts.keys()]),
    ]
      .filter((k) => k.startsWith(`${name} #`))
      .sort();
    for (const key of rowKeys) {
      const lc = legacyContracts.get(key) ?? new Map();
      const ec = engineContracts.get(key) ?? new Map();
      const rowYears = [...new Set([...lc.keys(), ...ec.keys()])].sort();
      const line = rowYears
        .map((y) => {
          const lv = lc.get(y) ?? 0;
          const ev = ec.get(y) ?? 0;
          return Math.abs(ev - lv) < 1
            ? `${y}:${money(lv)}`
            : `${y}:${money(lv)}→${money(ev)}`;
        })
        .join('  ');
      console.log(`    ${pad(key.slice(name.length + 1), 40)} ${line}`);
    }
  }
  console.log(
    `\nvendors moved: ${movedVendors}/${names.length}. Every move must map to a recorded bucket (decision #9, straddle truncation, cancel-by recognition); anything else is a port blocker.\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
