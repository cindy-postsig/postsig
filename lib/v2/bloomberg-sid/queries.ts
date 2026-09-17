import { gunzipSync, gzipSync } from 'node:zlib';
import { unstable_noStore as noStore } from 'next/cache';
import { getCacheService } from '@/app/lib/redis/cache-service';
import { createClient } from '@/utils/supabase/service_server';
import { DatabaseError } from '@/lib/errors';
import logger from '@/utils/pino';
import { readUnits } from '@/lib/v2/cost-allocation/context';
import {
  sidKey,
  type SidAccount,
  type SidExchangeFee,
  type SidExchangeFeeLine,
  type SidHrEmployee,
  type SidKey,
  type SidProductSummary,
  type SidReport,
  type SidReportFile,
  type SidReportMonth,
  type SidSeatSource,
  type SidSubscription,
} from './report';
import { buildSidProducts, buildUnitPaths, matchHr } from './transforms';

export interface FirmwideAccount {
  id: number;
  firmwideId: number;
  vendorId: number;
  vendor: { name: string; domain: string | null };
}

const PAGE_SIZE = 1000;
const REPORT_FILE_BUCKET = 'documents';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type PageResult<T> = { data: T[] | null; error: unknown };

type SupabaseServiceClient = ReturnType<typeof createClient>;

function fail(
  message: string,
  error: unknown,
  context: Record<string, unknown>,
): never {
  logger.error({ error, ...context }, message);
  throw new DatabaseError(message, error as Error);
}

// Every caller must end its ordering on the primary key: `.range()` paging over
// a non-unique sort can repeat or skip rows across page boundaries.
async function fetchAllRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  message: string,
  context: Record<string, unknown>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await loadPage(offset, offset + PAGE_SIZE - 1);
    if (error) fail(message, error, context);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function groupByReport<R extends { report_id: number }, T>(
  rows: R[],
  toItem: (row: R) => T,
): Map<number, T[]> {
  const grouped = new Map<number, T[]>();
  for (const row of rows) {
    const item = toItem(row);
    const list = grouped.get(row.report_id);
    if (list) list.push(item);
    else grouped.set(row.report_id, [item]);
  }
  return grouped;
}

// fee_kind carries a CHECK constraint the type generator widens to `string`.
const toFeeKind = (value: string): SidExchangeFee['feeKind'] =>
  value === 'admin' ? 'admin' : 'exchange';

export async function fetchFirmwideAccounts(
  organizationId: string,
  options: { vendorId?: number } = {},
): Promise<FirmwideAccount[]> {
  noStore();
  const supabase = createClient();

  let query = supabase
    .from('bloomberg_firmwide_accounts')
    .select('id, firmwide_id, vendor_id, vendors(name, domain)')
    .eq('organization_id', organizationId);
  if (options.vendorId !== undefined) {
    query = query.eq('vendor_id', options.vendorId);
  }
  const { data, error } = await query.order('firmwide_id');

  if (error) {
    fail('Failed to load Bloomberg firmwide accounts', error, {
      organizationId,
      vendorId: options.vendorId,
    });
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    firmwideId: row.firmwide_id,
    vendorId: row.vendor_id,
    vendor: {
      name: row.vendors?.name ?? String(row.vendor_id),
      domain: row.vendors?.domain ?? null,
    },
  }));
}

export function fetchFirmwideAccountsByVendor(
  organizationId: string,
  vendorId: number,
): Promise<FirmwideAccount[]> {
  return fetchFirmwideAccounts(organizationId, { vendorId });
}

export async function fetchSidReportMonths(
  organizationId: string,
  firmwideId: number,
): Promise<SidReportMonth[]> {
  noStore();
  const supabase = createClient();

  const { data, error } = await supabase
    .from('bloomberg_sid_reports')
    .select('id, report_month, billing_date')
    .eq('organization_id', organizationId)
    .eq('firmwide_id', firmwideId)
    .order('report_month');

  if (error) {
    fail('Failed to load Bloomberg SID report months', error, {
      organizationId,
      firmwideId,
    });
  }

  return (data ?? []).map((row) => ({
    reportId: row.id,
    reportMonth: row.report_month,
    billingDate: row.billing_date,
  }));
}

function selectMonth(
  months: SidReportMonth[],
  reportMonth: string | null,
): SidReportMonth | null {
  if (months.length === 0) return null;
  if (reportMonth === null) return months[months.length - 1];
  return (
    months.find(
      (month) =>
        month.reportMonth === reportMonth ||
        month.reportMonth.startsWith(`${reportMonth}-`),
    ) ?? null
  );
}

async function fetchAccounts(
  organizationId: string,
  reportIds: number[],
): Promise<Map<number, SidAccount[]>> {
  if (reportIds.length === 0) return new Map();
  const supabase = createClient();

  const rows = await fetchAllRows(
    (from, to) =>
      supabase
        .from('bloomberg_sid_accounts')
        .select(
          'report_id, cust_num, name, city, state, country, currency_code, tax_rate, auto, term',
        )
        .eq('organization_id', organizationId)
        .in('report_id', reportIds)
        .order('cust_num')
        .order('id')
        .range(from, to),
    'Failed to load Bloomberg SID accounts',
    { organizationId, reportIds },
  );

  return groupByReport(rows, (row) => ({
    custNum: row.cust_num,
    name: row.name,
    city: row.city,
    state: row.state,
    country: row.country,
    currencyCode: row.currency_code,
    taxRate: row.tax_rate,
    auto: row.auto,
    term: row.term,
  }));
}

async function fetchSubscriptions(
  organizationId: string,
  reportIds: number[],
): Promise<Map<number, SidSubscription[]>> {
  if (reportIds.length === 0) return new Map();
  const supabase = createClient();

  const rows = await fetchAllRows(
    (from, to) =>
      supabase
        .from('bloomberg_sid_subscriptions')
        .select(
          'report_id, cust_num, sid, sid_inst_num, contract_date, renewal_date, last_user, sid_type, sid_description, gptt, gptt_description, serial_number, ws, ninety_day, special, price, po_number',
        )
        .eq('organization_id', organizationId)
        .in('report_id', reportIds)
        .order('sid')
        .order('sid_inst_num')
        .order('id')
        .range(from, to),
    'Failed to load Bloomberg SID subscriptions',
    { organizationId, reportIds },
  );

  return groupByReport(rows, (row) => ({
    custNum: row.cust_num,
    sid: row.sid,
    sidInstNum: row.sid_inst_num,
    contractDate: row.contract_date,
    renewalDate: row.renewal_date,
    lastUser: row.last_user,
    sidType: row.sid_type,
    sidDescription: row.sid_description,
    gptt: row.gptt,
    gpttDescription: row.gptt_description,
    serialNumber: row.serial_number,
    ws: row.ws,
    ninetyDay: row.ninety_day,
    special: row.special,
    price: row.price,
    poNumber: row.po_number,
  }));
}

async function fetchFees(
  organizationId: string,
  reportIds: number[],
): Promise<Map<number, SidExchangeFee[]>> {
  if (reportIds.length === 0) return new Map();
  const supabase = createClient();

  const rows = await fetchAllRows(
    (from, to) =>
      supabase
        .from('bloomberg_sid_exchange_fees')
        .select(
          'report_id, id, cust_num, rpt_month, fee_kind, exchange_code, exchange_name, subscriptions, currency_code, total_price, contributor_bills',
        )
        .eq('organization_id', organizationId)
        .in('report_id', reportIds)
        .order('cust_num')
        .order('exchange_code')
        .order('id')
        .range(from, to),
    'Failed to load Bloomberg SID exchange fees',
    { organizationId, reportIds },
  );

  return groupByReport(rows, (row) => ({
    id: row.id,
    custNum: row.cust_num,
    rptMonth: row.rpt_month,
    feeKind: toFeeKind(row.fee_kind),
    exchangeCode: row.exchange_code,
    exchangeName: row.exchange_name,
    subscriptions: row.subscriptions,
    currencyCode: row.currency_code,
    totalPrice: row.total_price,
    contributorBills: row.contributor_bills,
  }));
}

// Fee lines carry no report id of their own; the fee they belong to does, so
// the reports are selected through that embed in one read instead of one
// read per two hundred fee ids.
async function fetchFeeLinesByReport(
  organizationId: string,
  reportIds: number[],
): Promise<Map<number, SidExchangeFeeLine[]>> {
  if (reportIds.length === 0) return new Map();
  const supabase = createClient();

  const rows = await fetchAllRows(
    (from, to) =>
      supabase
        .from('bloomberg_sid_exchange_fee_lines')
        .select(
          'fee_id, sid, sid_inst_num, pro_rate, contributor_bills, eid_number, bloomberg_sid_exchange_fees!inner(report_id)',
        )
        .eq('organization_id', organizationId)
        .in('bloomberg_sid_exchange_fees.report_id', reportIds)
        .order('fee_id')
        .order('sid')
        .order('sid_inst_num')
        .order('id')
        .range(from, to),
    'Failed to load Bloomberg SID exchange fee lines',
    { organizationId, reportIds },
  );

  return groupByReport(
    rows.map((row) => ({
      ...row,
      report_id: row.bloomberg_sid_exchange_fees.report_id,
    })),
    (row) => ({
      feeId: row.fee_id,
      sid: row.sid,
      sidInstNum: row.sid_inst_num,
      proRate: row.pro_rate,
      contributorBills: row.contributor_bills,
      eidNumber: row.eid_number,
    }),
  );
}

async function fetchSidKeys(
  organizationId: string,
  reportId: number,
): Promise<SidKey[]> {
  const supabase = createClient();

  const rows = await fetchAllRows(
    (from, to) =>
      supabase
        .from('bloomberg_sid_subscriptions')
        .select('sid, sid_inst_num')
        .eq('organization_id', organizationId)
        .eq('report_id', reportId)
        .order('sid')
        .order('sid_inst_num')
        .order('id')
        .range(from, to),
    'Failed to load Bloomberg SID seats',
    { organizationId, reportId },
  );

  return rows.map((row) => sidKey(row.sid, row.sid_inst_num));
}

async function signReportFile(
  supabase: SupabaseServiceClient,
  storagePath: string,
  download: string | undefined,
  context: Record<string, unknown>,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(REPORT_FILE_BUCKET)
    .createSignedUrl(
      storagePath,
      SIGNED_URL_TTL_SECONDS,
      download === undefined ? undefined : { download },
    );

  if (error) {
    logger.warn(
      { error, storagePath, download: download !== undefined, ...context },
      'Error generating signed URL for Bloomberg SID report file',
    );
    return null;
  }

  return data?.signedUrl ?? null;
}

export async function fetchReportFiles(
  organizationId: string,
  reportId: number,
): Promise<SidReportFile[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('bloomberg_sid_report_files')
    .select('file_index, file_name, storage_path, byte_size, sha256, row_count')
    .eq('organization_id', organizationId)
    .eq('report_id', reportId)
    .order('file_index');

  if (error) {
    fail('Failed to load Bloomberg SID report files', error, {
      organizationId,
      reportId,
    });
  }

  return Promise.all(
    (data ?? []).map(async (row) => {
      const [signedUrl, downloadUrl] = await Promise.all([
        signReportFile(supabase, row.storage_path, undefined, {
          organizationId,
          reportId,
        }),
        signReportFile(supabase, row.storage_path, row.file_name, {
          organizationId,
          reportId,
        }),
      ]);

      return {
        fileIndex: row.file_index,
        fileName: row.file_name,
        byteSize: row.byte_size,
        rowCount: row.row_count,
        sha256: row.sha256,
        signedUrl,
        downloadUrl,
      };
    }),
  );
}

/** Leavers stay in the roster so a departed seat holder still resolves. */
export async function fetchHrEmployees(
  organizationId: string,
): Promise<SidHrEmployee[]> {
  const supabase = createClient();

  const rows = await fetchAllRows(
    (from, to) =>
      supabase
        .from('org_employees')
        .select(
          'id, first_name, last_name, department, cost_center, org_unit_id, status',
        )
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .order('id')
        .range(from, to),
    'Failed to load HR employees for Bloomberg SID matching',
    { organizationId },
  );

  return rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    department: row.department,
    costCenter: row.cost_center,
    orgUnitId: row.org_unit_id,
    status: row.status,
  }));
}

export async function fetchSidReport(
  organizationId: string,
  account: FirmwideAccount,
  reportMonth: string | null,
): Promise<SidReport | null> {
  noStore();

  const months = await fetchSidReportMonths(organizationId, account.firmwideId);
  const selected = selectMonth(months, reportMonth);
  if (!selected) return null;

  const selectedIndex = months.findIndex(
    (month) => month.reportId === selected.reportId,
  );
  const previous = selectedIndex > 0 ? months[selectedIndex - 1] : null;

  const reportIds = [selected.reportId];
  const [
    accountsByReport,
    subscriptionsByReport,
    feesByReport,
    feeLinesByReport,
    previousSidKeys,
    files,
    employees,
    units,
  ] = await Promise.all([
    fetchAccounts(organizationId, reportIds),
    fetchSubscriptions(organizationId, reportIds),
    fetchFees(organizationId, reportIds),
    fetchFeeLinesByReport(organizationId, reportIds),
    previous
      ? fetchSidKeys(organizationId, previous.reportId)
      : Promise.resolve(null),
    fetchReportFiles(organizationId, selected.reportId),
    fetchHrEmployees(organizationId),
    readUnits(organizationId, createClient()),
  ]);
  const accounts = accountsByReport.get(selected.reportId) ?? [];
  const subscriptions = subscriptionsByReport.get(selected.reportId) ?? [];
  const fees = feesByReport.get(selected.reportId) ?? [];
  const feeLines = feeLinesByReport.get(selected.reportId) ?? [];

  return {
    firmwideId: account.firmwideId,
    vendorId: account.vendorId,
    months,
    selected,
    accounts,
    subscriptions,
    fees,
    feeLines,
    previousSidKeys,
    hrMatches: matchHr(
      subscriptions.map((sub) => sub.lastUser),
      employees,
      buildUnitPaths(units),
    ),
    files,
  };
}

/** Half-open `[start, end)` as `yyyy-MM-dd`. */
export interface SidSeatWindow {
  start: string;
  end: string;
}

/** Bumped whenever the cached shape changes. */
const SEAT_SOURCES_CACHE_VERSION = 'v1';
// The key names the reports the entry was built from, and imports are the
// only writes: a new month changes the selection and --replace re-inserts
// the report under a new id. The TTL only bounds storage for keys no window
// asks for any more.
const SEAT_SOURCES_TTL_SECONDS = 86_400;

interface StoredSeatSources {
  gz: string;
}

// Leads with `org:<id>:` so clearOrganizationCache's `*org:<id>:*` sweep
// reaches it, and is never handed userMetadata on the way to Redis, which
// would prefix a `user:<id>:` copy per user.
function seatSourcesCacheKey(
  organizationId: string,
  firmwideId: number,
  reportIds: number[],
): string {
  return `org:${organizationId}:sid:sources:${SEAT_SOURCES_CACHE_VERSION}:${firmwideId}:${reportIds.join(',')}`;
}

async function readCachedSeatSources(
  key: string,
): Promise<SidSeatSource[] | null> {
  try {
    const cacheService = await getCacheService();
    const stored = await cacheService.redisService.get<StoredSeatSources>(key);
    if (!stored?.gz) {
      logger.debug({ key }, 'Cache miss for Bloomberg SID seat sources');
      return null;
    }
    const sources = JSON.parse(
      gunzipSync(Buffer.from(stored.gz, 'base64')).toString('utf8'),
    ) as SidSeatSource[];
    logger.debug({ key }, 'Cache hit for Bloomberg SID seat sources');
    return sources;
  } catch (error) {
    logger.warn({ err: error, key }, 'Discarding unreadable SID seat sources');
    return null;
  }
}

async function writeCachedSeatSources(
  key: string,
  sources: SidSeatSource[],
): Promise<void> {
  try {
    const cacheService = await getCacheService();
    await cacheService.redisService.set<StoredSeatSources>(
      key,
      { gz: gzipSync(Buffer.from(JSON.stringify(sources))).toString('base64') },
      undefined,
      SEAT_SOURCES_TTL_SECONDS,
    );
  } catch (error) {
    logger.warn({ err: error, key }, 'Failed to store SID seat sources');
  }
}

/**
 * The imported months a window's seat figures are priced from: every report
 * inside the window, plus the nearest one on each side — the earlier report
 * carries the term and exchange charges in force at the window's opening
 * months, the later one closes the last term the window can see. One query
 * per table over the whole set, never one round trip per report, and the
 * set is kept in Redis under the reports it was built from.
 */
export async function fetchSidSeatSources(
  organizationId: string,
  firmwideId: number,
  window: SidSeatWindow,
): Promise<SidSeatSource[]> {
  noStore();

  const months = await fetchSidReportMonths(organizationId, firmwideId);
  const before = months.filter((m) => m.reportMonth < window.start).pop();
  const selected = [
    ...(before ? [before] : []),
    ...months.filter(
      (m) => m.reportMonth >= window.start && m.reportMonth < window.end,
    ),
    ...months.filter((m) => m.reportMonth >= window.end).slice(0, 1),
  ];
  if (selected.length === 0) return [];

  const reportIds = selected.map((month) => month.reportId);
  const cacheKey = seatSourcesCacheKey(organizationId, firmwideId, reportIds);
  const cached = await readCachedSeatSources(cacheKey);
  if (cached) return cached;

  const [accounts, subscriptions, fees, feeLines] = await Promise.all([
    fetchAccounts(organizationId, reportIds),
    fetchSubscriptions(organizationId, reportIds),
    fetchFees(organizationId, reportIds),
    fetchFeeLinesByReport(organizationId, reportIds),
  ]);

  const sources = selected.map((month) => ({
    reportMonth: month.reportMonth,
    accounts: accounts.get(month.reportId) ?? [],
    subscriptions: subscriptions.get(month.reportId) ?? [],
    fees: fees.get(month.reportId) ?? [],
    feeLines: feeLines.get(month.reportId) ?? [],
  }));
  await writeCachedSeatSources(cacheKey, sources);
  return sources;
}

export async function fetchLatestSidProducts(
  organizationId: string,
  firmwideId: number,
): Promise<SidProductSummary[]> {
  noStore();

  const months = await fetchSidReportMonths(organizationId, firmwideId);
  const selected = selectMonth(months, null);
  if (!selected) return [];

  const [subscriptions, fees, feeLines] = await Promise.all([
    fetchSubscriptions(organizationId, [selected.reportId]),
    fetchFees(organizationId, [selected.reportId]),
    fetchFeeLinesByReport(organizationId, [selected.reportId]),
  ]);

  return buildSidProducts(
    subscriptions.get(selected.reportId) ?? [],
    selected.reportMonth,
    fees.get(selected.reportId) ?? [],
    feeLines.get(selected.reportId) ?? [],
  );
}
