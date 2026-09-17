/**
 * Load monthly Bloomberg firmwide SID folders into one organization's
 * bloomberg_sid_* tables (PSK-1941). Each folder holds the eight
 * `<firmwide id>-<N>_*.csv` files of one month; the month is read from a
 * `MM_YYYY` token in the folder name unless --month is given.
 *
 *   npx tsx scripts/import-bloomberg-sid.ts --org <uuid> "<folder>" ["<folder>" ...]
 *   npx tsx scripts/import-bloomberg-sid.ts --org <uuid> --month 2026-02 "<folder>"
 *   --vendor <vendors.id>   the vendor the firmwide account is booked under; needed
 *                           the first time a firmwide ID is imported for the org
 *   --replace   delete an existing report for the same firmwide ID + month first
 *
 * The eight files go to the `documents` bucket under
 * <org>/bloomberg-sid/<firmwide id>/<month>/ before the rows are inserted.
 * A failed month deletes its report row again (children cascade); the
 * uploaded files stay and are overwritten by the next attempt.
 *
 * DB from .env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY);
 * refuses a non-local URL unless --allow-remote is passed.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/database.types';
import { parseSidFileSet } from '@/lib/v2/bloomberg-sid/parse';
import type {
  ParsedSidFileSet,
  SidExchangeFeeRow,
  SidFileIndex,
} from '@/lib/v2/bloomberg-sid/types';

config({ path: '.env.local' });

const BUCKET = 'documents';
const CHUNK = 500;
const FILE_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

type Args = {
  org: string;
  vendor: number | null;
  month: string | null;
  replace: boolean;
  allowRemote: boolean;
  folders: string[];
};

type SidFile = { name: string; buffer: Buffer };

type Client = SupabaseClient<Database>;

type DbError = { message: string } | null;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    org: '',
    vendor: null,
    month: null,
    replace: false,
    allowRemote: false,
    folders: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--org') args.org = argv[++i] ?? '';
    else if (arg === '--vendor') args.vendor = Number(argv[++i]);
    else if (arg === '--month') args.month = argv[++i] ?? null;
    else if (arg === '--replace') args.replace = true;
    else if (arg === '--allow-remote') args.allowRemote = true;
    else args.folders.push(arg);
  }
  if (!args.org || args.folders.length === 0) {
    throw new Error(
      'Usage: --org <uuid> [--vendor <id>] [--month YYYY-MM] [--replace] <folder>...',
    );
  }
  if (args.vendor !== null && !Number.isInteger(args.vendor)) {
    throw new Error('--vendor must be a vendors.id integer');
  }
  if (args.month && args.folders.length !== 1) {
    throw new Error('--month applies to exactly one folder');
  }
  return args;
}

function reportMonthFor(folder: string, override: string | null): string {
  if (override) {
    if (!/^\d{4}-\d{2}$/.test(override)) {
      throw new Error(`--month must be YYYY-MM, got ${override}`);
    }
    return `${override}-01`;
  }
  const match = /(\d{2})_(\d{4})/.exec(basename(folder));
  if (!match) {
    throw new Error(
      `No MM_YYYY token in folder name "${basename(folder)}"; pass --month`,
    );
  }
  return `${match[2]}-${match[1]}-01`;
}

function readFolder(folder: string): {
  firmwideId: number;
  files: Record<SidFileIndex, SidFile>;
} {
  const found = new Map<SidFileIndex, SidFile>();
  let firmwideId: number | null = null;
  for (const name of readdirSync(folder)) {
    const match = /^(\d+)-([0-7])_.*\.csv$/i.exec(name);
    if (!match) continue;
    const prefix = Number(match[1]);
    if (firmwideId !== null && prefix !== firmwideId) {
      throw new Error(
        `Mixed firmwide IDs in ${folder}: ${firmwideId} and ${prefix}`,
      );
    }
    firmwideId = prefix;
    found.set(Number(match[2]) as SidFileIndex, {
      name,
      buffer: readFileSync(join(folder, name)),
    });
  }
  const missing = FILE_INDEXES.filter((index) => !found.has(index));
  if (firmwideId === null || missing.length > 0) {
    throw new Error(`${folder}: missing file(s) -${missing.join(', -')}`);
  }
  return {
    firmwideId,
    files: Object.fromEntries(found) as Record<SidFileIndex, SidFile>,
  };
}

function localClient(allowRemote: boolean): Client {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '.env.local missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    );
  }
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);
  if (!isLocal && !allowRemote) {
    throw new Error(
      `${url} is not the local stack; pass --allow-remote to write there`,
    );
  }
  console.log(`DB: ${url}`);
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

function fail(step: string, error: DbError): never {
  throw new Error(`${step}: ${error?.message ?? 'unknown error'}`);
}

async function inChunks<T>(
  rows: T[],
  step: string,
  insert: (chunk: T[]) => PromiseLike<{ error: DbError }>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await insert(rows.slice(i, i + CHUNK));
    if (error) fail(step, error);
  }
}

function feeInsert(
  organizationId: string,
  reportId: number,
  fee: SidExchangeFeeRow,
): Database['public']['Tables']['bloomberg_sid_exchange_fees']['Insert'] {
  return {
    organization_id: organizationId,
    report_id: reportId,
    cust_num: fee.cust_num,
    rpt_month: fee.rpt_month,
    fee_kind: fee.fee_kind,
    exchange_code: fee.exchange_code,
    exchange_name: fee.exchange_name,
    subscriptions: fee.subscriptions,
    currency_code: fee.currency_code,
    total_price: fee.total_price,
    contributor_bills: fee.contributor_bills,
  };
}

function feeKey(fee: {
  cust_num: number;
  rpt_month: string;
  exchange_code: string;
}): string {
  return `${fee.cust_num}|${fee.rpt_month}|${fee.exchange_code}`;
}

async function ensureFirmwideAccount(
  client: Client,
  organizationId: string,
  firmwideId: number,
  vendorId: number | null,
): Promise<void> {
  const { data: existing, error } = await client
    .from('bloomberg_firmwide_accounts')
    .select('vendor_id')
    .eq('organization_id', organizationId)
    .eq('firmwide_id', firmwideId)
    .maybeSingle();
  if (error) fail('lookup firmwide account', error);
  if (existing) return;
  if (vendorId === null) {
    throw new Error(
      `No bloomberg_firmwide_accounts row for firmwide ${firmwideId}; pass --vendor <vendors.id>`,
    );
  }
  const { error: insertError } = await client
    .from('bloomberg_firmwide_accounts')
    .insert({
      organization_id: organizationId,
      firmwide_id: firmwideId,
      vendor_id: vendorId,
    });
  if (insertError) fail('insert firmwide account', insertError);
  console.log(`  firmwide ${firmwideId} → vendor ${vendorId}`);
}

async function insertMonth(
  client: Client,
  organizationId: string,
  reportMonth: string,
  firmwideId: number,
  files: Record<SidFileIndex, SidFile>,
  parsed: ParsedSidFileSet,
  replace: boolean,
): Promise<number> {
  const { data: existing, error: existingError } = await client
    .from('bloomberg_sid_reports')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('firmwide_id', firmwideId)
    .eq('report_month', reportMonth)
    .maybeSingle();
  if (existingError) fail('lookup existing report', existingError);
  if (existing) {
    if (!replace) {
      throw new Error(
        `Report for ${firmwideId} ${reportMonth} exists (id ${existing.id}); pass --replace`,
      );
    }
    const { error } = await client
      .from('bloomberg_sid_reports')
      .delete()
      .eq('id', existing.id);
    if (error) fail('delete existing report', error);
    console.log(`  replaced report ${existing.id}`);
  }

  const { data: report, error: reportError } = await client
    .from('bloomberg_sid_reports')
    .insert({
      organization_id: organizationId,
      firmwide_id: firmwideId,
      report_month: reportMonth,
      billing_date: parsed.billingDate,
    })
    .select('id')
    .single();
  if (reportError || !report) fail('insert report', reportError);
  const reportId = report.id;
  const scoped = { organization_id: organizationId, report_id: reportId };

  try {
    const prefix = `${organizationId}/bloomberg-sid/${firmwideId}/${reportMonth}`;
    for (const index of FILE_INDEXES) {
      const file = files[index];
      const path = `${prefix}/${file.name}`;
      const { error } = await client.storage
        .from(BUCKET)
        .upload(path, file.buffer, { contentType: 'text/csv', upsert: true });
      if (error) fail(`upload ${file.name}`, error);
      const { error: fileError } = await client
        .from('bloomberg_sid_report_files')
        .insert({
          ...scoped,
          file_index: index,
          file_name: file.name,
          storage_path: path,
          byte_size: file.buffer.byteLength,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          row_count: parsed.rowCounts[index],
        });
      if (fileError) fail(`record ${file.name}`, fileError);
    }

    await inChunks(
      parsed.accounts.map((row) => ({ ...scoped, ...row })),
      'insert accounts',
      (chunk) => client.from('bloomberg_sid_accounts').insert(chunk),
    );
    await inChunks(
      parsed.subscriptions.map((row) => ({ ...scoped, ...row })),
      'insert subscriptions',
      (chunk) => client.from('bloomberg_sid_subscriptions').insert(chunk),
    );
    await inChunks(
      parsed.changes.map((row) => ({ ...scoped, ...row })),
      'insert changes',
      (chunk) => client.from('bloomberg_sid_changes').insert(chunk),
    );
    await inChunks(
      parsed.researchPurchases.map((row) => ({ ...scoped, ...row })),
      'insert research purchases',
      (chunk) => client.from('bloomberg_sid_research_purchases').insert(chunk),
    );
    await inChunks(
      parsed.materialCharges.map((row) => ({ ...scoped, ...row })),
      'insert material charges',
      (chunk) => client.from('bloomberg_sid_material_charges').insert(chunk),
    );

    const feeIds = new Map<string, number>();
    for (let i = 0; i < parsed.exchangeFees.length; i += CHUNK) {
      const chunk = parsed.exchangeFees.slice(i, i + CHUNK);
      const { data, error } = await client
        .from('bloomberg_sid_exchange_fees')
        .insert(chunk.map((fee) => feeInsert(organizationId, reportId, fee)))
        .select('id, cust_num, rpt_month, exchange_code');
      if (error || !data) fail('insert exchange fees', error);
      for (const row of data) feeIds.set(feeKey(row), row.id);
    }
    await inChunks(
      parsed.exchangeFees.flatMap((fee) => {
        const feeId = feeIds.get(feeKey(fee));
        if (feeId === undefined) {
          throw new Error(`No id returned for fee ${feeKey(fee)}`);
        }
        return fee.lines.map((line) => ({
          organization_id: organizationId,
          fee_id: feeId,
          ...line,
        }));
      }),
      'insert exchange fee lines',
      (chunk) => client.from('bloomberg_sid_exchange_fee_lines').insert(chunk),
    );
  } catch (error) {
    await client.from('bloomberg_sid_reports').delete().eq('id', reportId);
    throw error;
  }
  return reportId;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const client = localClient(args.allowRemote);
  for (const folder of args.folders) {
    const reportMonth = reportMonthFor(folder, args.month);
    const { firmwideId, files } = readFolder(folder);
    const parsed = parseSidFileSet(
      Object.fromEntries(
        FILE_INDEXES.map((index) => [index, files[index].buffer]),
      ) as Record<SidFileIndex, Buffer>,
    );
    if (parsed.firmwideId !== firmwideId) {
      throw new Error(
        `${folder}: file prefix ${firmwideId} but -0 says New Cust ${parsed.firmwideId}`,
      );
    }
    console.log(`${basename(folder)} → ${reportMonth}, firmwide ${firmwideId}`);
    await ensureFirmwideAccount(client, args.org, firmwideId, args.vendor);
    const reportId = await insertMonth(
      client,
      args.org,
      reportMonth,
      firmwideId,
      files,
      parsed,
      args.replace,
    );
    const lines = parsed.exchangeFees.reduce(
      (n, fee) => n + fee.lines.length,
      0,
    );
    console.log(
      `  report ${reportId}: ${parsed.accounts.length} accounts, ${parsed.subscriptions.length} subscriptions, ` +
        `${parsed.changes.length} changes, ${parsed.exchangeFees.length} exchange fees, ${lines} fee lines, ` +
        `${parsed.researchPurchases.length} research purchases, ${parsed.materialCharges.length} material charges`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
