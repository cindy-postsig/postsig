/**
 * Report and merge vendor_products rows forked across a corporate-action
 * vendor family.
 *
 * Before searchVendorProducts became family-aware, an invoice arriving under
 * an acquirer created a duplicate product row even when the acquired vendor
 * already had one with the same name. Those forks break product_id matching
 * in lineage detection and the invoice discrepancy report.
 *
 *   npx tsx scripts/backfill-forked-vendor-products.ts                # report only (dry run)
 *   npx tsx scripts/backfill-forked-vendor-products.ts --json        # machine-readable report
 *   npx tsx scripts/backfill-forked-vendor-products.ts --apply       # repoint references, delete dupes
 *   npx tsx scripts/backfill-forked-vendor-products.ts --env .env.prod [--apply]
 *
 * Credentials come from --env (default .env.local): NEXT_PUBLIC_SUPABASE_URL
 * + SUPABASE_SERVICE_ROLE_KEY. Idempotent: a re-run after a partial failure
 * finds only the remaining dupes.
 */
import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  buildVendorFamilies,
  planProductMerges,
  type CorpActionRow,
  type CurrentVendorRow,
  type MergeGroup,
  type ProductRow,
  type VendorFamilies,
} from './vendor-product-merge-plan';

const REFERENCE_TABLES = [
  { table: 'vendor_products_details', column: 'product_id' },
  { table: 'vendor_products_users', column: 'product_id' },
  { table: 'contract_users', column: 'product_id' },
  { table: 'vendor_products_versions', column: 'vendor_product_id' },
] as const;

const PAGE_SIZE = 1000;
const IN_CHUNK_SIZE = 200;
const UNIQUE_VIOLATION = '23505';

type RefCounts = Record<string, number>;

interface ReportRow {
  group: MergeGroup;
  referenceCounts: Map<number, RefCounts>;
}

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

function parseArgs(argv: string[]) {
  const envFlag = argv.indexOf('--env');
  return {
    apply: argv.includes('--apply'),
    json: argv.includes('--json'),
    envFile: envFlag === -1 ? '.env.local' : argv[envFlag + 1],
  };
}

function makeClient(envFile: string): SupabaseClient {
  const env: Record<string, string> = {};
  config({ path: envFile, processEnv: env });
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      `${envFile} missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.`,
    );
  }
  console.log(`✓ DB: ${url}`);
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PageResult<T>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function fetchViewRows(supabase: SupabaseClient): Promise<CurrentVendorRow[]> {
  const page = (from: number, to: number): PageResult<CurrentVendorRow> =>
    supabase
      .from('current_vendors')
      .select('original_vendor_id, current_vendor_id')
      .range(from, to);
  return fetchAllRows(page);
}

function fetchCorpRows(supabase: SupabaseClient): Promise<CorpActionRow[]> {
  const page = (from: number, to: number): PageResult<CorpActionRow> =>
    supabase
      .from('corporate_actions')
      .select('primary_vendor_id, secondary_vendor_id')
      .range(from, to);
  return fetchAllRows(page);
}

async function fetchProducts(
  supabase: SupabaseClient,
  vendorIds: number[],
): Promise<ProductRow[]> {
  const rows: ProductRow[] = [];
  for (const ids of chunk(vendorIds, IN_CHUNK_SIZE)) {
    const page = (from: number, to: number): PageResult<ProductRow> =>
      supabase
        .from('vendor_products')
        .select('id, vendor_id, name, created_at')
        .in('vendor_id', ids)
        .order('id')
        .range(from, to);
    rows.push(...(await fetchAllRows(page)));
  }
  return rows;
}

async function fetchVendorNames(
  supabase: SupabaseClient,
  vendorIds: number[],
): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  for (const ids of chunk(vendorIds, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('vendors')
      .select('id, name')
      .in('id', ids);
    if (error) throw error;
    for (const row of data ?? []) names.set(row.id, row.name);
  }
  return names;
}

async function countReferences(
  supabase: SupabaseClient,
  productId: number,
): Promise<RefCounts> {
  const counts: RefCounts = {};
  for (const ref of REFERENCE_TABLES) {
    const { count, error } = await supabase
      .from(ref.table)
      .select('*', { count: 'exact', head: true })
      .eq(ref.column, productId);
    if (error) throw error;
    counts[ref.table] = count ?? 0;
  }
  return counts;
}

async function buildReportRows(
  supabase: SupabaseClient,
  plan: MergeGroup[],
): Promise<ReportRow[]> {
  const rows: ReportRow[] = [];
  for (const group of plan) {
    const referenceCounts = new Map<number, RefCounts>();
    for (const dupe of group.duplicates) {
      referenceCounts.set(dupe.id, await countReferences(supabase, dupe.id));
    }
    rows.push({ group, referenceCounts });
  }
  return rows;
}

function refsSummary(counts: RefCounts | undefined): string {
  if (!counts) return '';
  const parts: string[] = [];
  for (const ref of REFERENCE_TABLES) {
    parts.push(ref.table + '=' + String(counts[ref.table]));
  }
  return ' refs: ' + parts.join(' ');
}

function totalRefs(counts: RefCounts | undefined): number {
  if (!counts) return 0;
  let total = 0;
  for (const ref of REFERENCE_TABLES) total += counts[ref.table] ?? 0;
  return total;
}

function productLine(
  label: string,
  product: ProductRow,
  vendorNames: Map<number, string>,
  counts?: RefCounts,
): string {
  const vendor = vendorNames.get(product.vendor_id) ?? '?';
  const parts = [
    '    ' + label,
    '#' + String(product.id),
    '"' + product.name + '"',
    'vendor ' + String(product.vendor_id) + ' (' + vendor + ')',
    'created ' + product.created_at + refsSummary(counts),
  ];
  return parts.join(' ');
}

function familyLabel(
  memberIds: number[],
  vendorNames: Map<number, string>,
): string {
  const parts: string[] = [];
  for (const id of memberIds) {
    parts.push(String(id) + ' (' + (vendorNames.get(id) ?? '?') + ')');
  }
  return parts.join(', ');
}

function printGroup(
  row: ReportRow,
  families: VendorFamilies['families'],
  vendorNames: Map<number, string>,
): number {
  const members = families.get(row.group.familyRoot) ?? [];
  const heading = familyLabel(members, vendorNames);
  console.log('\nFamily [' + heading + '] — product "' + row.group.name + '"');
  console.log(productLine('KEEP ', row.group.canonical, vendorNames));
  let repointed = 0;
  for (const dupe of row.group.duplicates) {
    const counts = row.referenceCounts.get(dupe.id);
    console.log(productLine('MERGE', dupe, vendorNames, counts));
    repointed += totalRefs(counts);
  }
  return repointed;
}

function printReport(
  rows: ReportRow[],
  families: VendorFamilies['families'],
  vendorNames: Map<number, string>,
): void {
  let mergedRows = 0;
  let repointedRefs = 0;
  for (const row of rows) {
    repointedRefs += printGroup(row, families, vendorNames);
    mergedRows += row.group.duplicates.length;
  }
  console.log(
    '\nTotals: ' +
      String(rows.length) +
      ' duplicate group(s), ' +
      String(mergedRows) +
      ' row(s) to merge, ' +
      String(repointedRefs) +
      ' reference row(s) to repoint.',
  );
}

function printJson(rows: ReportRow[]): void {
  const payload = rows.map((row) => ({
    ...row.group,
    referenceCounts: Object.fromEntries(row.referenceCounts),
  }));
  console.log(JSON.stringify(payload, null, 2));
}

async function deleteRow(
  supabase: SupabaseClient,
  table: string,
  id: number,
): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

async function repointRow(
  supabase: SupabaseClient,
  table: string,
  column: string,
  rowId: number,
  toId: number,
): Promise<void> {
  const { error } = await supabase
    .from(table)
    .update({ [column]: toId })
    .eq('id', rowId);
  if (!error) return;
  if ((error as { code?: string }).code !== UNIQUE_VIOLATION) throw error;
  // The canonical product already has an equivalent row (e.g. same
  // contract/year in vendor_products_details) — the dupe reference is
  // redundant, not lost.
  console.log(
    '    conflict: ' +
      table +
      ' #' +
      String(rowId) +
      ' already exists for #' +
      String(toId) +
      '; deleting',
  );
  await deleteRow(supabase, table, rowId);
}

async function repointReferences(
  supabase: SupabaseClient,
  table: string,
  column: string,
  fromId: number,
  toId: number,
): Promise<void> {
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq(column, fromId);
  if (error) throw error;
  for (const row of data ?? []) {
    await repointRow(supabase, table, column, row.id, toId);
  }
}

async function applyGroup(
  supabase: SupabaseClient,
  group: MergeGroup,
): Promise<void> {
  for (const dupe of group.duplicates) {
    console.log(
      '  merging #' + String(dupe.id) + ' -> #' + String(group.canonical.id),
    );
    for (const ref of REFERENCE_TABLES) {
      await repointReferences(
        supabase,
        ref.table,
        ref.column,
        dupe.id,
        group.canonical.id,
      );
    }
    await deleteRow(supabase, 'vendor_products', dupe.id);
  }
}

async function applyPlan(
  supabase: SupabaseClient,
  rows: ReportRow[],
): Promise<void> {
  for (const row of rows) {
    const title = row.group.name;
    console.log(
      '\nApplying "' +
        title +
        '" (family ' +
        String(row.group.familyRoot) +
        '):',
    );
    await applyGroup(supabase, row.group);
  }
  console.log('\nDone: merged ' + String(rows.length) + ' duplicate group(s).');
}

async function main(): Promise<void> {
  const { apply, json, envFile } = parseArgs(process.argv.slice(2));
  const supabase = makeClient(envFile);

  const viewRows = await fetchViewRows(supabase);
  const corpRows = await fetchCorpRows(supabase);
  const vendorFamilies = buildVendorFamilies(viewRows, corpRows);
  const memberIds = Array.from(vendorFamilies.familyOf.keys());
  if (memberIds.length === 0) {
    console.log('No multi-vendor families found; nothing to do.');
    return;
  }

  const products = await fetchProducts(supabase, memberIds);
  const plan = planProductMerges(products, vendorFamilies);
  if (plan.length === 0) {
    console.log('No cross-vendor duplicate products found; nothing to do.');
    return;
  }

  const rows = await buildReportRows(supabase, plan);
  if (json) {
    printJson(rows);
  } else {
    const vendorNames = await fetchVendorNames(supabase, memberIds);
    printReport(rows, vendorFamilies.families, vendorNames);
  }

  if (!apply) {
    console.log('\nDry run — re-run with --apply to merge.');
    return;
  }
  await applyPlan(supabase, rows);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
