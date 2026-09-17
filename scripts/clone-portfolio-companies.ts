/**
 * Clone portfolio companies from a source org (local dev) to a target org
 * (prod demo). Copies inv_companies / inv_company / inv_security /
 * inv_security_terms / inv_financing_round / inv_round_terms /
 * inv_information_rights / inv_cap_table_snapshot / inv_equity_plan /
 * inv_equity_plan_snapshot / inv_transaction / inv_board_seat /
 * inv_co_investor.
 *
 * Skips: documents, ACL tables.
 *
 * Funds: any inv_fund row on the source referenced by a transaction is
 * copied to the target if no fund with the same name exists there.
 * Idempotency: companies are matched on target by domain (or legal_name
 * fallback) within the target org; matching companies are skipped.
 *
 * Run:
 *   npx tsx -r dotenv/config scripts/clone-portfolio-companies.ts \
 *     --source-org <local-org-uuid> \
 *     --target-org <prod-org-uuid> \
 *     --source-url $LOCAL_SUPABASE_URL \
 *     --source-key $LOCAL_SERVICE_ROLE_KEY \
 *     --target-url $PROD_SUPABASE_URL \
 *     --target-key $PROD_SERVICE_ROLE_KEY \
 *     [--limit 5] [--dry-run]
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface Args {
  sourceOrg: string;
  targetOrg: string;
  sourceUrl: string;
  sourceKey: string;
  targetUrl: string;
  targetKey: string;
  limit?: number;
  dryRun: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  // CLI args win; otherwise fall back to env vars (populated by
  // `-r dotenv/config`).
  const out: Partial<Args> & { dryRun?: boolean } = {
    sourceUrl: process.env.LOCAL_SUPABASE_URL,
    sourceKey: process.env.LOCAL_SERVICE_ROLE_KEY,
    targetUrl: process.env.PROD_SUPABASE_URL,
    targetKey: process.env.PROD_SERVICE_ROLE_KEY,
  };
  const req = (flag: string, v: string | undefined) => {
    if (!v) throw new Error(`${flag} requires a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--source-org') out.sourceOrg = req('--source-org', next);
    else if (a === '--target-org') out.targetOrg = req('--target-org', next);
    else if (a === '--source-url') out.sourceUrl = req('--source-url', next);
    else if (a === '--source-key') out.sourceKey = req('--source-key', next);
    else if (a === '--target-url') out.targetUrl = req('--target-url', next);
    else if (a === '--target-key') out.targetKey = req('--target-key', next);
    else if (a === '--limit') out.limit = parseInt(req('--limit', next), 10);
    else if (a === '--dry-run') out.dryRun = true;
  }
  for (const k of [
    'sourceOrg',
    'targetOrg',
    'sourceUrl',
    'sourceKey',
    'targetUrl',
    'targetKey',
  ] as const) {
    if (!out[k])
      throw new Error(
        `--${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())} (or env var) is required`,
      );
  }
  return { ...(out as Args), dryRun: Boolean(out.dryRun) };
}

type DB = SupabaseClient;

async function selectAll<T>(
  db: DB,
  table: string,
  filterCol: string,
  filterVal: string | number,
): Promise<T[]> {
  const { data, error } = await db
    .from(table)
    .select('*')
    .eq(filterCol, filterVal);
  if (error) throw new Error(`select ${table}: ${error.message}`);
  return (data ?? []) as T[];
}

async function selectIn<T>(
  db: DB,
  table: string,
  filterCol: string,
  values: (string | number)[],
): Promise<T[]> {
  if (values.length === 0) return [];
  const { data, error } = await db
    .from(table)
    .select('*')
    .in(filterCol, values);
  if (error) throw new Error(`select ${table}: ${error.message}`);
  return (data ?? []) as T[];
}

async function insertOne<T extends Record<string, unknown>>(
  db: DB,
  table: string,
  row: T,
): Promise<{ id: number }> {
  const { data, error } = await db
    .from(table)
    .insert(row)
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`insert ${table}: ${error?.message ?? 'no row returned'}`);
  }
  return data as { id: number };
}

/** Strip database-managed columns + ones we will explicitly override. */
function stripManaged<T extends Record<string, unknown>>(
  row: T,
  extra: string[] = [],
): Record<string, unknown> {
  const drop = new Set([
    'id',
    'created_at',
    'updated_at',
    'organization_id',
    'public_id',
    ...extra,
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!drop.has(k)) out[k] = v;
  }
  return out;
}

async function ensureFundMap(
  source: DB,
  target: DB,
  args: Args,
  referencedFundIds: number[],
): Promise<Map<number, number>> {
  const sourceFunds = await selectIn<{
    id: number;
    name: string;
    short_name: string | null;
    code: string | null;
    description: string | null;
    currency: string;
    status: string;
    vintage_year: number | null;
    target_size: number | null;
    committed_capital: number | null;
    metadata: unknown;
  }>(source, 'inv_fund', 'id', referencedFundIds);

  const { data: targetFunds, error: tfErr } = await target
    .from('inv_fund')
    .select('id, name')
    .eq('organization_id', args.targetOrg);
  if (tfErr) throw new Error(`load target funds: ${tfErr.message}`);
  const byName = new Map(
    (targetFunds ?? []).map((f) => [f.name.toLowerCase(), f.id as number]),
  );

  const map = new Map<number, number>();
  for (const f of sourceFunds) {
    const existing = byName.get(f.name.toLowerCase());
    if (existing != null) {
      map.set(f.id, existing);
      continue;
    }
    if (args.dryRun) {
      console.log(`  [dry] would insert fund "${f.name}"`);
      map.set(f.id, -1);
      continue;
    }
    const { id } = await insertOne(target, 'inv_fund', {
      ...stripManaged(f),
      organization_id: args.targetOrg,
    });
    console.log(`  inserted fund "${f.name}" (id=${id})`);
    map.set(f.id, id);
  }
  return map;
}

async function ensureGlobalCompany(
  target: DB,
  src: {
    name: string;
    domain: string | null;
    legal_name: string | null;
  } & Record<string, unknown>,
): Promise<number> {
  // Match by domain first (most reliable), then by legal_name, then name.
  const lookups: { col: string; val: string }[] = [];
  if (src.domain) lookups.push({ col: 'domain', val: src.domain });
  if (src.legal_name) lookups.push({ col: 'legal_name', val: src.legal_name });
  lookups.push({ col: 'name', val: src.name });

  for (const { col, val } of lookups) {
    const { data, error } = await target
      .from('inv_companies')
      .select('id')
      .eq(col, val)
      .maybeSingle();
    if (error) throw new Error(`lookup inv_companies.${col}: ${error.message}`);
    if (data) return data.id as number;
  }

  const { id } = await insertOne(target, 'inv_companies', stripManaged(src));
  return id;
}

async function companyExistsOnTarget(
  target: DB,
  targetOrg: string,
  globalCompanyId: number,
): Promise<boolean> {
  const { data, error } = await target
    .from('inv_company')
    .select('id')
    .eq('organization_id', targetOrg)
    .eq('company_id', globalCompanyId)
    .maybeSingle();
  if (error) throw new Error(`lookup inv_company: ${error.message}`);
  return Boolean(data);
}

interface CloneCtx {
  source: DB;
  target: DB;
  args: Args;
  fundMap: Map<number, number>;
}

async function cloneCompany(
  ctx: CloneCtx,
  sourceCompany: { id: number; company_id: number } & Record<string, unknown>,
  displayName: string,
): Promise<void> {
  const { source, target, args, fundMap } = ctx;
  const sourceCompanyId = sourceCompany.id;
  const sourceGlobalId = sourceCompany.company_id;

  // Global company (inv_companies)
  const { data: globalRow, error: globalErr } = await source
    .from('inv_companies')
    .select('*')
    .eq('id', sourceGlobalId)
    .single();
  if (globalErr || !globalRow) {
    throw new Error(
      `load inv_companies(${sourceGlobalId}): ${globalErr?.message}`,
    );
  }

  const targetGlobalId = await ensureGlobalCompany(target, globalRow);

  if (await companyExistsOnTarget(target, args.targetOrg, targetGlobalId)) {
    console.log(`[skip] ${displayName} already present on target org`);
    return;
  }

  if (args.dryRun) {
    console.log(`[dry] would clone ${displayName}`);
    return;
  }

  // inv_company (org-scoped)
  const { id: newCompanyId } = await insertOne(target, 'inv_company', {
    ...stripManaged(sourceCompany, ['company_id']),
    company_id: targetGlobalId,
    organization_id: args.targetOrg,
  });

  // inv_security — remap by source id → target id
  const securities = await selectAll<{ id: number } & Record<string, unknown>>(
    source,
    'inv_security',
    'company_id',
    sourceCompanyId,
  );
  const securityMap = new Map<number, number>();
  for (const s of securities) {
    const { id } = await insertOne(target, 'inv_security', {
      ...stripManaged(s, ['company_id']),
      company_id: newCompanyId,
      organization_id: args.targetOrg,
    });
    securityMap.set(s.id, id);
  }

  // inv_security_terms
  const securityTerms = await selectIn<
    { security_id: number } & Record<string, unknown>
  >(source, 'inv_security_terms', 'security_id', [...securityMap.keys()]);
  for (const st of securityTerms) {
    await insertOne(target, 'inv_security_terms', {
      ...stripManaged(st, ['security_id']),
      security_id: securityMap.get(st.security_id)!,
      organization_id: args.targetOrg,
    });
  }

  // inv_financing_round — remap
  const rounds = await selectAll<{ id: number } & Record<string, unknown>>(
    source,
    'inv_financing_round',
    'company_id',
    sourceCompanyId,
  );
  const roundMap = new Map<number, number>();
  for (const r of rounds) {
    const { id } = await insertOne(target, 'inv_financing_round', {
      ...stripManaged(r, ['company_id']),
      company_id: newCompanyId,
      organization_id: args.targetOrg,
    });
    roundMap.set(r.id, id);
  }

  // inv_round_terms
  if (roundMap.size > 0) {
    const roundTerms = await selectIn<
      { financing_round_id: number } & Record<string, unknown>
    >(source, 'inv_round_terms', 'financing_round_id', [...roundMap.keys()]);
    for (const rt of roundTerms) {
      await insertOne(target, 'inv_round_terms', {
        ...stripManaged(rt, ['financing_round_id']),
        financing_round_id: roundMap.get(rt.financing_round_id)!,
        organization_id: args.targetOrg,
      });
    }
  }

  // inv_information_rights
  const infoRights = await selectAll<
    { id: number; financing_round_id: number | null } & Record<string, unknown>
  >(source, 'inv_information_rights', 'company_id', sourceCompanyId);
  for (const ir of infoRights) {
    await insertOne(target, 'inv_information_rights', {
      ...stripManaged(ir, ['company_id', 'financing_round_id']),
      company_id: newCompanyId,
      financing_round_id:
        ir.financing_round_id != null
          ? (roundMap.get(ir.financing_round_id) ?? null)
          : null,
      organization_id: args.targetOrg,
    });
  }

  // inv_equity_plan + inv_equity_plan_snapshot
  const plans = await selectAll<{ id: number } & Record<string, unknown>>(
    source,
    'inv_equity_plan',
    'company_id',
    sourceCompanyId,
  );
  const planMap = new Map<number, number>();
  for (const p of plans) {
    const { id } = await insertOne(target, 'inv_equity_plan', {
      ...stripManaged(p, ['company_id']),
      company_id: newCompanyId,
      organization_id: args.targetOrg,
    });
    planMap.set(p.id, id);
  }
  if (planMap.size > 0) {
    const planSnaps = await selectIn<
      { plan_id: number } & Record<string, unknown>
    >(source, 'inv_equity_plan_snapshot', 'plan_id', [...planMap.keys()]);
    for (const ps of planSnaps) {
      await insertOne(target, 'inv_equity_plan_snapshot', {
        ...stripManaged(ps, ['plan_id']),
        plan_id: planMap.get(ps.plan_id)!,
        organization_id: args.targetOrg,
      });
    }
  }

  // inv_cap_table_snapshot
  const snapshots = await selectAll<
    { financing_round_id: number | null } & Record<string, unknown>
  >(source, 'inv_cap_table_snapshot', 'company_id', sourceCompanyId);
  for (const snap of snapshots) {
    await insertOne(target, 'inv_cap_table_snapshot', {
      ...stripManaged(snap, ['company_id', 'financing_round_id']),
      company_id: newCompanyId,
      financing_round_id:
        snap.financing_round_id != null
          ? (roundMap.get(snap.financing_round_id) ?? null)
          : null,
      organization_id: args.targetOrg,
    });
  }

  // inv_transaction
  const txns = await selectAll<
    {
      fund_id: number;
      security_id: number;
      financing_round_id: number | null;
    } & Record<string, unknown>
  >(source, 'inv_transaction', 'company_id', sourceCompanyId);
  for (const t of txns) {
    const targetFundId = fundMap.get(t.fund_id);
    if (targetFundId == null || targetFundId < 0) {
      throw new Error(
        `transaction references fund ${t.fund_id} not in fund map for company ${displayName}`,
      );
    }
    await insertOne(target, 'inv_transaction', {
      ...stripManaged(t, [
        'company_id',
        'fund_id',
        'security_id',
        'financing_round_id',
      ]),
      company_id: newCompanyId,
      fund_id: targetFundId,
      security_id: securityMap.get(t.security_id)!,
      financing_round_id:
        t.financing_round_id != null
          ? (roundMap.get(t.financing_round_id) ?? null)
          : null,
      organization_id: args.targetOrg,
    });
  }

  // inv_board_seat
  const seats = await selectAll<
    {
      designating_fund_id: number | null;
      designating_security_id: number | null;
    } & Record<string, unknown>
  >(source, 'inv_board_seat', 'company_id', sourceCompanyId);
  for (const seat of seats) {
    await insertOne(target, 'inv_board_seat', {
      ...stripManaged(seat, [
        'company_id',
        'designating_fund_id',
        'designating_security_id',
      ]),
      company_id: newCompanyId,
      designating_fund_id:
        seat.designating_fund_id != null
          ? (fundMap.get(seat.designating_fund_id) ?? null)
          : null,
      designating_security_id:
        seat.designating_security_id != null
          ? (securityMap.get(seat.designating_security_id) ?? null)
          : null,
      organization_id: args.targetOrg,
    });
  }

  // inv_co_investor (scoped via financing_round_id)
  if (roundMap.size > 0) {
    const coInvestors = await selectIn<
      { financing_round_id: number } & Record<string, unknown>
    >(source, 'inv_co_investor', 'financing_round_id', [...roundMap.keys()]);
    for (const ci of coInvestors) {
      await insertOne(target, 'inv_co_investor', {
        ...stripManaged(ci, ['financing_round_id']),
        financing_round_id: roundMap.get(ci.financing_round_id)!,
        organization_id: args.targetOrg,
      });
    }
  }

  console.log(`[done] ${displayName}`);
}

async function main() {
  const args = parseArgs();

  const source = createClient(args.sourceUrl, args.sourceKey);
  const target = createClient(args.targetUrl, args.targetKey);

  console.log(`Source org: ${args.sourceOrg}`);
  console.log(`Target org: ${args.targetOrg}`);
  if (args.dryRun) console.log('--dry-run mode: no writes');

  // inv_company has no `name` column (canonical name lives on inv_companies).
  // Join inv_companies for log labels, then strip the join out so the row
  // is exactly inv_company's shape when we spread it into inserts.
  const { data: companiesRaw, error: companiesErr } = await source
    .from('inv_company')
    .select('*, inv_companies(name)')
    .eq('organization_id', args.sourceOrg);
  if (companiesErr)
    throw new Error(`load source companies: ${companiesErr.message}`);
  const displayNameById = new Map<number, string>();
  const sourceCompanies = (companiesRaw ?? []).map(
    (row: Record<string, unknown>) => {
      const globalName = (row.inv_companies as { name?: string } | null)?.name;
      const nameOverride = row.name_override as string | null;
      const { inv_companies: _ignored, ...rest } = row;
      const id = rest.id as number;
      displayNameById.set(id, nameOverride ?? globalName ?? `id=${id}`);
      return rest as { id: number; company_id: number } & Record<
        string,
        unknown
      >;
    },
  );
  // Mirror lib/v2/inv/service.ts getInvPortfolioCompanies: include a
  // company if it has any published doc (status_id 5) OR has no docs at
  // all (Aumni-imported portcos). Exclude companies with only
  // non-published docs — those are test imports.
  const { data: docs, error: docsErr } = await source
    .from('module_documents')
    .select('company_id, status_id')
    .eq('organization_id', args.sourceOrg)
    .eq('is_deleted', false)
    .not('company_id', 'is', null);
  if (docsErr) throw new Error(`load docs: ${docsErr.message}`);
  const companiesWithAnyDoc = new Set<number>();
  const publishedCompanyIds = new Set<number>();
  for (const d of docs ?? []) {
    const cid = d.company_id as number;
    companiesWithAnyDoc.add(cid);
    if (d.status_id === 5) publishedCompanyIds.add(cid);
  }
  const eligible = sourceCompanies.filter(
    (c) => publishedCompanyIds.has(c.id) || !companiesWithAnyDoc.has(c.id),
  );
  console.log(
    `Found ${sourceCompanies.length} companies on source; ${eligible.length} eligible (published doc or no docs).`,
  );
  const companies = args.limit ? eligible.slice(0, args.limit) : eligible;

  // Discover the fund set we need (only funds referenced by transactions of
  // the companies we're cloning).
  const sourceCompanyIds = companies.map((c) => c.id);
  const txns = await selectIn<{ fund_id: number }>(
    source,
    'inv_transaction',
    'company_id',
    sourceCompanyIds,
  );
  const referencedFundIds = [...new Set(txns.map((t) => t.fund_id))];
  console.log(`Funds referenced: ${referencedFundIds.length}`);

  console.log('\n=== Ensuring funds on target ===');
  const fundMap = await ensureFundMap(source, target, args, referencedFundIds);

  console.log('\n=== Cloning companies ===');
  let cloned = 0;
  let skipped = 0;
  for (const c of companies) {
    const displayName = displayNameById.get(c.id) ?? `id=${c.id}`;
    try {
      const before = await companyExistsOnTarget(
        target,
        args.targetOrg,
        c.company_id,
      );
      await cloneCompany({ source, target, args, fundMap }, c, displayName);
      if (before) skipped += 1;
      else cloned += 1;
    } catch (err) {
      console.error(`[fail] ${displayName}:`, (err as Error).message);
      throw err;
    }
  }
  console.log(`\nDone. cloned=${cloned}, skipped=${skipped}`);
}

main().catch((err) => {
  console.error('error:', (err as Error).message);
  process.exit(1);
});
