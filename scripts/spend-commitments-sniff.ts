import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import type { Database } from '../database.types';
import type { Contract } from '../app/lib/budget/types';
import { enrichWithLineage } from '../lib/v2/core/lineage';
import { filterForAggregation } from '../lib/v2/core/filters';
import {
  queryCommitments,
  buildSpendLineageFromEnriched,
} from '../lib/v2/spend';

dotenv.config({ path: '.env.prod' });

const BERENBERG_BANK = '4d2bdb8f-63d9-43c6-9825-bb229205d70b';
const ORG_ID = process.env.ORG_ID || BERENBERG_BANK;
const ASOF = new Date();
const usd = { mode: 'preconverted-usd' } as const;
const NOTABLE = [3040, 3038, 3000, 111, 3047, 3017];

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function money(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

async function main() {
  const { data: org } = await supabase
    .from('organizations')
    .select('name, fiscal_year_start_month')
    .eq('id', ORG_ID)
    .single();
  const fiscalConfig = { startMonth: org?.fiscal_year_start_month ?? 1 };

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

  console.log(
    `\n=== Term arrays — notable multi-term contracts (${org?.name}) ===`,
  );
  for (const c of contracts.filter((c) => NOTABLE.includes(c.id as number))) {
    const row = c as unknown as {
      id: number;
      vendors?: { name?: string };
      term_start_date?: Array<{ date: string }>;
      term_end_date?: Array<{ date: string }>;
      cancel_by_date?: number | null;
      renewal_period?: number | null;
    };
    console.log(`#${row.id} ${row.vendors?.name}`);
    console.log(
      `  starts: ${JSON.stringify(row.term_start_date)}\n  ends:   ${JSON.stringify(row.term_end_date)}`,
    );
    console.log(
      `  cancel_by_date(days): ${row.cancel_by_date} renewal_period: ${row.renewal_period}`,
    );
  }

  const enriched = enrichWithLineage(contracts, rels);
  const keptById = new Map(
    filterForAggregation(enriched).map((ec) => [ec.id, ec]),
  );
  const kept = contracts.filter((c) => keptById.has(c.id));
  const lineage = buildSpendLineageFromEnriched(enriched, rels);
  const vendorOf = (id: string): string => {
    const c = contracts.find((c) => String(c.id) === id);
    return (c as { vendors?: { name?: string } })?.vendors?.name ?? '?';
  };

  const { items } = queryCommitments(
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
  );

  const news = items.filter((i) => i.kind === 'new');
  const renewals = items.filter((i) => i.kind === 'renewal');
  console.log(
    `\n=== queryCommitments — currentFY monthly (${kept.length} contracts) ===`,
  );
  console.log(
    `new: ${news.length} events / $${money(news.reduce((s, i) => s + i.value, 0))}  |  renewal: ${renewals.length} events / $${money(renewals.reduce((s, i) => s + i.value, 0))}`,
  );

  for (const kind of ['new', 'renewal'] as const) {
    console.log(`\n-- ${kind} events (sorted by period) --`);
    const sorted = items
      .filter((i) => i.kind === kind)
      .sort((a, b) => a.period.localeCompare(b.period) || b.value - a.value);
    for (const item of sorted) {
      console.log(
        `  ${item.period}  #${item.groupKey.padEnd(6)} ${vendorOf(item.groupKey).slice(0, 28).padEnd(28)} $${money(item.value)}`,
      );
    }
  }
}
main();
