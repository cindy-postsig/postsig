import { differenceInCalendarDays, parseISO, subDays } from 'date-fns';
import type {
  InventoryActiveUser,
  InventoryItem,
} from '@/lib/v2/inventory/types';
import { isOrgUnitTreeLevel } from '@/lib/v2/org-units/levels';
import type { OrgUnitNode } from '@/lib/v2/org-units/tree';
import {
  seatInactiveReasons,
  type SeatInactiveReason,
} from '@/lib/v2/seats/status';
import type { SeatRoster } from '@/lib/v2/seats/types';
import {
  addUTCDays,
  addUTCMonths,
  formatUTCDate,
  parseUTCDate,
} from '@/lib/v2/spend/dates';
import { SID_ROLLUP_PRODUCT_NAME, sidRollupKey } from './keys';
import {
  sidKey,
  type SidAccount,
  type SidExchangeFee,
  type SidExchangeFeeLine,
  type SidHrEmployee,
  type SidHrMatch,
  type SidKey,
  type SidProductHolder,
  type SidProductSummary,
  type SidReport,
  type SidSubscription,
  type SidUnitPath,
} from './report';

const CANCELLATION_NOTICE_DAYS = 60;

// Product ruling: Bloomberg renewal terms are two years, so a seat whose
// recorded renewal date has passed renews again on that anniversary.
export const SID_RENEWAL_TERM_MONTHS = 24;

const roundCents = (value: number): number => Number(value.toFixed(2));

const sum = (values: number[]): number =>
  values.reduce((total, value) => total + value, 0);

export interface SidAggregate extends SidExchangeFee {
  priceMasked: boolean;
}

export interface SidAllocation {
  feeId: number;
  feeKind: SidExchangeFee['feeKind'];
  custNum: number;
  rptMonth: string;
  exchangeCode: string;
  exchangeName: string;
  sid: number;
  sidInstNum: number;
  proRate: number | null;
  priceMasked: boolean;
  eidNumber: number;
}

export interface SidEntityRollup {
  custNum: number;
  name: string;
  city: string;
  country: string;
  currencyCode: string;
  taxRate: number;
  auto: number;
  term: number;
  baseSubs: number;
  baseCost: number;
  uniqueExchangeProducts: number;
  allocationRows: number;
  allocationKnownRows: number;
  allocationMaskedRows: number;
  allocationKnownCost: number;
  totalKnownCost: number;
}

export interface SidSummary {
  entities: number;
  baseSubscriptions: number;
  uniqueLastUsers: number;
  productKinds: number;
  totalBaseSubscriptionPrice: number;
  priceDistribution: Record<number, number>;
  productMix: Record<string, number>;
  uniqueExchangeProducts: number;
  sidAllocationRows: number;
  uniqueSidsWithAllocations: number;
  baseOnlySubs: number;
  knownExchangeChargesTotal: number;
  maskedAggregateRows: number;
  maskedSidAllocationRows: number;
  totalKnownCost: number;
}

export interface SidPermissionRow {
  sub: SidSubscription;
  entityName: string;
  allocs: SidAllocation[];
  exchangeCost: number;
  masked: boolean;
  totalCost: number;
}

export interface SidTopExchangeByCost {
  code: string;
  name: string;
  price: number;
}

export interface SidTopExchangeByCount {
  code: string;
  name: string;
  subs: number;
  masked: boolean;
}

export interface SidCostRollupRow {
  key: string;
  subs: number;
  users: number;
  baseCost: number;
  exchangeCost: number;
  total: number;
}

export interface SidReportDerived {
  aggregates: SidAggregate[];
  /** Exchange-kind lines only; every cost surface reads these. */
  allocations: SidAllocation[];
  /** Lines booked under an admin fee, kept out of every exchange total. */
  adminAllocations: SidAllocation[];
  allocationsBySid: Map<SidKey, SidAllocation[]>;
  accountsByCustNum: Map<number, SidAccount>;
  entityRollup: SidEntityRollup[];
  summary: SidSummary;
  previousSidKeys: Set<SidKey> | null;
}

/** Admin fees are billed outside the exchange view. */
export function buildAggregates(fees: SidExchangeFee[]): SidAggregate[] {
  return fees
    .filter((fee) => fee.feeKind === 'exchange')
    .map((fee) => ({ ...fee, priceMasked: fee.totalPrice === null }));
}

export function buildAllocations(
  fees: SidExchangeFee[],
  lines: SidExchangeFeeLine[],
): SidAllocation[] {
  const feesById = new Map(fees.map((fee) => [fee.id, fee]));

  return lines.flatMap((line) => {
    const fee = feesById.get(line.feeId);
    if (!fee) return [];
    return [
      {
        feeId: line.feeId,
        feeKind: fee.feeKind,
        custNum: fee.custNum,
        rptMonth: fee.rptMonth,
        exchangeCode: fee.exchangeCode,
        exchangeName: fee.exchangeName,
        sid: line.sid,
        sidInstNum: line.sidInstNum,
        proRate: line.proRate,
        priceMasked: line.proRate === null,
        eidNumber: line.eidNumber,
      },
    ];
  });
}

export function groupAllocationsBySid(
  allocations: SidAllocation[],
): Map<SidKey, SidAllocation[]> {
  const bySid = new Map<SidKey, SidAllocation[]>();
  for (const allocation of allocations) {
    const key = sidKey(allocation.sid, allocation.sidInstNum);
    const existing = bySid.get(key);
    if (existing) {
      existing.push(allocation);
    } else {
      bySid.set(key, [allocation]);
    }
  }
  return bySid;
}

function groupByCustNum<T>(
  items: T[],
  custNumOf: (item: T) => number | undefined,
): Map<number, T[]> {
  const byCustNum = new Map<number, T[]>();
  for (const item of items) {
    const custNum = custNumOf(item);
    if (custNum === undefined) continue;
    const existing = byCustNum.get(custNum);
    if (existing) {
      existing.push(item);
    } else {
      byCustNum.set(custNum, [item]);
    }
  }
  return byCustNum;
}

export function buildEntityRollup(
  accounts: SidAccount[],
  subscriptions: SidSubscription[],
  allocations: SidAllocation[],
): SidEntityRollup[] {
  const subsByCustNum = groupByCustNum(subscriptions, (sub) => sub.custNum);

  // Exchange charges belong to the account that owns the SID in the month-end
  // inventory, not to the account the fee row was booked under. A SID missing
  // from the inventory (seat swapped mid-month) rolls up to nobody.
  const ownerBySid = new Map<SidKey, number>(
    subscriptions.map((sub) => [sidKey(sub.sid, sub.sidInstNum), sub.custNum]),
  );
  const allocsByCustNum = groupByCustNum(allocations, (allocation) =>
    ownerBySid.get(sidKey(allocation.sid, allocation.sidInstNum)),
  );

  return accounts.map((account) => {
    const subs = subsByCustNum.get(account.custNum) ?? [];
    const allocs = allocsByCustNum.get(account.custNum) ?? [];
    const known = allocs.filter((allocation) => !allocation.priceMasked);

    const baseCost = sum(subs.map((sub) => sub.price));
    const knownCost = sum(known.map((allocation) => allocation.proRate ?? 0));

    return {
      custNum: account.custNum,
      name: account.name,
      city: account.city,
      country: account.country,
      currencyCode: account.currencyCode,
      taxRate: account.taxRate,
      auto: account.auto,
      term: account.term,
      baseSubs: subs.length,
      baseCost,
      uniqueExchangeProducts: new Set(allocs.map((a) => a.exchangeCode)).size,
      allocationRows: allocs.length,
      allocationKnownRows: known.length,
      allocationMaskedRows: allocs.length - known.length,
      allocationKnownCost: roundCents(knownCost),
      totalKnownCost: roundCents(baseCost + knownCost),
    };
  });
}

export function buildSummary(
  report: SidReport,
  aggregates: SidAggregate[],
  allocations: SidAllocation[],
  rollup: SidEntityRollup[],
): SidSummary {
  const { accounts, subscriptions } = report;

  const priceDistribution: Record<number, number> = {};
  const productMix: Record<string, number> = {};
  const lastUsers = new Set<string>();
  const productKinds = new Set<number>();

  for (const sub of subscriptions) {
    priceDistribution[sub.price] = (priceDistribution[sub.price] ?? 0) + 1;
    productMix[sub.gpttDescription] =
      (productMix[sub.gpttDescription] ?? 0) + 1;
    lastUsers.add(sub.lastUser);
    productKinds.add(sub.gptt);
  }

  const allocatedSids = new Set<SidKey>(
    allocations.map((allocation) =>
      sidKey(allocation.sid, allocation.sidInstNum),
    ),
  );

  return {
    entities: accounts.length,
    baseSubscriptions: subscriptions.length,
    uniqueLastUsers: lastUsers.size,
    productKinds: productKinds.size,
    totalBaseSubscriptionPrice: roundCents(sum(rollup.map((r) => r.baseCost))),
    priceDistribution,
    productMix,
    uniqueExchangeProducts: new Set(aggregates.map((a) => a.exchangeCode)).size,
    sidAllocationRows: allocations.length,
    uniqueSidsWithAllocations: allocatedSids.size,
    baseOnlySubs: subscriptions.filter(
      (sub) => !allocatedSids.has(sidKey(sub.sid, sub.sidInstNum)),
    ).length,
    knownExchangeChargesTotal: roundCents(
      sum(rollup.map((r) => r.allocationKnownCost)),
    ),
    maskedAggregateRows: aggregates.filter((a) => a.priceMasked).length,
    maskedSidAllocationRows: allocations.filter((a) => a.priceMasked).length,
    totalKnownCost: roundCents(sum(rollup.map((r) => r.totalKnownCost))),
  };
}

export function deriveSidReport(report: SidReport): SidReportDerived {
  const aggregates = buildAggregates(report.fees);
  const lineAllocations = buildAllocations(report.fees, report.feeLines);
  const allocations = lineAllocations.filter(
    (allocation) => allocation.feeKind === 'exchange',
  );
  const adminAllocations = lineAllocations.filter(
    (allocation) => allocation.feeKind !== 'exchange',
  );
  const entityRollup = buildEntityRollup(
    report.accounts,
    report.subscriptions,
    allocations,
  );

  return {
    aggregates,
    allocations,
    adminAllocations,
    allocationsBySid: groupAllocationsBySid(allocations),
    accountsByCustNum: new Map(
      report.accounts.map((account) => [account.custNum, account]),
    ),
    entityRollup,
    summary: buildSummary(report, aggregates, allocations, entityRollup),
    previousSidKeys: report.previousSidKeys
      ? new Set(report.previousSidKeys)
      : null,
  };
}

export function buildPermissionRows(
  subscriptions: SidSubscription[],
  accountsByCustNum: Map<number, SidAccount>,
  allocationsBySid: Map<SidKey, SidAllocation[]>,
): SidPermissionRow[] {
  return subscriptions.map((sub) => {
    const allocs = allocationsBySid.get(sidKey(sub.sid, sub.sidInstNum)) ?? [];
    const exchangeCost = sum(allocs.map((a) => a.proRate ?? 0));

    return {
      sub,
      entityName: accountsByCustNum.get(sub.custNum)?.name ?? '—',
      allocs,
      exchangeCost,
      masked: allocs.some((a) => a.priceMasked),
      totalCost: sub.price + exchangeCost,
    };
  });
}

export function topExchangesByKnownCost(
  aggregates: SidAggregate[],
  limit = 10,
): SidTopExchangeByCost[] {
  const byCode = new Map<string, SidTopExchangeByCost>();

  for (const aggregate of aggregates) {
    const existing = byCode.get(aggregate.exchangeCode) ?? {
      code: aggregate.exchangeCode,
      name: aggregate.exchangeName,
      price: 0,
    };
    existing.price += aggregate.totalPrice ?? 0;
    byCode.set(aggregate.exchangeCode, existing);
  }

  return Array.from(byCode.values())
    .filter((exchange) => exchange.price !== 0)
    .sort((a, b) => b.price - a.price)
    .slice(0, limit);
}

export function topExchangesByCount(
  aggregates: SidAggregate[],
  limit = 10,
): SidTopExchangeByCount[] {
  const byCode = new Map<string, SidTopExchangeByCount>();

  for (const aggregate of aggregates) {
    const existing = byCode.get(aggregate.exchangeCode) ?? {
      code: aggregate.exchangeCode,
      name: aggregate.exchangeName,
      subs: 0,
      masked: true,
    };
    existing.subs += aggregate.subscriptions;
    if (!aggregate.priceMasked) existing.masked = false;
    byCode.set(aggregate.exchangeCode, existing);
  }

  return Array.from(byCode.values())
    .sort((a, b) => b.subs - a.subs)
    .slice(0, limit);
}

export function cancelByDate(renewalDate: string): Date {
  return subDays(parseISO(renewalDate), CANCELLATION_NOTICE_DAYS);
}

/**
 * The same cancel-by rule as a `yyyy-MM-dd` string, worked in UTC so a
 * server east of Greenwich does not land it a day early.
 */
export function cancelByIsoDate(renewalDate: string): string {
  return formatUTCDate(
    addUTCDays(parseUTCDate(renewalDate), -CANCELLATION_NOTICE_DAYS),
  );
}

/**
 * The next date a seat renews on or after `today`: its recorded renewal
 * date, or that date stepped forward by whole two-year terms when the
 * reports have not caught up with a renewal that already happened. Compared
 * on UTC calendar days, as the renewals report does.
 */
export function nextSidRenewalDate(renewalDate: string, today: Date): string {
  const start = parseUTCDate(formatUTCDate(today));
  const renewal = parseUTCDate(renewalDate);
  let next = renewal;
  for (let step = 1; next < start; step += 1) {
    next = addUTCMonths(renewal, SID_RENEWAL_TERM_MONTHS * step);
  }
  return formatUTCDate(next);
}

/**
 * Whether a seat's next renewal falls within `days` of `today`, inclusive:
 * the renewals report's window rule, so the inventory view's "renewing"
 * filter lists exactly the seats the report counted.
 */
export function isSidRenewingWithin(
  renewalDate: string,
  days: number,
  today: Date,
): boolean {
  const next = nextSidRenewalDate(renewalDate, today);
  return (
    next >= formatUTCDate(today) &&
    next <= formatUTCDate(addUTCDays(today, days))
  );
}

/**
 * Why a terminal's seat is underutilized, from its holder's roster status and
 * Bloomberg's own 90-day flag; empty for an active one. The roster read
 * leaves deleted employees out, so a matched employee is never deleted.
 */
export function sidSubscriptionInactiveReasons(
  sub: Pick<SidSubscription, 'lastUser' | 'ninetyDay'>,
  hrMatches: Record<string, SidHrMatch>,
): SeatInactiveReason[] {
  const employee = hrMatches[sub.lastUser]?.employee ?? null;
  return seatInactiveReasons(
    employee ? { status: employee.status, deleted_at: null } : undefined,
    sub.ninetyDay,
  );
}

/**
 * The tabs' search box: a case-insensitive substring match against a row's
 * searchable values (SID, UUID, last user, exchange). Blank matches all.
 */
export function matchesSearch(
  query: string,
  values: ReadonlyArray<string | number | null | undefined>,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return values.some(
    (value) => value != null && String(value).toLowerCase().includes(needle),
  );
}

export function isWithinDaysOfToday(
  date: Date,
  days: number,
  today: Date = new Date(),
): boolean {
  return Math.abs(differenceInCalendarDays(date, today)) <= days;
}

export function isNewSid(
  sub: SidSubscription,
  previousSidKeys: Set<SidKey> | null,
): boolean {
  if (!previousSidKeys) return false;
  return !previousSidKeys.has(sidKey(sub.sid, sub.sidInstNum));
}

export const HR_LEVELS = [
  'Entity',
  'Business Group',
  'Division',
  'Business Unit',
  'Department',
  'Team',
  'User',
] as const;

export function buildUnitPaths(units: OrgUnitNode[]): Map<number, SidUnitPath> {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const paths = new Map<number, SidUnitPath>();

  for (const unit of units) {
    if (unit.level === 'cost_center') continue;

    const path: SidUnitPath = {};
    // The parent FK cannot express acyclicity, so a corrupt chain must
    // terminate the walk rather than hang it.
    const visited = new Set<number>();
    let current: OrgUnitNode | undefined = unit;
    while (current && !visited.has(current.id)) {
      if (isOrgUnitTreeLevel(current.level)) path[current.level] = current.name;
      visited.add(current.id);
      current =
        current.parent_id === null ? undefined : byId.get(current.parent_id);
    }
    paths.set(unit.id, path);
  }

  return paths;
}

const normalizeName = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').toLowerCase();

const lastWord = (name: string): string => name.split(' ').slice(-1)[0] ?? '';

function toMatchedEmployee(
  employee: SidHrEmployee,
  unitPaths: Map<number, SidUnitPath>,
): NonNullable<SidHrMatch['employee']> {
  return {
    id: employee.id,
    fullName: `${employee.firstName} ${employee.lastName}`,
    department: employee.department,
    costCenter: employee.costCenter,
    status: employee.status,
    unitPath:
      employee.orgUnitId === null
        ? {}
        : (unitPaths.get(employee.orgUnitId) ?? {}),
  };
}

export function matchHr(
  lastUsers: Iterable<string>,
  employees: SidHrEmployee[],
  unitPaths: Map<number, SidUnitPath>,
): Record<string, SidHrMatch> {
  const fullNameOf = (employee: SidHrEmployee) =>
    normalizeName(`${employee.firstName} ${employee.lastName}`);
  const lastNameOf = (employee: SidHrEmployee) =>
    normalizeName(employee.lastName);

  const fullNameCounts = new Map<string, number>();
  const surnameCounts = new Map<string, number>();
  for (const employee of employees) {
    const fullName = fullNameOf(employee);
    fullNameCounts.set(fullName, (fullNameCounts.get(fullName) ?? 0) + 1);
    const lastName = lastNameOf(employee);
    if (lastName) {
      surnameCounts.set(lastName, (surnameCounts.get(lastName) ?? 0) + 1);
    }
  }

  // A name two people share cannot pick between them, so it matches nobody.
  const byFullName = new Map<string, SidHrEmployee>();
  const byLastName = new Map<string, SidHrEmployee>();
  for (const employee of employees) {
    const fullName = fullNameOf(employee);
    if (fullNameCounts.get(fullName) === 1) byFullName.set(fullName, employee);
    const lastName = lastNameOf(employee);
    if (surnameCounts.get(lastName) === 1) byLastName.set(lastName, employee);
  }

  const matches: Record<string, SidHrMatch> = {};

  for (const lastUser of new Set(lastUsers)) {
    const normalized = normalizeName(lastUser);
    const exact = byFullName.get(normalized);
    const fuzzy = exact ? undefined : byLastName.get(lastWord(normalized));
    const employee = exact ?? fuzzy;

    matches[lastUser] = {
      confidence: exact
        ? 'Exact name'
        : fuzzy
          ? 'Fuzzy name'
          : 'Missing HR match',
      employee: employee ? toMatchedEmployee(employee, unitPaths) : null,
    };
  }

  return matches;
}

export type SidCostPath = (
  sub: SidSubscription,
  account: SidAccount | undefined,
) => string[];

export const countryCityPath: SidCostPath = (_sub, account) => [
  account?.country ?? '—',
  account?.city ?? '—',
];

/** Entity comes from the SID account; the rest of the chain from the org chart. */
export function hrLevelPath(
  hrMatches: Record<string, SidHrMatch>,
): SidCostPath {
  return (sub, account) => {
    const employee = hrMatches[sub.lastUser]?.employee ?? null;
    const unitPath = employee?.unitPath ?? {};

    return [
      account?.name ?? '—',
      unitPath.business_group ?? '—',
      unitPath.division ?? '—',
      unitPath.business_unit ?? '—',
      unitPath.department ?? employee?.department ?? '—',
      unitPath.team ?? '—',
      sub.lastUser,
    ];
  };
}

export function costCenterPath(
  hrMatches: Record<string, SidHrMatch>,
): SidCostPath {
  return (sub) => [hrMatches[sub.lastUser]?.employee?.costCenter ?? '—'];
}

export function rollupCosts(
  subscriptions: SidSubscription[],
  accountsByCustNum: Map<number, SidAccount>,
  allocationsBySid: Map<SidKey, SidAllocation[]>,
  path: SidCostPath,
  groupLevel: number,
  filters: Record<number, string>,
): SidCostRollupRow[] {
  const filterEntries = Object.entries(filters).map(
    ([level, value]) => [Number(level), value] as const,
  );

  interface Group extends Omit<SidCostRollupRow, 'users'> {
    users: Set<string>;
  }
  const groups = new Map<string, Group>();

  for (const sub of subscriptions) {
    const segments = path(sub, accountsByCustNum.get(sub.custNum));
    if (!filterEntries.every(([level, value]) => segments[level] === value)) {
      continue;
    }

    const key = segments[groupLevel];
    if (!key) continue;

    const group = groups.get(key) ?? {
      key,
      subs: 0,
      users: new Set<string>(),
      baseCost: 0,
      exchangeCost: 0,
      total: 0,
    };

    const allocs = allocationsBySid.get(sidKey(sub.sid, sub.sidInstNum)) ?? [];
    const exchangeCost = sum(allocs.map((a) => a.proRate ?? 0));

    group.subs += 1;
    group.baseCost += sub.price;
    group.exchangeCost += exchangeCost;
    group.total += sub.price + exchangeCost;
    group.users.add(sub.lastUser);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => ({ ...group, users: group.users.size }))
    .sort((a, b) => b.total - a.total);
}

export function currencyLabel(code: string | null): string {
  if (code === null) return '—';
  return code === 'D' ? 'USD' : code;
}

/**
 * The month's priced exchange lines per seat: exchange-kind fees only, with a
 * known pro-rate. Admin fees and masked lines carry no seat cost.
 */
function exchangeCostBySeat(
  fees: SidExchangeFee[],
  feeLines: SidExchangeFeeLine[],
): Map<SidKey, number> {
  const exchangeFeeIds = new Set(
    fees.filter((fee) => fee.feeKind === 'exchange').map((fee) => fee.id),
  );
  const bySeat = new Map<SidKey, number>();
  for (const line of feeLines) {
    if (!exchangeFeeIds.has(line.feeId) || line.proRate === null) continue;
    const key = sidKey(line.sid, line.sidInstNum);
    bySeat.set(key, (bySeat.get(key) ?? 0) + line.proRate);
  }
  return bySeat;
}

export function buildSidProducts(
  subscriptions: SidSubscription[],
  reportMonth: string,
  fees: SidExchangeFee[] = [],
  feeLines: SidExchangeFeeLine[] = [],
): SidProductSummary[] {
  const byGptt = new Map<number, SidProductSummary>();
  const exchangeCost = exchangeCostBySeat(fees, feeLines);

  for (const sub of subscriptions) {
    const seatExchange = exchangeCost.get(sidKey(sub.sid, sub.sidInstNum));
    const existing: SidProductSummary = byGptt.get(sub.gptt) ?? {
      gptt: sub.gptt,
      description: sub.gpttDescription,
      seats: 0,
      monthlyCost: 0,
      entitlementsCost: 0,
      entitledSeats: 0,
      reportMonth,
      holders: [],
      earliestContractDate: sub.contractDate,
      latestRenewalDate: sub.renewalDate,
    };
    existing.seats += 1;
    existing.monthlyCost += sub.price;
    if (sub.contractDate < existing.earliestContractDate) {
      existing.earliestContractDate = sub.contractDate;
    }
    if (sub.renewalDate > existing.latestRenewalDate) {
      existing.latestRenewalDate = sub.renewalDate;
    }
    if (seatExchange !== undefined) {
      existing.entitlementsCost += seatExchange;
      existing.entitledSeats += 1;
    }
    existing.holders.push({ name: sub.lastUser, dormant: sub.ninetyDay });
    byGptt.set(sub.gptt, existing);
  }

  return Array.from(byGptt.values())
    .map((product) => ({
      ...product,
      monthlyCost: roundCents(product.monthlyCost),
      entitlementsCost: roundCents(product.entitlementsCost),
      holders: [...product.holders].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    }))
    .sort((a, b) => b.seats - a.seats);
}

/** A product's monthly figure with its terminals' exchange charges folded in. */
export const sidProductTotalCost = (product: SidProductSummary): number =>
  product.monthlyCost + product.entitlementsCost;

/**
 * The span of the seats' terms across every product: the first contract
 * date to the last renewal date, `yyyy-MM-dd`. What the vendor header reads
 * as the relationship's start and projected end when the vendor's only
 * contracts are its invoices.
 */
export function sidProductTermBounds(
  products: readonly SidProductSummary[],
): { start: string; end: string } | null {
  if (products.length === 0) return null;
  return {
    start: products
      .map((product) => product.earliestContractDate)
      .reduce((earliest, date) => (date < earliest ? date : earliest)),
    end: products
      .map((product) => product.latestRenewalDate)
      .reduce((latest, date) => (date > latest ? date : latest)),
  };
}

function sidActiveUser(
  name: string,
  index: number,
  gptt: number,
): InventoryActiveUser {
  return {
    id: index,
    name,
    email: null,
    product_id: gptt,
    employee_id: null,
    region: null,
    country: null,
    division: null,
    department: null,
    cost_center: null,
    entity: null,
    business_unit: null,
    team: null,
    businessGroup: null,
    start_date: null,
    leave_date: null,
    org_employee_id: null,
  };
}

const holderNames = (products: readonly SidProductSummary[]): string[] =>
  products.flatMap((product) => product.holders.map((holder) => holder.name));

/**
 * The seats of a product that count as in use. The roster answers for the
 * person; the 90-day flag is the seat's own, so a dormant terminal is left
 * out however active the person holding it.
 */
const activeHolders = (
  product: SidProductSummary,
  isActive: (name: string) => boolean,
): SidProductHolder[] =>
  product.holders.filter((holder) => isActive(holder.name) && !holder.dormant);

/**
 * SID products as inventory rows so a vendor's product list is one list.
 * Dates are blank because seats renew on their own dates rather than the
 * product's, and every figure is stamped USD — the SID surfaces already
 * assume it, a known limitation of the import. Active users are seats, not
 * names: one per seat in use, in the unit Licenses counts.
 */
export function sidProductInventoryItems(
  products: SidProductSummary[],
  vendor: { id: number; name: string; domain: string | null },
  roster: SeatRoster,
): InventoryItem[] {
  const isActive = roster.matchActiveNames(holderNames(products));
  return products.map((product) => {
    const annualCost = roundCents(sidProductTotalCost(product) * 12);

    return {
      id: `sid:${product.gptt}`,
      vendor: vendor.name,
      vendorId: vendor.id,
      vendorDomain: vendor.domain ?? undefined,
      productName: [product.description],
      licensesCount: product.seats,
      endUsers: '',
      startDate: '',
      endDate: '',
      cost: annualCost,
      costNative: annualCost,
      currency: 'USD',
      deliveryMethods: [],
      status: 'Active',
      activeUsers: activeHolders(product, isActive).map((holder, index) =>
        sidActiveUser(holder.name, index, product.gptt),
      ),
      source: 'bloomberg-sid',
    };
  });
}

/**
 * The Inventory tab's one Bloomberg row: every SID product rolled up under
 * the vendor, in the same USD terms as the per-product rows above. null when
 * the vendor has no products in its latest report. Active users count per
 * seat, so a person on a terminal and an entitlement counts twice, the way
 * Licenses does.
 */
export function sidVendorInventoryItem(
  products: SidProductSummary[],
  vendor: { id: number; name: string; domain: string | null },
  roster: SeatRoster,
): InventoryItem | null {
  if (products.length === 0) return null;

  const annualCost = roundCents(sum(products.map(sidProductTotalCost)) * 12);
  const isActive = roster.matchActiveNames(holderNames(products));
  const activeSeats = products.flatMap((product) =>
    activeHolders(product, isActive).map((holder) => ({
      name: holder.name,
      gptt: product.gptt,
    })),
  );

  return {
    id: sidRollupKey(vendor.id),
    vendor: vendor.name,
    vendorId: vendor.id,
    vendorDomain: vendor.domain ?? undefined,
    productName: [SID_ROLLUP_PRODUCT_NAME],
    licensesCount: sum(products.map((product) => product.seats)),
    endUsers: '',
    startDate: '',
    endDate: '',
    cost: annualCost,
    costNative: annualCost,
    currency: 'USD',
    deliveryMethods: [],
    status: 'Active',
    activeUsers: activeSeats.map(({ name, gptt }, index) =>
      sidActiveUser(name, index, gptt),
    ),
    source: 'bloomberg-sid',
  };
}
