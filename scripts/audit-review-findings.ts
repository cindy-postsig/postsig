/**
 * Read-only audit for the 2026-08-03 product-review findings (psk-1850).
 * Dumps raw term/fee/date data for the contracts product flagged:
 * Euronext #2948 (FX vintage), JPM #3040/#3038, S&P #3024, ICE #3047.
 *
 *   npx tsx --env-file=.env.prod scripts/audit-review-findings.ts
 */
/* eslint-disable no-console */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/database.types';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const argIds = process.argv.slice(2).map(Number).filter(Number.isFinite);
const IDS = argIds.length ? argIds : [2948, 3040, 3038, 3024, 3047];

async function main() {
  const { data: contracts, error } = await supabase
    .from('contracts')
    .select(
      'id, type_id, status, status_id, currency, execution_date, subscription_term, renewal_period, renewal_type, billing_frequency, annual_increase, annual_increase_months, cancel_by_date, term_start_date, term_end_date, updated_at, vendors(name), vendor_products_details(product_id, year, fees, sort_order, vendor_products(name))',
    )
    .in('id', IDS);
  if (error) throw error;

  for (const c of contracts ?? []) {
    console.log(
      `\n#${c.id} [${(c.vendors as { name?: string } | null)?.name}] type ${c.type_id} status ${c.status}/${c.status_id} ccy ${c.currency}`,
    );
    console.log(
      `  exec ${c.execution_date} | sub_term ${c.subscription_term} | renewal_period ${c.renewal_period} | type ${c.renewal_type} | billing ${c.billing_frequency} | incr ${c.annual_increase} (months ${c.annual_increase_months}) | cancel_by ${c.cancel_by_date}`,
    );
    console.log(`  term_start ${JSON.stringify(c.term_start_date)}`);
    console.log(`  term_end   ${JSON.stringify(c.term_end_date)}`);
    const products = (c.vendor_products_details ?? []) as Array<{
      product_id: number;
      year: number | null;
      fees: number | null;
      vendor_products: { name: string } | null;
    }>;
    let native = 0;
    for (const p of products) {
      native += p.fees ?? 0;
      console.log(
        `    product ${p.product_id} year ${p.year} fees ${p.fees} — ${p.vendor_products?.name?.slice(0, 60)}`,
      );
    }
    console.log(`  native fee sum (all rows): ${native}`);
  }

  const { data: rels, error: relErr } = await supabase
    .from('contract_relationships')
    .select('*')
    .or(
      IDS.map(
        (id) => `parent_contract_id.eq.${id},child_contract_id.eq.${id}`,
      ).join(','),
    );
  if (relErr) {
    console.log(`\nrelationships query error: ${relErr.message}`);
  } else {
    console.log(`\nrelationships touching these ids:`);
    for (const r of rels ?? []) console.log(`  ${JSON.stringify(r)}`);

    const parentIds = [
      ...new Set(
        (rels ?? [])
          .map((r) => r.parent_contract_id)
          .filter((id): id is number => id != null && !IDS.includes(id)),
      ),
    ];
    if (parentIds.length) {
      const { data: parents } = await supabase
        .from('contracts')
        .select(
          'id, type_id, status, subscription_term, renewal_period, cancel_by_date, term_start_date, term_end_date, vendors(name)',
        )
        .in('id', parentIds);
      console.log(`\nparents of these ids (notice/term facts):`);
      for (const p of parents ?? []) {
        console.log(
          `  #${p.id} [${(p.vendors as { name?: string } | null)?.name}] type ${p.type_id} status ${p.status} | sub_term ${p.subscription_term} | renewal_period ${p.renewal_period} | cancel_by ${p.cancel_by_date} | start ${JSON.stringify(p.term_start_date)} | end ${JSON.stringify(p.term_end_date)}`,
        );
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
