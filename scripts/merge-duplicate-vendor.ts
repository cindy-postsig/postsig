/**
 * Merge one duplicate vendors row into another, one pair at a time.
 *
 * The merge itself is a single transaction in the database
 * (vendor_merge_apply, see supabase/migrations/20260911120000_vendor_merge_functions.sql).
 * This script finds candidates, shows the preview, applies on request, then
 * refreshes the admin materialized views and purges the Redis caches that
 * embed vendor names.
 *
 *   npx tsx scripts/merge-duplicate-vendor.ts --find                       # list likely duplicate groups
 *   npx tsx scripts/merge-duplicate-vendor.ts --loser 42 --survivor 7      # preview (dry run)
 *   npx tsx scripts/merge-duplicate-vendor.ts --loser 42 --survivor 7 --apply
 *   npx tsx scripts/merge-duplicate-vendor.ts --loser 42 --survivor 7 --apply --allow-reference-drops
 *   npx tsx scripts/merge-duplicate-vendor.ts --env .env.prod --find [--json]
 *
 * --allow-reference-drops is needed only when the preview reports product
 * reference rows the survivor product already has an equivalent of (same
 * contract/year in vendor_products_details, same version, ...). Review the
 * preview before allowing it: those rows are deleted, not merged.
 *
 * Credentials come from --env (default .env.local): NEXT_PUBLIC_SUPABASE_URL
 * + SUPABASE_SERVICE_ROLE_KEY, plus ELASTICACHE_REDIS_URL for the cache purge.
 * Re-running after a failure is safe: apply either commits everything or
 * nothing, and a merged loser is rejected on the next attempt.
 *
 * Rollback: every apply writes tmp/vendor-merges/<loser>-into-<survivor>-<ts>.json
 * holding the repointed ids and the full content of deleted rows. Reversal is
 * manual from that file; there is no automatic undo, so review the preview.
 * The SQL side is exercised by scripts/vendor-merge-check.sql.
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { config } from 'dotenv';
import Redis from 'ioredis';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientFromEnv, fetchAllRows } from './lib/backfill-cli';
import {
  findDuplicateCandidates,
  parseMergeArgs,
  suggestSurvivor,
  type CandidateGroup,
  type MergeArgs,
  type VendorRow,
} from './vendor-merge-plan';

const IN_CHUNK_SIZE = 200;
const BLOCKING_SQLSTATE = 'VM001';
const MV_REFRESH_FUNCTIONS = [
  'admin_activity_logs_refresh',
  'admin_org_module_monthly_refresh',
  'admin_org_module_uploads_refresh',
];

interface RefCounts {
  repointed: number;
  dropped: number;
}

interface ProductMerge {
  loser_product_id: number;
  loser_name: string;
  survivor_product_id: number;
  survivor_name: string;
  references: Record<string, RefCounts>;
}

interface VendorSummary {
  id: number;
  name: string;
  status: string | null;
}

interface MergeReport {
  dry_run?: boolean;
  blocking?: string[];
  loser?: VendorSummary;
  survivor?: VendorSummary;
  warnings?: string[];
  /** Per table: a row count, plus a sibling `*_ids` array of what moved. */
  moved?: Record<string, number | unknown[]>;
  product_merges?: ProductMerge[];
  reference_drops?: number;
  settings_merged?: { organization_id: string }[];
  corporate_actions_deleted?: { reason: string; row: { id: number } }[];
  organization_ids?: string[];
}

type MergeFunction = 'vendor_merge_preview' | 'vendor_merge_apply';

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function fetchVendors(supabase: SupabaseClient): Promise<VendorRow[]> {
  return fetchAllRows<VendorRow>((from, to) =>
    supabase
      .from('vendors')
      .select('id, name, domain, status, created_at')
      .order('id')
      .range(from, to),
  );
}

async function fetchContractCounts(
  supabase: SupabaseClient,
  vendorIds: number[],
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  for (const ids of chunk(vendorIds, IN_CHUNK_SIZE)) {
    const rows = await fetchAllRows<{ vendor_id: number }>((from, to) =>
      supabase
        .from('contracts')
        .select('vendor_id')
        .in('vendor_id', ids)
        .order('id')
        .range(from, to),
    );
    for (const row of rows) {
      counts.set(row.vendor_id, (counts.get(row.vendor_id) ?? 0) + 1);
    }
  }
  return counts;
}

function vendorLine(
  vendor: VendorRow,
  survivorId: number,
  counts: Map<number, number>,
): string {
  const role = vendor.id === survivorId ? 'KEEP ' : 'MERGE';
  return (
    '  ' +
    role +
    ' #' +
    String(vendor.id) +
    ' "' +
    vendor.name +
    '" domain=' +
    (vendor.domain ?? '-') +
    ' contracts=' +
    String(counts.get(vendor.id) ?? 0)
  );
}

function mergeCommand(loserId: number, survivorId: number): string {
  return (
    '    npx tsx scripts/merge-duplicate-vendor.ts --loser ' +
    String(loserId) +
    ' --survivor ' +
    String(survivorId)
  );
}

function printGroup(group: CandidateGroup, counts: Map<number, number>): void {
  const survivor = suggestSurvivor(group, counts);
  console.log('\n[' + group.reason + '] ' + group.key);
  for (const vendor of group.vendors) {
    console.log(vendorLine(vendor, survivor.id, counts));
  }
  for (const vendor of group.vendors) {
    if (vendor.id !== survivor.id)
      console.log(mergeCommand(vendor.id, survivor.id));
  }
}

function candidatesJson(
  groups: CandidateGroup[],
  counts: Map<number, number>,
): unknown[] {
  return groups.map((group) => ({
    ...group,
    suggestedSurvivor: suggestSurvivor(group, counts).id,
    contractCounts: Object.fromEntries(
      group.vendors.map((v) => [v.id, counts.get(v.id) ?? 0]),
    ),
  }));
}

async function runFind(supabase: SupabaseClient, json: boolean): Promise<void> {
  const vendors = await fetchVendors(supabase);
  const groups = findDuplicateCandidates(vendors);
  if (groups.length === 0) {
    console.log('No duplicate candidates found.');
    return;
  }
  const ids = groups.flatMap((g) => g.vendors.map((v) => v.id));
  const counts = await fetchContractCounts(supabase, ids);
  if (json) {
    console.log(JSON.stringify(candidatesJson(groups, counts), null, 2));
    return;
  }
  for (const group of groups) printGroup(group, counts);
  console.log(
    '\n' +
      String(groups.length) +
      ' candidate group(s). Review each pair by hand: same-name rows can be distinct legal entities.',
  );
}

function referenceLine(table: string, counts: RefCounts): string | null {
  if (counts.repointed === 0 && counts.dropped === 0) return null;
  let line = '      ' + table + ': repointed ' + String(counts.repointed);
  if (counts.dropped > 0) line += '  DROPPED ' + String(counts.dropped);
  return line;
}

function printProductMerge(merge: ProductMerge): void {
  console.log(
    '  #' +
      String(merge.loser_product_id) +
      ' "' +
      merge.loser_name +
      '" -> #' +
      String(merge.survivor_product_id) +
      ' "' +
      merge.survivor_name +
      '"',
  );
  for (const [table, counts] of Object.entries(merge.references)) {
    const line = referenceLine(table, counts);
    if (line) console.log(line);
  }
}

function vendorLabel(vendor: VendorSummary): string {
  return '#' + String(vendor.id) + ' "' + vendor.name + '"';
}

function printReport(report: MergeReport): void {
  const blocking = report.blocking ?? [];
  if (blocking.length > 0) {
    console.log('\nBLOCKED:');
    for (const issue of blocking) console.log('  - ' + issue);
    return;
  }
  if (report.loser && report.survivor) {
    console.log(
      '\nMerge ' +
        vendorLabel(report.loser) +
        ' -> ' +
        vendorLabel(report.survivor),
    );
  }
  console.log('Rows moved:');
  for (const [table, count] of Object.entries(report.moved ?? {})) {
    if (typeof count === 'number')
      console.log('  ' + table + ': ' + String(count));
  }
  const merges = report.product_merges ?? [];
  if (merges.length > 0)
    console.log('\nProduct merges (loser product -> survivor product):');
  for (const merge of merges) printProductMerge(merge);

  const settings = report.settings_merged ?? [];
  if (settings.length > 0) {
    console.log('\norganization_vendor_settings merged for organization(s):');
    for (const s of settings) console.log('  ' + s.organization_id);
  }
  const corp = report.corporate_actions_deleted ?? [];
  if (corp.length > 0) console.log('\nCorporate actions deleted:');
  for (const c of corp) console.log('  #' + String(c.row.id) + ': ' + c.reason);

  const warnings = report.warnings ?? [];
  if (warnings.length > 0) console.log('\nWarnings:');
  for (const w of warnings) console.log('  ! ' + w);
}

async function callMerge(
  supabase: SupabaseClient,
  fn: MergeFunction,
  params: Record<string, number | boolean>,
): Promise<MergeReport> {
  const { data, error } = await supabase.rpc(fn, params);
  if (!error) return data as MergeReport;
  if ((error as { code?: string }).code === BLOCKING_SQLSTATE) {
    return { blocking: [error.message] };
  }
  throw error;
}

async function refreshMaterializedViews(
  supabase: SupabaseClient,
): Promise<void> {
  for (const fn of MV_REFRESH_FUNCTIONS) {
    const { error } = await supabase.rpc(fn);
    if (error)
      console.log(
        '  ! ' + fn + ' failed (' + error.message + '); run it by hand',
      );
    else console.log('  ✓ ' + fn);
  }
}

function redisFromEnv(envPath: string): Redis | null {
  const env: Record<string, string> = {};
  config({ path: envPath, processEnv: env });
  const url = env.ELASTICACHE_REDIS_URL;
  if (!url) return null;
  const remote = Boolean(env.ENV) && env.ENV !== 'local';
  return new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    tls: remote ? { rejectUnauthorized: false } : undefined,
  });
}

async function deleteByPattern(redis: Redis, pattern: string): Promise<number> {
  let deleted = 0;
  const stream = redis.scanStream({ match: pattern, count: 500 });
  for await (const batch of stream as AsyncIterable<string[]>) {
    if (batch.length > 0) deleted += await redis.unlink(...batch);
  }
  return deleted;
}

/**
 * Keys that embed vendor ids or names: per-user vendor entries, per-user
 * vendor lists, and the per-org contract sets (hextraction purges the same
 * org pattern). Logo/profile keys are name/domain keyed and expire on TTL.
 */
function cachePatterns(report: MergeReport): string[] {
  const patterns: string[] = [];
  if (report.loser) patterns.push('*vendor:' + String(report.loser.id));
  if (report.survivor) patterns.push('*vendor:' + String(report.survivor.id));
  for (const org of report.organization_ids ?? []) {
    patterns.push('*org:' + org + ':*');
    patterns.push('*vendor:list:' + org + ':*');
  }
  return patterns;
}

async function purgeCaches(
  envPath: string,
  report: MergeReport,
): Promise<void> {
  const redis = redisFromEnv(envPath);
  if (!redis) {
    console.log(
      '  ! no ELASTICACHE_REDIS_URL in ' +
        envPath +
        ': purge vendor/org caches by hand or wait out the TTL',
    );
    return;
  }
  try {
    await redis.connect();
    let cleared = 0;
    for (const pattern of cachePatterns(report)) {
      cleared += await deleteByPattern(redis, pattern);
    }
    console.log('  ✓ cache: cleared ' + String(cleared) + ' key(s)');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      '  ! cache purge failed (' +
        message +
        '); purge by hand or wait out the TTL',
    );
  } finally {
    redis.disconnect();
  }
}

/**
 * The apply report lists every repointed id and the full content of every
 * deleted row; it is the only record from which a merge can be reversed.
 */
function saveReport(
  report: MergeReport,
  loser: number,
  survivor: number,
): string {
  const dir = path.join('tmp', 'vendor-merges');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(
    dir,
    String(loser) + '-into-' + String(survivor) + '-' + stamp + '.json',
  );
  writeFileSync(file, JSON.stringify(report, null, 2));
  return file;
}

async function applyPair(
  supabase: SupabaseClient,
  args: MergeArgs,
  loser: number,
  survivor: number,
): Promise<void> {
  const result = await callMerge(supabase, 'vendor_merge_apply', {
    p_loser: loser,
    p_survivor: survivor,
    p_allow_reference_drops: args.allowDrops,
  });
  if ((result.blocking ?? []).length > 0) {
    printReport(result);
    process.exitCode = 1;
    return;
  }
  console.log(
    '\n✓ merged vendor #' + String(loser) + ' into #' + String(survivor),
  );
  // The merge has committed; a failed save must not stop the refresh and
  // purge below, and the report is the only rollback record.
  try {
    console.log('  ✓ report saved to ' + saveReport(result, loser, survivor));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      '  ! could not save the report (' + message + '); full report follows:',
    );
    console.log(JSON.stringify(result, null, 2));
  }
  console.log('Refreshing admin materialized views:');
  await refreshMaterializedViews(supabase);
  console.log('Purging caches:');
  await purgeCaches(args.envPath, result);
  console.log(
    '\nNot done here: admin_org_metrics_monthly.cpm_active_vendors for past months, and bookmarked /vendors/' +
      String(loser) +
      ' links.',
  );
}

async function runPair(
  supabase: SupabaseClient,
  args: MergeArgs,
): Promise<void> {
  const loser = args.loser as number;
  const survivor = args.survivor as number;
  const preview = await callMerge(supabase, 'vendor_merge_preview', {
    p_loser: loser,
    p_survivor: survivor,
  });
  if (args.json) console.log(JSON.stringify(preview, null, 2));
  else printReport(preview);

  if ((preview.blocking ?? []).length > 0) {
    process.exitCode = 1;
    return;
  }
  if (!args.apply) {
    console.log('\nDry run — re-run with --apply to merge.');
    return;
  }
  const drops = preview.reference_drops ?? 0;
  if (drops > 0 && !args.allowDrops) {
    console.log(
      '\nRefusing to apply: ' +
        String(drops) +
        ' product reference row(s) would be dropped. Re-run with --allow-reference-drops after reviewing them.',
    );
    process.exitCode = 1;
    return;
  }
  await applyPair(supabase, args, loser, survivor);
}

async function main(): Promise<void> {
  const args = parseMergeArgs(process.argv.slice(2));
  const supabase = clientFromEnv(args.envPath) as unknown as SupabaseClient;
  if (args.find) await runFind(supabase, args.json);
  else await runPair(supabase, args);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
