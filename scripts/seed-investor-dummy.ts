/**
 * One-off dev seeding: enrich an org's investor dashboard by copying portfolio
 * companies from a richer source org and generating purchase transactions across
 * the last 4 quarters (the window InvestmentTimelineChart shows).
 *
 * Per copied company it creates: inv_company (forced 'active'), one inv_security,
 * one inv_cap_table_snapshot (drives FMV), and one 'purchase' inv_transaction
 * (drives cost + the Investments chart + fund tag). All rows are tagged with
 * metadata.seed = SEED_TAG so they can be found/removed later.
 *
 * Dry-run by default. Pass --commit to write.
 *
 *   npx tsx scripts/seed-investor-dummy.ts            # plan only, no writes
 *   npx tsx scripts/seed-investor-dummy.ts --commit   # write
 */
import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const DEV_REF = 'kyaaxttppehcoaznlumo';
const DEV_URL = `https://${DEV_REF}.supabase.co`;

const TARGET_ORG = 'e9262cc7-8927-4e87-bac4-d89c8133c9be';
const SOURCE_ORG = 'ea979d9f-47ef-4ab5-815a-36f10f31876b';

const COMMIT = process.argv.includes('--commit');
const SEED_TAG = 'investor-dummy-2026-06';
const COPY_COUNT = 16;
// Skip SPAC-scale outliers that would dominate the chart and skew total FMV/TVPI.
const MAX_COST = 5_000_000;
const MAX_FMV = 50_000_000;

// One date inside each of the four quarters the chart renders for "now" =
// 2026-06-21: 2025-Q3, 2025-Q4, 2026-Q1, 2026-Q2.
const QUARTER_DATES = ['2025-08-15', '2025-11-15', '2026-02-15', '2026-05-15'];
const SNAPSHOT_DATE = '2026-05-31';

// Round-robin fund tags (target org's non-"Test" funds).
const TARGET_FUND_IDS = [16, 17, 18, 36, 97];

const meta = () => ({ seed: SEED_TAG });

async function pickDevClient(): Promise<SupabaseClient> {
  const candidates = Object.entries(process.env)
    .filter(([k, v]) => k.endsWith('SERVICE_ROLE_KEY') && !!v)
    .map(([k, v]) => ({ name: k, key: v as string }));

  for (const { name, key } of candidates) {
    const client = createClient(DEV_URL, key, {
      auth: { persistSession: false },
    });
    const { error } = await client
      .from('inv_company')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', TARGET_ORG);
    if (!error) {
      console.log(`✓ Using ${name} against ${DEV_URL}`);
      return client;
    }
  }
  throw new Error(
    `No service-role key in .env.local could authenticate against ${DEV_URL}. ` +
      `Tried: ${candidates.map((c) => c.name).join(', ') || '(none found)'}`,
  );
}

interface Candidate {
  sourceInvCompanyId: number;
  globalCompanyId: number;
  name: string;
  sector: string | null;
  stageId: number | null;
  entryStageId: number | null;
  aggregateCost: number;
  myFmv: number;
  myFdPct: number;
  postMoney: number;
  sharePrice: number | null;
  myUnits: number | null;
  fdTotal: number | null;
}

async function buildCandidates(db: SupabaseClient): Promise<Candidate[]> {
  const [targetCos, sourceCos, sourceVal] = await Promise.all([
    db
      .from('inv_company')
      .select('company_id')
      .eq('organization_id', TARGET_ORG),
    db
      .from('inv_company')
      .select('id, company_id, name_override, sector, stage_id, entry_stage_id')
      .eq('organization_id', SOURCE_ORG),
    db
      .from('v_inv_company_valuation')
      .select(
        'company_id, global_company_id, company_name, aggregate_cost, my_fmv, my_fd_pct, post_money_valuation, current_price_unit, my_units, fully_diluted_total',
      )
      .eq('organization_id', SOURCE_ORG),
  ]);

  for (const [label, res] of [
    ['target inv_company', targetCos],
    ['source inv_company', sourceCos],
    ['source valuation view', sourceVal],
  ] as const) {
    if (res.error) throw new Error(`${label}: ${res.error.message}`);
  }

  const alreadyInTarget = new Set(
    (targetCos.data ?? []).map((r) => r.company_id as number),
  );
  const srcCoById = new Map(
    (sourceCos.data ?? []).map((r) => [r.id as number, r]),
  );

  const candidates: Candidate[] = [];
  for (const v of sourceVal.data ?? []) {
    const cost = Number(v.aggregate_cost ?? 0);
    const fmv = Number(v.my_fmv ?? 0);
    const fdPct = v.my_fd_pct == null ? null : Number(v.my_fd_pct);
    const postMoney =
      v.post_money_valuation == null ? null : Number(v.post_money_valuation);
    const global = v.global_company_id as number;

    if (alreadyInTarget.has(global)) continue;
    if (!(cost > 0) || !(fmv > 0) || !fdPct || !postMoney) continue;
    if (cost > MAX_COST || fmv > MAX_FMV) continue;

    const src = srcCoById.get(v.company_id as number);
    candidates.push({
      sourceInvCompanyId: v.company_id as number,
      globalCompanyId: global,
      name: (v.company_name as string) ?? 'Unknown',
      sector: (src?.sector as string | null) ?? null,
      stageId: (src?.stage_id as number | null) ?? null,
      entryStageId: (src?.entry_stage_id as number | null) ?? null,
      aggregateCost: cost,
      myFmv: fmv,
      myFdPct: fdPct,
      postMoney,
      sharePrice:
        v.current_price_unit == null ? null : Number(v.current_price_unit),
      myUnits: v.my_units == null ? null : Number(v.my_units),
      fdTotal:
        v.fully_diluted_total == null ? null : Number(v.fully_diluted_total),
    });
  }

  candidates.sort((a, b) => b.myFmv - a.myFmv);
  return candidates.slice(0, COPY_COUNT);
}

async function copyCompany(db: SupabaseClient, c: Candidate, idx: number) {
  const fundId = TARGET_FUND_IDS[idx % TARGET_FUND_IDS.length];
  const txnDate = QUARTER_DATES[idx % QUARTER_DATES.length];
  const units = c.myUnits && c.myUnits > 0 ? c.myUnits : 1000;
  const fdTotal = c.fdTotal && c.fdTotal > 0 ? c.fdTotal : 10_000_000;

  const { data: coData, error: coErr } = await db
    .from('inv_company')
    .insert({
      organization_id: TARGET_ORG,
      company_id: c.globalCompanyId,
      status: 'active',
      sector: c.sector,
      stage_id: c.stageId,
      entry_stage_id: c.entryStageId,
      metadata: meta(),
    })
    .select('id')
    .single();
  if (coErr) throw new Error(`inv_company[${c.name}]: ${coErr.message}`);
  const newCompanyId = coData.id as number;

  const { data: secData, error: secErr } = await db
    .from('inv_security')
    .insert({
      organization_id: TARGET_ORG,
      company_id: newCompanyId,
      name: 'Series A Preferred',
      security_type: 'preferred',
      metadata: meta(),
    })
    .select('id')
    .single();
  if (secErr) throw new Error(`inv_security[${c.name}]: ${secErr.message}`);
  const newSecurityId = secData.id as number;

  const { error: snapErr } = await db.from('inv_cap_table_snapshot').insert({
    organization_id: TARGET_ORG,
    company_id: newCompanyId,
    snapshot_date: SNAPSHOT_DATE,
    fully_diluted_total: fdTotal,
    our_total_shares: c.myUnits && c.myUnits > 0 ? Math.round(c.myUnits) : null,
    our_fd_ownership_percent: c.myFdPct,
    implied_valuation: c.postMoney,
    share_price: c.sharePrice,
    cap_table_detail: meta(),
  });
  if (snapErr)
    throw new Error(`inv_cap_table_snapshot[${c.name}]: ${snapErr.message}`);

  const { error: txErr } = await db.from('inv_transaction').insert({
    organization_id: TARGET_ORG,
    fund_id: fundId,
    company_id: newCompanyId,
    security_id: newSecurityId,
    transaction_type: 'purchase',
    transaction_date: txnDate,
    units,
    amount: -Math.abs(c.aggregateCost),
    currency: 'USD',
    notes: 'Seeded dummy investment',
    metadata: meta(),
  });
  if (txErr) throw new Error(`inv_transaction[${c.name}]: ${txErr.message}`);

  return { newCompanyId, fundId, txnDate };
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
    style: 'currency',
    currency: 'USD',
  }).format(n);
}

async function main() {
  console.log(
    `Mode: ${COMMIT ? 'COMMIT (will write)' : 'DRY RUN (no writes)'}`,
  );
  const db = await pickDevClient();

  const candidates = await buildCandidates(db);
  console.log(
    `\nPlanning to copy ${candidates.length} companies from SOURCE → TARGET:\n`,
  );
  candidates.forEach((c, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)}. ${c.name.padEnd(34)} cost=${fmt(
        c.aggregateCost,
      ).padStart(8)} fmv=${fmt(c.myFmv).padStart(8)}  → fund=${
        TARGET_FUND_IDS[i % TARGET_FUND_IDS.length]
      } date=${QUARTER_DATES[i % QUARTER_DATES.length]}`,
    );
  });

  const byQuarter = new Map<string, number>();
  candidates.forEach((_, i) => {
    const d = QUARTER_DATES[i % QUARTER_DATES.length];
    byQuarter.set(d, (byQuarter.get(d) ?? 0) + 1);
  });
  console.log(
    `\nPer-quarter spread: ${[...byQuarter.entries()]
      .map(([d, n]) => `${d}:${n}`)
      .join('  ')}`,
  );

  if (!COMMIT) {
    console.log('\nDRY RUN — no rows written. Re-run with --commit to apply.');
    return;
  }

  console.log('\nWriting...');
  let ok = 0;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    try {
      const r = await copyCompany(db, c, i);
      ok++;
      console.log(`  ✓ ${c.name} (inv_company #${r.newCompanyId})`);
    } catch (e) {
      console.error(`  ✗ ${c.name}: ${(e as Error).message}`);
    }
  }
  console.log(`\nDone. Copied ${ok}/${candidates.length} companies.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
