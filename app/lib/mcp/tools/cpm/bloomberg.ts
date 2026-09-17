import { z } from 'zod';
import { requireMcpContext } from '@/app/lib/mcp/context';
import { paginate, paginationSchema } from '@/app/lib/mcp/pagination';
import type { McpToolDef } from '@/app/lib/mcp/tools/types';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import {
  fetchFirmwideAccounts,
  fetchSidReport,
  type FirmwideAccount,
} from '@/lib/v2/bloomberg-sid/queries';
import type {
  SidHrMatch,
  SidReport,
  SidUnitPath,
} from '@/lib/v2/bloomberg-sid/report';
import {
  HR_LEVELS,
  buildPermissionRows,
  cancelByIsoDate,
  costCenterPath,
  countryCityPath,
  deriveSidReport,
  hrLevelPath,
  isSidRenewingWithin,
  matchesSearch,
  nextSidRenewalDate,
  rollupCosts,
  sidSubscriptionInactiveReasons,
  type SidCostPath,
  type SidReportDerived,
} from '@/lib/v2/bloomberg-sid/transforms';
import {
  SEAT_INACTIVE_REASON_LABEL,
  type SeatInactiveReason,
} from '@/lib/v2/seats/status';
import { diffUTCDays, formatUTCDate, parseUTCDate } from '@/lib/v2/spend/dates';

const MONTH_PATTERN = /^\d{4}-\d{2}(-\d{2})?$/;

const NO_REPORTS_REASON =
  'No Bloomberg SID reports are loaded for this organization.';

const DATE_GUIDANCE =
  'Quote dates verbatim from this response. Do not paraphrase, round, or ' +
  'compute new dates from the ones returned. cancelByDate is the deadline to ' +
  'act on — 60 days before nextRenewalDate, the notice Bloomberg requires to ' +
  'drop a terminal — so anchor "renewing soon" and any advice to cancel on ' +
  'cancelByDate, not on the renewal date. A negative daysUntilCancelBy means ' +
  'that deadline has already passed for this term. renewalDate is the date ' +
  'the report records; nextRenewalDate is that date stepped forward by whole ' +
  'two-year terms when the recorded one is already in the past.';

const roundCents = (value: number): number => Math.round(value * 100) / 100;

const emptyReasonCounts = (): Record<SeatInactiveReason, number> => ({
  leaver: 0,
  on_leave: 0,
  not_in_hr: 0,
  dormant: 0,
});

interface SidToolContext {
  accounts: FirmwideAccount[];
  account: FirmwideAccount;
  report: SidReport;
}

type SidLoad =
  | { ok: true; data: SidToolContext }
  | { ok: false; reason: string };

/**
 * The report both tools read, cached per request so a turn that calls both
 * loads one month once.
 */
async function loadSidContext(options: {
  month?: string;
  vendorId?: number;
}): Promise<SidLoad> {
  const ctx = requireMcpContext();
  const organizationId = ctx.userMetadata.organizationId;
  const vendorId = options.vendorId;

  const accounts = await ctx.cache.getOrFetch(
    ChatToolCache.buildKey('sidFirmwideAccounts', {
      vendorId: vendorId ?? null,
    }),
    () =>
      fetchFirmwideAccounts(
        organizationId,
        vendorId === undefined ? {} : { vendorId },
      ),
  );
  const account = accounts[0];
  if (!account) {
    return {
      ok: false,
      reason:
        vendorId === undefined
          ? NO_REPORTS_REASON
          : `Vendor ${vendorId} has no Bloomberg firmwide account in this organization. Call again without \`vendor_id\` to read the organization's Bloomberg SID report, if one is loaded.`,
    };
  }

  const month = options.month ?? null;
  const report = await ctx.cache.getOrFetch(
    ChatToolCache.buildKey('sidReport', {
      firmwideId: account.firmwideId,
      month,
    }),
    () => fetchSidReport(organizationId, account, month),
  );
  if (!report) {
    return {
      ok: false,
      reason:
        month === null
          ? NO_REPORTS_REASON
          : `No Bloomberg SID report is loaded for ${month}. Call again without \`month\` for the latest imported report.`,
    };
  }

  return { ok: true, data: { accounts, account, report } };
}

function reportHeader({ accounts, account, report }: SidToolContext) {
  return {
    vendor: { id: account.vendorId, name: account.vendor.name },
    firmwideId: account.firmwideId,
    reportMonth: report.selected.reportMonth,
    availableMonths: report.months.map((month) => month.reportMonth),
    ...(accounts.length > 1
      ? {
          firmwideAccounts: accounts.map((entry) => ({
            firmwideId: entry.firmwideId,
            vendorId: entry.vendorId,
            vendorName: entry.vendor.name,
          })),
          note: `This organization bills through ${accounts.length} Bloomberg firmwide accounts; these figures cover firmwide account ${account.firmwideId} only. Pass vendor_id to read another one.`,
        }
      : {}),
  };
}

interface TerminalHr {
  matched: boolean;
  confidence: SidHrMatch['confidence'];
  employeeId: number | null;
  fullName: string | null;
  status: string | null;
  department: string | null;
  costCenter: string | null;
  unitPath: SidUnitPath | null;
}

interface TerminalRow {
  sid: number;
  sidInstNum: number;
  uuid: string;
  account: { custNum: number; name: string; country: string | null };
  product: { code: number; name: string };
  lastUser: string;
  hr: TerminalHr | null;
  status: 'active' | 'inactive';
  inactiveReasons: Array<{ code: SeatInactiveReason; label: string }>;
  inactiveLast90Days: boolean;
  contractDate: string;
  renewalDate: string;
  nextRenewalDate: string;
  cancelByDate: string;
  daysUntilCancelBy: number;
  monthlyPriceUSD: number;
  exchanges: Array<{
    code: string;
    name: string;
    monthlyCostUSD: number | null;
  }>;
  exchangeMonthlyCostUSD: number;
}

function terminalHr(match: SidHrMatch | undefined): TerminalHr | null {
  if (!match) return null;
  const employee = match.employee;
  return {
    matched: employee !== null,
    confidence: match.confidence,
    employeeId: employee?.id ?? null,
    fullName: employee?.fullName ?? null,
    status: employee?.status ?? null,
    department: employee?.department ?? null,
    costCenter: employee?.costCenter ?? null,
    unitPath: employee?.unitPath ?? null,
  };
}

function buildTerminalRows(
  report: SidReport,
  derived: SidReportDerived,
  today: Date,
): TerminalRow[] {
  const todayUTC = parseUTCDate(formatUTCDate(today));

  return buildPermissionRows(
    report.subscriptions,
    derived.accountsByCustNum,
    derived.allocationsBySid,
  ).map((permission) => {
    const sub = permission.sub;
    const reasons = sidSubscriptionInactiveReasons(sub, report.hrMatches);
    const nextRenewal = nextSidRenewalDate(sub.renewalDate, today);
    const cancelBy = cancelByIsoDate(nextRenewal);

    return {
      sid: sub.sid,
      sidInstNum: sub.sidInstNum,
      uuid: sub.serialNumber,
      account: {
        custNum: sub.custNum,
        name: permission.entityName,
        country: derived.accountsByCustNum.get(sub.custNum)?.country ?? null,
      },
      product: { code: sub.gptt, name: sub.gpttDescription },
      lastUser: sub.lastUser,
      hr: terminalHr(report.hrMatches[sub.lastUser]),
      status: reasons.length === 0 ? 'active' : 'inactive',
      inactiveReasons: reasons.map((code) => ({
        code,
        label: SEAT_INACTIVE_REASON_LABEL[code],
      })),
      inactiveLast90Days: sub.ninetyDay,
      contractDate: sub.contractDate,
      renewalDate: sub.renewalDate,
      nextRenewalDate: nextRenewal,
      cancelByDate: cancelBy,
      daysUntilCancelBy: diffUTCDays(parseUTCDate(cancelBy), todayUTC),
      monthlyPriceUSD: sub.price,
      exchanges: permission.allocs.map((allocation) => ({
        code: allocation.exchangeCode,
        name: allocation.exchangeName,
        monthlyCostUSD: allocation.proRate,
      })),
      exchangeMonthlyCostUSD: roundCents(permission.exchangeCost),
    };
  });
}

function terminalTotals(rows: TerminalRow[]) {
  const inactiveByReason = emptyReasonCounts();
  let active = 0;
  let terminalMonthlyCostUSD = 0;
  let exchangeMonthlyCostUSD = 0;
  let maskedExchangeLines = 0;

  for (const row of rows) {
    if (row.status === 'active') active += 1;
    for (const reason of row.inactiveReasons) {
      inactiveByReason[reason.code] += 1;
    }
    terminalMonthlyCostUSD += row.monthlyPriceUSD;
    exchangeMonthlyCostUSD += row.exchangeMonthlyCostUSD;
    maskedExchangeLines += row.exchanges.filter(
      (exchange) => exchange.monthlyCostUSD === null,
    ).length;
  }

  return {
    terminals: rows.length,
    active,
    inactive: rows.length - active,
    inactiveByReason,
    terminalMonthlyCostUSD: roundCents(terminalMonthlyCostUSD),
    exchangeMonthlyCostUSD: roundCents(exchangeMonthlyCostUSD),
    maskedExchangeLines,
  };
}

const monthField = z
  .string()
  .regex(MONTH_PATTERN)
  .optional()
  .describe(
    'Report month as YYYY-MM (or the first of the month as YYYY-MM-DD). Defaults to the latest imported month; the response lists availableMonths.',
  );

const vendorField = z
  .number()
  .int()
  .optional()
  .describe(
    "Restrict to the Bloomberg firmwide account of this vendor id (from list_vendors). Defaults to the organization's first firmwide account.",
  );

const listInput = z.object({
  month: monthField,
  vendor_id: vendorField,
  status: z
    .enum(['active', 'inactive'])
    .optional()
    .describe(
      'Only active terminals, or only inactive ones. A terminal is inactive when its holder has left, is on leave, is absent from the HR roster, or Bloomberg flagged the seat as unused for 90 days; inactiveReasons says which.',
    ),
  renewing_within_days: z
    .number()
    .int()
    .min(1)
    .max(730)
    .optional()
    .describe(
      'Only terminals whose next renewal falls within this many days of today. Sorts the result by next renewal date, soonest first. Read cancelByDate, not the renewal date, for the deadline to act on.',
    ),
  user: z
    .string()
    .optional()
    .describe(
      "Case-insensitive substring of the seat holder: the report's lastUser and the matched HR employee name.",
    ),
  product: z
    .string()
    .optional()
    .describe(
      'Case-insensitive substring of the terminal product name (e.g. "anywhere").',
    ),
  exchange: z
    .string()
    .optional()
    .describe(
      'Case-insensitive substring of an exchange code or name; returns the terminals permissioned on it.',
    ),
  sid: z
    .number()
    .int()
    .optional()
    .describe('Exact SID number. Returns every instance of that terminal.'),
  ...paginationSchema,
});

async function listBloombergTerminals(input: z.infer<typeof listInput>) {
  const load = await loadSidContext({
    month: input.month,
    vendorId: input.vendor_id,
  });
  if (!load.ok) return { found: false as const, reason: load.reason };

  const { report } = load.data;
  const today = new Date();
  const derived = deriveSidReport(report);
  const rows = buildTerminalRows(report, derived, today);

  const {
    status,
    renewing_within_days: renewingDays,
    user,
    product,
    exchange,
    sid,
  } = input;

  const filtered = rows.filter((row) => {
    if (status !== undefined && row.status !== status) return false;
    if (
      renewingDays !== undefined &&
      !isSidRenewingWithin(row.renewalDate, renewingDays, today)
    ) {
      return false;
    }
    if (
      user !== undefined &&
      !matchesSearch(user, [row.lastUser, row.hr?.fullName])
    ) {
      return false;
    }
    if (product !== undefined && !matchesSearch(product, [row.product.name])) {
      return false;
    }
    if (
      exchange !== undefined &&
      !row.exchanges.some((entitlement) =>
        matchesSearch(exchange, [entitlement.code, entitlement.name]),
      )
    ) {
      return false;
    }
    if (sid !== undefined && row.sid !== sid) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) =>
    renewingDays !== undefined && a.nextRenewalDate !== b.nextRenewalDate
      ? a.nextRenewalDate < b.nextRenewalDate
        ? -1
        : 1
      : a.sid - b.sid || a.sidInstNum - b.sidInstNum,
  );

  const page = paginate(sorted, input);

  return {
    found: true as const,
    ...reportHeader(load.data),
    dateGuidance: DATE_GUIDANCE,
    totals: terminalTotals(sorted),
    count: page.items.length,
    totalMatched: page.totalAvailable,
    nextCursor: page.nextCursor,
    terminals: page.items,
  };
}

const HR_GROUP_LEVELS = [
  'entity',
  'business_group',
  'division',
  'business_unit',
  'department',
  'team',
  'user',
] as const;

const GROUP_BY_KEYS = [
  ...HR_GROUP_LEVELS,
  'cost_center',
  'country',
  'product',
] as const;

type GroupBy = (typeof GROUP_BY_KEYS)[number];

const productPath: SidCostPath = (sub) => [sub.gpttDescription];

function groupSpec(
  groupBy: GroupBy,
  hrMatches: Record<string, SidHrMatch>,
): { path: SidCostPath; level: number; label: string } {
  const hrLevel = (HR_GROUP_LEVELS as readonly string[]).indexOf(groupBy);
  if (hrLevel >= 0) {
    return {
      path: hrLevelPath(hrMatches),
      level: hrLevel,
      label: HR_LEVELS[hrLevel],
    };
  }
  if (groupBy === 'cost_center') {
    return { path: costCenterPath(hrMatches), level: 0, label: 'Cost Center' };
  }
  if (groupBy === 'country') {
    return { path: countryCityPath, level: 0, label: 'Country' };
  }
  return { path: productPath, level: 0, label: 'Product' };
}

const DEFAULT_RENEWAL_WINDOW_DAYS = 90;

const spendInput = z.object({
  month: monthField,
  vendor_id: vendorField,
  renewing_within_days: z
    .number()
    .int()
    .min(1)
    .max(730)
    .default(DEFAULT_RENEWAL_WINDOW_DAYS)
    .describe(
      `Window for the renewing counts in totals.renewing. Default ${DEFAULT_RENEWAL_WINDOW_DAYS} days.`,
    ),
  group_by: z
    .enum(GROUP_BY_KEYS)
    .optional()
    .describe(
      "Roll the month up to one level and return `rows`. entity is the billing account on the report; business_group, division, business_unit, department, team and user come from the seat holder's place in the HR org chart; cost_center and country are the holder's cost centre and the billing account's country; product groups by terminal product. Omit for totals only.",
    ),
});

async function getBloombergSpend(input: z.infer<typeof spendInput>) {
  const load = await loadSidContext({
    month: input.month,
    vendorId: input.vendor_id,
  });
  if (!load.ok) return { found: false as const, reason: load.reason };

  const { report } = load.data;
  const today = new Date();
  const derived = deriveSidReport(report);
  const summary = derived.summary;
  const rows = buildTerminalRows(report, derived, today);
  const seatTotals = terminalTotals(rows);

  const renewing = rows.filter((row) =>
    isSidRenewingWithin(row.renewalDate, input.renewing_within_days, today),
  );

  const spec =
    input.group_by === undefined
      ? null
      : groupSpec(input.group_by, report.hrMatches);

  return {
    found: true as const,
    ...reportHeader(load.data),
    dateGuidance: DATE_GUIDANCE,
    totals: {
      terminals: summary.baseSubscriptions,
      terminalProducts: summary.productKinds,
      entitledTerminals: summary.uniqueSidsWithAllocations,
      terminalMonthlyCostUSD: summary.totalBaseSubscriptionPrice,
      exchangeMonthlyCostUSD: summary.knownExchangeChargesTotal,
      totalMonthlyCostUSD: summary.totalKnownCost,
      maskedExchangeLines: summary.maskedSidAllocationRows,
      maskedExchangeAggregates: summary.maskedAggregateRows,
      inactive: {
        terminals: seatTotals.inactive,
        byReason: seatTotals.inactiveByReason,
      },
      renewing: {
        withinDays: input.renewing_within_days,
        terminals: renewing.length,
        monthlyPriceUSD: roundCents(
          renewing.reduce((total, row) => total + row.monthlyPriceUSD, 0),
        ),
      },
    },
    ...(spec === null
      ? {}
      : {
          groupBy: input.group_by,
          groupByLabel: spec.label,
          rows: rollupCosts(
            report.subscriptions,
            derived.accountsByCustNum,
            derived.allocationsBySid,
            spec.path,
            spec.level,
            {},
          ).map((row) => ({
            key: row.key,
            terminals: row.subs,
            users: row.users,
            terminalCostUSD: roundCents(row.baseCost),
            exchangeCostUSD: roundCents(row.exchangeCost),
            totalUSD: roundCents(row.total),
          })),
        }),
  };
}

export const bloombergTools: McpToolDef[] = [
  {
    name: 'list_bloomberg_terminals',
    description:
      "Bloomberg (BBG) terminal seats from the organization's monthly SID report — one row per SID, and a SID is one terminal seat. " +
      'Use it for the BBG questions the contract tools cannot answer: which terminals renew soon (set renewing_within_days and quote cancelByDate), which are inactive and why (holder left, on leave, not in the HR roster, or no use in 90 days), who holds a terminal, which exchanges someone is permissioned on (filter `exchange`), and which terminals carry a given product. ' +
      'Terminal seats are imported from the vendor, not from contracts, so list_contracts, query_contracts and get_upcoming_renewals do not return them. ' +
      "Every amount is a MONTHLY figure in USD as billed on that report (fields suffixed `USD`): it is NOT the organization's base display currency and NOT contract spend, so never convert it or add it to figures from get_spend, list_vendors or get_contract. " +
      "Each row carries the matched HR employee (`hr`, with the org-chart path) when the report's user name resolves to the roster, the seat's exchange entitlements with their monthly pro-rated cost (null where the exchange bills the client directly and the report masks the amount), and its dates. " +
      'Filters compose, and `totals` covers the whole filtered set before paging. For month totals or a roll-up by department, HR level, cost centre, country or product, call get_bloomberg_spend instead. ' +
      'Defaults to the latest imported month; availableMonths lists the others. found:false means the organization has no SID report loaded. Paginated.',
    inputSchema: listInput,
    annotations: {
      title: 'Bloomberg terminals',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: listBloombergTerminals as McpToolDef['handler'],
  },
  {
    name: 'get_bloomberg_spend',
    description:
      "Bloomberg (BBG) spend for one month of the organization's SID report: terminal (SID) charges, exchange entitlement charges and their total, plus the month's inactive and renewing counts, and an optional roll-up when `group_by` is set. " +
      'Use it for "total BBG terminal spend", "total exchange spend", and "BBG cost by department / HR level / cost centre / country / product". ' +
      "Every amount is a MONTHLY figure in USD as billed on that report (fields suffixed `USD`): it is NOT the organization's base display currency and NOT the contract spend get_spend reports, so do not convert it or add it to those figures. Annualize (×12) only when the user asks for a yearly figure, and say that you did. " +
      'Exchange lines the exchange bills the client directly are masked in the report and carry no amount — maskedExchangeLines and maskedExchangeAggregates count them, so the exchange total is a floor rather than a complete figure; say so when it is non-zero. ' +
      'For the seat-level list (who holds which terminal, per-seat renewal and cancel-by dates, exchange entitlements per seat) call list_bloomberg_terminals. ' +
      'Defaults to the latest imported month; availableMonths lists the others. found:false means the organization has no SID report loaded.',
    inputSchema: spendInput,
    annotations: {
      title: 'Bloomberg spend',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getBloombergSpend as McpToolDef['handler'],
  },
];
