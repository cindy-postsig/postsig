import type {
  SidAccount,
  SidExchangeFee,
  SidExchangeFeeLine,
  SidHrEmployee,
  SidProductSummary,
  SidReport,
  SidSubscription,
} from '@/lib/v2/bloomberg-sid/report';
import { sidKey } from '@/lib/v2/bloomberg-sid/report';
import type { OrgUnitNode } from '@/lib/v2/org-units/tree';
import type { SeatRoster } from '@/lib/v2/seats/types';
import {
  buildAggregates,
  buildAllocations,
  buildEntityRollup,
  buildPermissionRows,
  buildSidProducts,
  buildSummary,
  buildUnitPaths,
  cancelByDate,
  cancelByIsoDate,
  costCenterPath,
  countryCityPath,
  currencyLabel,
  deriveSidReport,
  groupAllocationsBySid,
  hrLevelPath,
  isNewSid,
  isSidRenewingWithin,
  isWithinDaysOfToday,
  matchHr,
  matchesSearch,
  nextSidRenewalDate,
  rollupCosts,
  sidProductInventoryItems,
  sidProductTermBounds,
  sidProductTotalCost,
  sidSubscriptionInactiveReasons,
  sidVendorInventoryItem,
  topExchangesByCount,
  topExchangesByKnownCost,
} from '@/lib/v2/bloomberg-sid/transforms';

const ACCOUNTS: SidAccount[] = [
  {
    custNum: 100,
    name: 'Alpha Ltd',
    city: 'London',
    state: 'ENG',
    country: 'GB',
    currencyCode: 'D',
    taxRate: 20,
    auto: 2,
    term: 2,
  },
  {
    custNum: 200,
    name: 'Beta AG',
    city: 'Zurich',
    state: null,
    country: 'CH',
    currencyCode: 'D',
    taxRate: 8.1,
    auto: 2,
    term: 2,
  },
  {
    custNum: 300,
    name: 'Gamma SA',
    city: 'Paris',
    state: null,
    country: 'FR',
    currencyCode: 'D',
    taxRate: 20,
    auto: 1,
    term: 1,
  },
];

const subscription = (
  custNum: number,
  sid: number,
  sidInstNum: number,
  lastUser: string,
  price: number,
  gptt: number,
): SidSubscription => ({
  custNum,
  sid,
  sidInstNum,
  contractDate: '2020-03-02',
  renewalDate: '2026-03-02',
  lastUser,
  sidType: 1,
  sidDescription: 'Subscription',
  gptt,
  gpttDescription: gptt === 28 ? 'Bloomberg Anywhere' : 'Open Bloomberg',
  serialNumber: `SN-${sid}`,
  ws: null,
  ninetyDay: false,
  special: null,
  price,
  poNumber: null,
});

const SUBSCRIPTIONS: SidSubscription[] = [
  subscription(100, 1001, 1, 'user a', 2215, 28),
  subscription(100, 1002, 1, 'user a', 2215, 28),
  subscription(200, 1003, 1, 'user b', 2360, 28),
  subscription(200, 1004, 1, 'user c', 2360, 30),
  subscription(300, 1005, 1, 'user d', 0, 28),
  subscription(300, 1006, 2, 'user e', 2215, 30),
];

const FEES: SidExchangeFee[] = [
  {
    id: 1,
    custNum: 100,
    rptMonth: '2026-02-01',
    feeKind: 'exchange',
    exchangeCode: 'EBBO',
    exchangeName: 'Eurex Ultra',
    subscriptions: 2,
    currencyCode: 'D',
    totalPrice: 300,
    contributorBills: false,
  },
  {
    id: 2,
    custNum: 100,
    rptMonth: '2026-02-01',
    feeKind: 'exchange',
    exchangeCode: 'UK1',
    exchangeName: 'London Stock Exchange Level 1',
    subscriptions: 2,
    currencyCode: null,
    totalPrice: null,
    contributorBills: false,
  },
  {
    id: 3,
    custNum: 200,
    rptMonth: '2026-02-01',
    feeKind: 'exchange',
    exchangeCode: 'EBBO',
    exchangeName: 'Eurex Ultra',
    subscriptions: 1,
    currencyCode: 'D',
    totalPrice: 150,
    contributorBills: false,
  },
  {
    id: 4,
    custNum: 300,
    rptMonth: '2026-02-01',
    feeKind: 'admin',
    exchangeCode: 'ADM1',
    exchangeName: 'Enablement Fee',
    subscriptions: 1,
    currencyCode: 'D',
    totalPrice: 50,
    contributorBills: false,
  },
];

const line = (
  feeId: number,
  sid: number,
  sidInstNum: number,
  proRate: number | null,
  eidNumber: number,
): SidExchangeFeeLine => ({
  feeId,
  sid,
  sidInstNum,
  proRate,
  contributorBills: false,
  eidNumber,
});

const FEE_LINES: SidExchangeFeeLine[] = [
  line(1, 1001, 1, 100, 900),
  line(1, 1003, 1, 200, 900),
  line(2, 1001, 1, null, 901),
  line(2, 1002, 1, null, 901),
  line(3, 9999, 1, 150, 900),
  line(4, 1005, 1, 50, 902),
  line(99, 1006, 2, 25, 903),
  line(4, 1006, 2, 10, 902),
];

const REPORT: SidReport = {
  firmwideId: 28929,
  vendorId: 7,
  months: [
    { reportId: 1, reportMonth: '2026-01-01', billingDate: '2026-02-01' },
    { reportId: 2, reportMonth: '2026-02-01', billingDate: '2026-03-01' },
  ],
  selected: {
    reportId: 2,
    reportMonth: '2026-02-01',
    billingDate: '2026-03-01',
  },
  accounts: ACCOUNTS,
  subscriptions: SUBSCRIPTIONS,
  fees: FEES,
  feeLines: FEE_LINES,
  previousSidKeys: ['1001:1', '1002:1', '1003:1', '1004:1', '1005:1'],
  hrMatches: {},
  files: [],
};

const aggregates = buildAggregates(FEES);
const lineAllocations = buildAllocations(FEES, FEE_LINES);
const allocations = lineAllocations.filter((a) => a.feeKind === 'exchange');
const allocationsBySid = groupAllocationsBySid(allocations);
const accountsByCustNum = new Map(ACCOUNTS.map((a) => [a.custNum, a]));
const rollup = buildEntityRollup(ACCOUNTS, SUBSCRIPTIONS, allocations);

describe('buildAggregates', () => {
  it('flags a masked total price', () => {
    expect(aggregates.map((a) => a.priceMasked)).toEqual([false, true, false]);
  });

  it('drops admin fee rows', () => {
    expect(aggregates.map((a) => a.exchangeCode)).toEqual([
      'EBBO',
      'UK1',
      'EBBO',
    ]);
    expect(aggregates.every((a) => a.feeKind === 'exchange')).toBe(true);
  });
});

describe('buildAllocations', () => {
  it('drops lines whose fee is missing', () => {
    expect(lineAllocations).toHaveLength(7);
    expect(lineAllocations.some((a) => a.feeId === 99)).toBe(false);
  });

  it('copies the parent fee identity onto each line', () => {
    const crossEntity = lineAllocations.find(
      (a) => a.sid === 1003 && a.feeId === 1,
    );
    expect(crossEntity).toMatchObject({
      feeKind: 'exchange',
      custNum: 100,
      rptMonth: '2026-02-01',
      exchangeCode: 'EBBO',
      exchangeName: 'Eurex Ultra',
      proRate: 200,
      priceMasked: false,
      eidNumber: 900,
    });
  });

  it('keeps a line booked under an admin fee and marks its kind', () => {
    const admin = lineAllocations.filter((a) => a.feeKind === 'admin');
    expect(admin.map((a) => [a.sid, a.sidInstNum, a.proRate])).toEqual([
      [1005, 1, 50],
      [1006, 2, 10],
    ]);
    expect(admin.every((a) => a.exchangeCode === 'ADM1')).toBe(true);
  });

  it('marks a null pro-rate as masked', () => {
    const masked = lineAllocations.filter((a) => a.priceMasked);
    expect(masked).toHaveLength(2);
    expect(masked.every((a) => a.proRate === null)).toBe(true);
    expect(masked.every((a) => a.exchangeCode === 'UK1')).toBe(true);
  });
});

describe('buildEntityRollup', () => {
  it('rolls an exchange charge up to the account that owns the SID', () => {
    const beta = rollup.find((r) => r.custNum === 200);
    expect(beta).toMatchObject({
      allocationRows: 1,
      allocationKnownRows: 1,
      allocationMaskedRows: 0,
      allocationKnownCost: 200,
      uniqueExchangeProducts: 1,
    });

    const alpha = rollup.find((r) => r.custNum === 100);
    expect(alpha).toMatchObject({
      allocationRows: 3,
      allocationKnownRows: 1,
      allocationMaskedRows: 2,
      allocationKnownCost: 100,
      uniqueExchangeProducts: 2,
    });
  });

  it('excludes a line whose SID is absent from the subscription snapshot', () => {
    const rows = rollup.flatMap((r) => r.allocationRows);
    expect(rows.reduce((t, n) => t + n, 0)).toBe(allocations.length - 1);
  });

  it('preserves account order and carries the account facts', () => {
    expect(rollup.map((r) => r.custNum)).toEqual([100, 200, 300]);
    expect(rollup[1]).toMatchObject({
      name: 'Beta AG',
      city: 'Zurich',
      country: 'CH',
      currencyCode: 'D',
      taxRate: 8.1,
      auto: 2,
      term: 2,
    });
  });

  it('sums base cost and rounds the known totals to cents', () => {
    expect(rollup.map((r) => r.baseSubs)).toEqual([2, 2, 2]);
    expect(rollup.map((r) => r.baseCost)).toEqual([4430, 4720, 2215]);
    expect(rollup.map((r) => r.totalKnownCost)).toEqual([4530, 4920, 2215]);
  });

  it('rounds a repeating pro-rate share to cents', () => {
    const thirds = [
      line(1, 1001, 1, 33.33, 900),
      line(1, 1002, 1, 33.33, 900),
      line(2, 1001, 1, 33.34, 901),
    ];
    const [alpha] = buildEntityRollup(
      [ACCOUNTS[0]],
      SUBSCRIPTIONS.slice(0, 2),
      buildAllocations(FEES, thirds),
    );
    expect(alpha.allocationKnownCost).toBe(100);
    expect(alpha.totalKnownCost).toBe(4530);
  });
});

describe('buildSummary', () => {
  const summary = buildSummary(REPORT, aggregates, allocations, rollup);

  it('counts the report inventory', () => {
    expect(summary).toMatchObject({
      entities: 3,
      baseSubscriptions: 6,
      uniqueLastUsers: 5,
      productKinds: 2,
      uniqueExchangeProducts: 2,
      sidAllocationRows: 5,
      uniqueSidsWithAllocations: 4,
      baseOnlySubs: 3,
      maskedAggregateRows: 1,
      maskedSidAllocationRows: 2,
    });
  });

  it('distributes prices and products', () => {
    expect(summary.priceDistribution).toEqual({ 0: 1, 2215: 3, 2360: 2 });
    expect(summary.productMix).toEqual({
      'Bloomberg Anywhere': 4,
      'Open Bloomberg': 2,
    });
  });

  it('derives every total from the entity rollup', () => {
    expect(summary.totalBaseSubscriptionPrice).toBe(11365);
    expect(summary.knownExchangeChargesTotal).toBe(300);
    expect(summary.totalKnownCost).toBe(11665);
    expect(summary.totalKnownCost).toBe(
      summary.totalBaseSubscriptionPrice + summary.knownExchangeChargesTotal,
    );
  });
});

describe('deriveSidReport', () => {
  it('assembles the derived view and lifts previous SIDs into a set', () => {
    const derived = deriveSidReport(REPORT);
    expect(derived.aggregates).toHaveLength(3);
    expect(derived.allocations).toHaveLength(5);
    expect(derived.entityRollup).toHaveLength(3);
    expect(derived.accountsByCustNum.get(200)?.name).toBe('Beta AG');
    expect(derived.allocationsBySid.get(sidKey(1001, 1))).toHaveLength(2);
    expect(derived.previousSidKeys?.has('1003:1')).toBe(true);
    expect(derived.summary.totalKnownCost).toBe(11665);
  });

  it('quarantines admin-fee lines and keeps them out of every exchange total', () => {
    const derived = deriveSidReport(REPORT);
    expect(derived.adminAllocations.map((a) => [a.sid, a.sidInstNum])).toEqual([
      [1005, 1],
      [1006, 2],
    ]);
    expect(derived.allocations.every((a) => a.feeKind === 'exchange')).toBe(
      true,
    );
    expect(derived.allocationsBySid.has(sidKey(1005, 1))).toBe(false);
    expect(derived.allocationsBySid.has(sidKey(1006, 2))).toBe(false);
    expect(derived.summary.knownExchangeChargesTotal).toBe(300);
    expect(derived.summary.sidAllocationRows).toBe(5);
    expect(derived.summary.maskedSidAllocationRows).toBe(2);
    expect(derived.entityRollup.find((r) => r.custNum === 300)).toMatchObject({
      allocationRows: 0,
      allocationKnownCost: 0,
      totalKnownCost: 2215,
    });
  });

  it('keeps previousSidKeys null when no earlier month is imported', () => {
    const derived = deriveSidReport({ ...REPORT, previousSidKeys: null });
    expect(derived.previousSidKeys).toBeNull();
  });
});

describe('buildPermissionRows', () => {
  const rows = buildPermissionRows(
    SUBSCRIPTIONS,
    accountsByCustNum,
    allocationsBySid,
  );

  it('adds the exchange cost of a SID to its base price', () => {
    expect(rows[0]).toMatchObject({
      entityName: 'Alpha Ltd',
      exchangeCost: 100,
      masked: true,
      totalCost: 2315,
    });
    expect(rows[0].allocs).toHaveLength(2);
  });

  it('leaves a SID with no allocation at its base price', () => {
    expect(rows[3]).toMatchObject({
      entityName: 'Beta AG',
      allocs: [],
      exchangeCost: 0,
      masked: false,
      totalCost: 2360,
    });
  });

  it('falls back to an em dash when the account is missing', () => {
    const [row] = buildPermissionRows(
      [SUBSCRIPTIONS[0]],
      new Map(),
      allocationsBySid,
    );
    expect(row.entityName).toBe('—');
  });
});

describe('topExchangesByKnownCost', () => {
  it('sums unmasked prices, drops codes with no known price and sorts desc', () => {
    expect(topExchangesByKnownCost(aggregates)).toEqual([
      { code: 'EBBO', name: 'Eurex Ultra', price: 450 },
    ]);
  });

  it('honours the limit', () => {
    expect(topExchangesByKnownCost(aggregates, 1)).toHaveLength(1);
  });
});

describe('topExchangesByCount', () => {
  it('sums subscriptions and masks a code with no known price anywhere', () => {
    expect(topExchangesByCount(aggregates)).toEqual([
      { code: 'EBBO', name: 'Eurex Ultra', subs: 3, masked: false },
      {
        code: 'UK1',
        name: 'London Stock Exchange Level 1',
        subs: 2,
        masked: true,
      },
    ]);
  });

  it('honours the limit', () => {
    expect(topExchangesByCount(aggregates, 2).map((e) => e.code)).toEqual([
      'EBBO',
      'UK1',
    ]);
  });
});

describe('cancelByDate', () => {
  it('is the renewal date minus 60 days', () => {
    expect(cancelByDate('2026-03-02')).toEqual(new Date(2026, 0, 1));
  });

  it('is the same calendar day as a string, worked in UTC', () => {
    expect(cancelByIsoDate('2026-03-02')).toBe('2026-01-01');
    expect(cancelByIsoDate('2026-09-20')).toBe('2026-07-22');
  });
});

describe('isWithinDaysOfToday', () => {
  const today = new Date(2026, 0, 15, 13, 30, 0);

  it('accepts a date inside the window on either side', () => {
    expect(isWithinDaysOfToday(new Date(2026, 0, 1), 30, today)).toBe(true);
    expect(isWithinDaysOfToday(new Date(2026, 1, 10), 30, today)).toBe(true);
  });

  it('rejects a date outside the window', () => {
    expect(isWithinDaysOfToday(new Date(2026, 2, 1), 30, today)).toBe(false);
  });

  it('does not mutate the supplied today', () => {
    isWithinDaysOfToday(new Date(2026, 0, 1), 30, today);
    expect(today.getHours()).toBe(13);
  });
});

describe('matchesSearch', () => {
  it('matches any value as a case-insensitive substring', () => {
    expect(matchesSearch('cindy', [4805414, 'Cindy Example'])).toBe(true);
    expect(matchesSearch('0541', [4805414, 'Cindy Example'])).toBe(true);
    expect(matchesSearch('phil', [4805414, 'Cindy Example'])).toBe(false);
  });

  it('matches everything on a blank or whitespace query', () => {
    expect(matchesSearch('', [1])).toBe(true);
    expect(matchesSearch('   ', [])).toBe(true);
  });

  it('ignores null and undefined values and trims the query', () => {
    expect(matchesSearch(' xnys ', [null, undefined, 'XNYS'])).toBe(true);
    expect(matchesSearch('x', [null, undefined])).toBe(false);
  });
});

describe('isNewSid', () => {
  it('is false when no previous month is imported', () => {
    expect(isNewSid(SUBSCRIPTIONS[0], null)).toBe(false);
  });

  it('is true only for a SID absent from the previous month', () => {
    const previous = new Set(REPORT.previousSidKeys ?? []);
    expect(isNewSid(SUBSCRIPTIONS[0], previous)).toBe(false);
    expect(isNewSid(SUBSCRIPTIONS[5], previous)).toBe(true);
  });
});

describe('rollupCosts', () => {
  it('groups at the top level and sorts by total desc', () => {
    const rows = rollupCosts(
      SUBSCRIPTIONS,
      accountsByCustNum,
      allocationsBySid,
      countryCityPath,
      0,
      {},
    );
    expect(rows).toEqual([
      {
        key: 'CH',
        subs: 2,
        users: 2,
        baseCost: 4720,
        exchangeCost: 200,
        total: 4920,
      },
      {
        key: 'GB',
        subs: 2,
        users: 1,
        baseCost: 4430,
        exchangeCost: 100,
        total: 4530,
      },
      {
        key: 'FR',
        subs: 2,
        users: 2,
        baseCost: 2215,
        exchangeCost: 0,
        total: 2215,
      },
    ]);
  });

  it('drills into the next level under a filter', () => {
    const rows = rollupCosts(
      SUBSCRIPTIONS,
      accountsByCustNum,
      allocationsBySid,
      countryCityPath,
      1,
      { 0: 'CH' },
    );
    expect(rows).toEqual([
      {
        key: 'Zurich',
        subs: 2,
        users: 2,
        baseCost: 4720,
        exchangeCost: 200,
        total: 4920,
      },
    ]);
  });

  it('falls back to an em dash when the account is missing', () => {
    const rows = rollupCosts(
      SUBSCRIPTIONS,
      new Map(),
      allocationsBySid,
      countryCityPath,
      0,
      {},
    );
    expect(rows).toEqual([
      {
        key: '—',
        subs: 6,
        users: 5,
        baseCost: 11365,
        exchangeCost: 300,
        total: 11665,
      },
    ]);
  });
});

describe('currencyLabel', () => {
  it('reads the Bloomberg dollar code', () => {
    expect(currencyLabel('D')).toBe('USD');
    expect(currencyLabel('EUR')).toBe('EUR');
    expect(currencyLabel(null)).toBe('—');
  });
});

const UNITS: OrgUnitNode[] = [
  { id: 1, level: 'entity', name: 'Berenberg', parent_id: null },
  { id: 2, level: 'business_group', name: 'Global Markets', parent_id: 1 },
  { id: 3, level: 'division', name: 'Trading', parent_id: 2 },
  { id: 4, level: 'business_unit', name: 'Equities Desk', parent_id: 3 },
  { id: 5, level: 'team', name: 'Flow', parent_id: 4 },
  { id: 6, level: 'department', name: 'Operations', parent_id: 3 },
  { id: 9, level: 'cost_center', name: 'CC-1001', parent_id: null },
];

const UNIT_PATHS = buildUnitPaths(UNITS);

const EMPLOYEES: SidHrEmployee[] = [
  {
    id: 11,
    firstName: 'User 615',
    lastName: 'LDN',
    department: null,
    costCenter: 'CC-1001',
    orgUnitId: 5,
    status: 'active',
  },
  {
    id: 12,
    firstName: 'Anna',
    lastName: 'Vogel',
    department: 'Operations',
    costCenter: 'CC-2200',
    orgUnitId: 6,
    status: 'departed',
  },
  {
    id: 13,
    firstName: 'Mark',
    lastName: 'Vogel',
    department: 'Treasury',
    costCenter: 'CC-3100',
    orgUnitId: null,
    status: 'active',
  },
];

describe('buildUnitPaths', () => {
  it('maps every tree level on the chain, skipping absent ones', () => {
    expect(UNIT_PATHS.get(5)).toEqual({
      entity: 'Berenberg',
      business_group: 'Global Markets',
      division: 'Trading',
      business_unit: 'Equities Desk',
      team: 'Flow',
    });
  });

  it('stops at the root of a partial chain', () => {
    expect(UNIT_PATHS.get(1)).toEqual({ entity: 'Berenberg' });
    expect(UNIT_PATHS.get(6)).toEqual({
      entity: 'Berenberg',
      business_group: 'Global Markets',
      division: 'Trading',
      department: 'Operations',
    });
  });

  it('excludes cost centers', () => {
    expect(UNIT_PATHS.has(9)).toBe(false);
    expect(UNIT_PATHS.size).toBe(6);
  });

  it('terminates on a cyclic chain', () => {
    const cyclic: OrgUnitNode[] = [
      { id: 21, level: 'division', name: 'Loop A', parent_id: 22 },
      { id: 22, level: 'business_group', name: 'Loop B', parent_id: 21 },
    ];
    expect(buildUnitPaths(cyclic).get(21)).toEqual({
      division: 'Loop A',
      business_group: 'Loop B',
    });
  });
});

describe('matchHr', () => {
  const matches = matchHr(
    [
      'User 615 LDN',
      'user  615   ldn ',
      'User 615 LDN',
      'J Vogel',
      'leaver_41',
      'PROXYUSER BMDS3519_5',
    ],
    EMPLOYEES,
    UNIT_PATHS,
  );

  it('matches a full name case-insensitively through extra whitespace', () => {
    expect(matches['user  615   ldn ']).toEqual({
      confidence: 'Exact name',
      employee: {
        id: 11,
        fullName: 'User 615 LDN',
        department: null,
        costCenter: 'CC-1001',
        status: 'active',
        unitPath: UNIT_PATHS.get(5),
      },
    });
  });

  it('refuses to guess between two employees who share a surname', () => {
    expect(matches['J Vogel']).toEqual({
      confidence: 'Missing HR match',
      employee: null,
    });
  });

  it('refuses to guess between two employees who share a full name', () => {
    const employees: SidHrEmployee[] = [
      { ...EMPLOYEES[1], id: 31, firstName: 'Alex', lastName: 'Kim' },
      { ...EMPLOYEES[1], id: 32, firstName: 'Alex', lastName: 'Kim' },
    ];
    expect(matchHr(['Alex Kim'], employees, UNIT_PATHS)['Alex Kim']).toEqual({
      confidence: 'Missing HR match',
      employee: null,
    });
  });

  it('falls back to the last word when the surname is unique', () => {
    const employees: SidHrEmployee[] = [
      { ...EMPLOYEES[1], id: 21, firstName: 'Anna', lastName: 'Smith' },
      { ...EMPLOYEES[1], id: 22, firstName: 'Ben', lastName: 'Smith' },
      { ...EMPLOYEES[1], id: 23, firstName: 'Dana', lastName: 'Jones' },
    ];
    const result = matchHr(['Carl Smith', 'Carl Jones'], employees, UNIT_PATHS);
    expect(result['Carl Smith']).toEqual({
      confidence: 'Missing HR match',
      employee: null,
    });
    expect(result['Carl Jones']).toMatchObject({
      confidence: 'Fuzzy name',
      employee: { id: 23, fullName: 'Dana Jones' },
    });
  });

  it('leaves a service account or leaver unmatched', () => {
    expect(matches['leaver_41']).toEqual({
      confidence: 'Missing HR match',
      employee: null,
    });
    expect(matches['PROXYUSER BMDS3519_5']).toEqual({
      confidence: 'Missing HR match',
      employee: null,
    });
  });

  it('holds one entry per distinct last user', () => {
    expect(Object.keys(matches)).toHaveLength(5);
  });

  it('leaves the unit path empty when the employee has no org unit', () => {
    const [match] = Object.values(
      matchHr(['Mark Vogel'], EMPLOYEES, UNIT_PATHS),
    );
    expect(match.employee?.unitPath).toEqual({});
  });
});

describe('hrLevelPath', () => {
  const matches = matchHr(
    ['User 615 LDN', 'Mark Vogel', 'leaver_41'],
    EMPLOYEES,
    UNIT_PATHS,
  );
  const path = hrLevelPath(matches);
  const account = ACCOUNTS[0];

  it('reads the entity from the SID account and the rest from the org chart', () => {
    const sub = subscription(100, 2001, 1, 'User 615 LDN', 1000, 28);
    expect(path(sub, account)).toEqual([
      'Alpha Ltd',
      'Global Markets',
      'Trading',
      'Equities Desk',
      '—',
      'Flow',
      'User 615 LDN',
    ]);
  });

  it('falls back to the employee department when the chain skips it', () => {
    const sub = subscription(100, 2002, 1, 'Mark Vogel', 1000, 28);
    expect(path(sub, account)).toEqual([
      'Alpha Ltd',
      '—',
      '—',
      '—',
      'Treasury',
      '—',
      'Mark Vogel',
    ]);
  });

  it('dashes every HR segment for an unmatched user', () => {
    const sub = subscription(100, 2003, 1, 'leaver_41', 1000, 28);
    expect(path(sub, undefined)).toEqual([
      '—',
      '—',
      '—',
      '—',
      '—',
      '—',
      'leaver_41',
    ]);
  });
});

describe('costCenterPath', () => {
  const matches = matchHr(['User 615 LDN', 'leaver_41'], EMPLOYEES, UNIT_PATHS);
  const path = costCenterPath(matches);

  it('is a flat list of the matched cost center', () => {
    const sub = subscription(100, 2001, 1, 'User 615 LDN', 1000, 28);
    expect(path(sub, ACCOUNTS[0])).toEqual(['CC-1001']);
  });

  it('falls back to an em dash for an unmatched user', () => {
    const sub = subscription(100, 2003, 1, 'leaver_41', 1000, 28);
    expect(path(sub, ACCOUNTS[0])).toEqual(['—']);
  });
});

describe('buildSidProducts', () => {
  it('groups seats and cost by product and sorts by seats desc', () => {
    expect(buildSidProducts(SUBSCRIPTIONS, '2026-02-01')).toEqual([
      {
        gptt: 28,
        description: 'Bloomberg Anywhere',
        seats: 4,
        monthlyCost: 6790,
        entitlementsCost: 0,
        entitledSeats: 0,
        reportMonth: '2026-02-01',
        holders: [
          { name: 'user a', dormant: false },
          { name: 'user a', dormant: false },
          { name: 'user b', dormant: false },
          { name: 'user d', dormant: false },
        ],
        earliestContractDate: '2020-03-02',
        latestRenewalDate: '2026-03-02',
      },
      {
        gptt: 30,
        description: 'Open Bloomberg',
        seats: 2,
        monthlyCost: 4575,
        entitlementsCost: 0,
        entitledSeats: 0,
        reportMonth: '2026-02-01',
        holders: [
          { name: 'user c', dormant: false },
          { name: 'user e', dormant: false },
        ],
        earliestContractDate: '2020-03-02',
        latestRenewalDate: '2026-03-02',
      },
    ]);
  });

  it('carries each seat’s own 90-day flag onto its holder entry', () => {
    const [product] = buildSidProducts(
      [
        {
          ...subscription(100, 4001, 1, 'zoe zenith', 1000, 28),
          ninetyDay: true,
        },
        subscription(100, 4002, 1, 'adam apple', 1000, 28),
      ],
      '2026-02-01',
    );
    expect(product.holders).toEqual([
      { name: 'adam apple', dormant: false },
      { name: 'zoe zenith', dormant: true },
    ]);
  });

  it('lists a user holding two seats once per seat, sorted', () => {
    const products = buildSidProducts(
      [
        subscription(100, 4001, 1, 'zoe zenith', 1000, 28),
        subscription(100, 4002, 1, 'adam apple', 1000, 28),
        subscription(100, 4003, 1, 'zoe zenith', 1000, 28),
      ],
      '2026-02-01',
    );
    expect(products[0].seats).toBe(3);
    expect(products[0].holders.map((holder) => holder.name)).toEqual([
      'adam apple',
      'zoe zenith',
      'zoe zenith',
    ]);
  });

  it('spans each product from its first contract date to its last renewal', () => {
    const [product] = buildSidProducts(
      [
        subscription(100, 4001, 1, 'user a', 2215, 28),
        {
          ...subscription(100, 4002, 1, 'user b', 2215, 28),
          contractDate: '2000-01-17',
          renewalDate: '2024-01-17',
        },
        {
          ...subscription(100, 4003, 1, 'user c', 2215, 28),
          contractDate: '2026-03-16',
          renewalDate: '2028-04-29',
        },
      ],
      '2026-04-01',
    );
    expect(product.earliestContractDate).toBe('2000-01-17');
    expect(product.latestRenewalDate).toBe('2028-04-29');
  });

  it('rounds the summed cost to cents', () => {
    const products = buildSidProducts(
      [
        subscription(100, 3001, 1, 'user a', 0.1, 40),
        subscription(100, 3002, 1, 'user b', 0.2, 40),
      ],
      '2026-02-01',
    );
    expect(products[0].monthlyCost).toBe(0.3);
  });

  it('is empty without subscriptions', () => {
    expect(buildSidProducts([], '2026-02-01')).toEqual([]);
  });

  it('folds each product’s priced exchange lines into its entitlements cost, never into a product of their own', () => {
    const products = buildSidProducts(
      SUBSCRIPTIONS,
      '2026-02-01',
      FEES,
      FEE_LINES,
    );

    // Fee 1's two lines price seats 1001 and 1003 (both gptt 28); fee 2 is
    // unpriced, fee 3 names an unknown seat, fee 4 is an admin fee.
    expect(
      products.map((p) => [p.gptt, p.entitledSeats, p.entitlementsCost]),
    ).toEqual([
      [28, 2, 300],
      [30, 0, 0],
    ]);
    expect(products.find((p) => p.gptt === 28)?.monthlyCost).toBe(6790);
    expect(sidProductTotalCost(products[0])).toBe(7090);
  });
});

describe('sidProductTermBounds', () => {
  const product = (
    earliestContractDate: string,
    latestRenewalDate: string,
  ): SidProductSummary => ({
    gptt: 28,
    description: 'Bloomberg Anywhere',
    seats: 1,
    monthlyCost: 2215,
    entitlementsCost: 0,
    entitledSeats: 0,
    reportMonth: '2026-04-01',
    holders: [{ name: 'user a', dormant: false }],
    earliestContractDate,
    latestRenewalDate,
  });

  it('spans the earliest contract date to the latest renewal across products', () => {
    expect(
      sidProductTermBounds([
        product('2004-09-24', '2028-04-29'),
        product('2000-01-17', '2026-11-30'),
      ]),
    ).toEqual({ start: '2000-01-17', end: '2028-04-29' });
  });

  it('is null without products', () => {
    expect(sidProductTermBounds([])).toBeNull();
  });
});

const EVERYONE: SeatRoster = {
  isActiveEmployee: () => true,
  matchActiveNames: () => () => true,
};
const activeNames = (names: string[]): SeatRoster => ({
  isActiveEmployee: () => true,
  matchActiveNames: () => (name) => names.includes(name),
});

describe('sidProductInventoryItems', () => {
  const VENDOR = { id: 7, name: 'Bloomberg', domain: 'bloomberg.com' };

  const product = (
    overrides: Partial<SidProductSummary> = {},
  ): SidProductSummary => ({
    gptt: 28,
    description: 'Bloomberg Anywhere',
    seats: 3,
    monthlyCost: 2215.5,
    entitlementsCost: 0,
    entitledSeats: 0,
    reportMonth: '2026-02-01',
    holders: [
      { name: 'user a', dormant: false },
      { name: 'user b', dormant: false },
    ],
    earliestContractDate: '2020-03-02',
    latestRenewalDate: '2026-03-02',
    ...overrides,
  });

  it('maps a product onto an inventory row', () => {
    expect(sidProductInventoryItems([product()], VENDOR, EVERYONE)).toEqual([
      {
        id: 'sid:28',
        vendor: 'Bloomberg',
        vendorId: 7,
        vendorDomain: 'bloomberg.com',
        productName: ['Bloomberg Anywhere'],
        licensesCount: 3,
        endUsers: '',
        startDate: '',
        endDate: '',
        cost: 26586,
        costNative: 26586,
        currency: 'USD',
        deliveryMethods: [],
        status: 'Active',
        source: 'bloomberg-sid',
        activeUsers: [
          expect.objectContaining({ name: 'user a', product_id: 28 }),
          expect.objectContaining({ name: 'user b', product_id: 28 }),
        ],
      },
    ]);
  });

  it('annualizes the monthly cost, rounded to cents', () => {
    const [item] = sidProductInventoryItems(
      [product({ monthlyCost: 0.155 })],
      VENDOR,
      EVERYONE,
    );
    expect(item.cost).toBe(1.86);
    expect(item.costNative).toBe(1.86);
  });

  it('carries one active user per seat the roster answers for', () => {
    const [item] = sidProductInventoryItems(
      [
        product({
          seats: 3,
          holders: [
            { name: 'user a', dormant: false },
            { name: 'user a', dormant: false },
            { name: 'user b', dormant: false },
          ],
        }),
      ],
      VENDOR,
      activeNames(['user a']),
    );
    expect(item.activeUsers.map((user) => user.name)).toEqual([
      'user a',
      'user a',
    ]);
    expect(item.licensesCount).toBe(3);
  });

  it('leaves out a dormant seat however active the person holding it', () => {
    const [item] = sidProductInventoryItems(
      [
        product({
          seats: 2,
          holders: [
            { name: 'user a', dormant: true },
            { name: 'user b', dormant: false },
          ],
        }),
      ],
      VENDOR,
      EVERYONE,
    );
    expect(item.activeUsers.map((user) => user.name)).toEqual(['user b']);
    expect(item.licensesCount).toBe(2);
  });

  it('leaves the domain undefined when the vendor has none', () => {
    const [item] = sidProductInventoryItems(
      [product()],
      { ...VENDOR, domain: null },
      EVERYONE,
    );
    expect(item.vendorDomain).toBeUndefined();
  });
});

describe('sidVendorInventoryItem', () => {
  const VENDOR = { id: 7, name: 'Bloomberg', domain: 'bloomberg.com' };
  const product = (
    overrides: Partial<SidProductSummary> = {},
  ): SidProductSummary => ({
    gptt: 28,
    description: 'Bloomberg Anywhere',
    seats: 3,
    monthlyCost: 2215.5,
    entitlementsCost: 0,
    entitledSeats: 0,
    reportMonth: '2026-02-01',
    holders: [
      { name: 'user a', dormant: false },
      { name: 'user b', dormant: false },
    ],
    earliestContractDate: '2020-03-02',
    latestRenewalDate: '2026-03-02',
    ...overrides,
  });

  it('rolls every product into one USD row keyed outside the contract space', () => {
    const item = sidVendorInventoryItem(
      [
        product(),
        product({
          gptt: 30,
          description: 'Bloomberg Professional',
          seats: 2,
          monthlyCost: 1000,
          holders: [
            { name: 'user b', dormant: false },
            { name: 'user c', dormant: false },
          ],
        }),
      ],
      VENDOR,
      EVERYONE,
    );

    expect(item).toEqual({
      id: 'bloomberg:7',
      vendor: 'Bloomberg',
      vendorId: 7,
      vendorDomain: 'bloomberg.com',
      productName: ['Terminals and exchange entitlements'],
      licensesCount: 5,
      endUsers: '',
      startDate: '',
      endDate: '',
      cost: 38586,
      costNative: 38586,
      currency: 'USD',
      deliveryMethods: [],
      status: 'Active',
      source: 'bloomberg-sid',
      activeUsers: [
        expect.objectContaining({ id: 0, name: 'user a', product_id: 28 }),
        expect.objectContaining({ id: 1, name: 'user b', product_id: 28 }),
        expect.objectContaining({ id: 2, name: 'user b', product_id: 30 }),
        expect.objectContaining({ id: 3, name: 'user c', product_id: 30 }),
      ],
    });
  });

  it('leaves out seats the roster does not answer for, keeping the licence count', () => {
    const item = sidVendorInventoryItem(
      [
        product({
          holders: [
            { name: 'user a', dormant: false },
            { name: 'user b', dormant: false },
            { name: 'user b', dormant: false },
          ],
        }),
      ],
      VENDOR,
      activeNames(['user b']),
    );

    expect(item?.licensesCount).toBe(3);
    expect(item?.activeUsers.map((user) => user.name)).toEqual([
      'user b',
      'user b',
    ]);
  });

  it('leaves out a dormant seat across the rollup too', () => {
    const item = sidVendorInventoryItem(
      [
        product({
          holders: [
            { name: 'user a', dormant: true },
            { name: 'user b', dormant: false },
          ],
        }),
      ],
      VENDOR,
      EVERYONE,
    );

    expect(item?.activeUsers.map((user) => user.name)).toEqual(['user b']);
  });

  it('rounds the annual figure to cents', () => {
    expect(
      sidVendorInventoryItem(
        [product({ monthlyCost: 0.155 }), product({ monthlyCost: 0.1 })],
        VENDOR,
        EVERYONE,
      )?.cost,
    ).toBe(3.06);
  });

  it('is null for a vendor without products', () => {
    expect(sidVendorInventoryItem([], VENDOR, EVERYONE)).toBeNull();
  });

  it('adds entitlement cost without counting entitlements as seats', () => {
    const item = sidVendorInventoryItem(
      [
        product({
          seats: 3,
          monthlyCost: 100,
          entitlementsCost: 10,
          entitledSeats: 2,
          holders: [{ name: 'user a', dormant: false }],
        }),
      ],
      VENDOR,
      EVERYONE,
    );

    expect(item).toMatchObject({ licensesCount: 3, cost: 1320 });
  });
});

describe('nextSidRenewalDate', () => {
  const today = new Date('2026-09-08T00:00:00.000Z');

  it('is the recorded date while it is still ahead, today included', () => {
    expect(nextSidRenewalDate('2026-10-01', today)).toBe('2026-10-01');
    expect(nextSidRenewalDate('2026-09-08', today)).toBe('2026-09-08');
  });

  it('steps a passed date forward by whole two-year terms', () => {
    expect(nextSidRenewalDate('2026-09-07', today)).toBe('2028-09-07');
    expect(nextSidRenewalDate('2020-03-02', today)).toBe('2028-03-02');
  });

  it('compares on the UTC calendar day, so a renewal today is not stepped past by the clock', () => {
    expect(
      nextSidRenewalDate('2026-09-08', new Date('2026-09-08T15:30:00.000Z')),
    ).toBe('2026-09-08');
  });
});

describe('isSidRenewingWithin', () => {
  const today = new Date('2026-09-08T00:00:00.000Z');

  it('keeps a seat whose next renewal lands inside the window, inclusive', () => {
    expect(isSidRenewingWithin('2026-09-08', 90, today)).toBe(true);
    expect(isSidRenewingWithin('2026-12-07', 90, today)).toBe(true);
    expect(isSidRenewingWithin('2026-12-08', 90, today)).toBe(false);
  });

  it('counts a lapsed date by its next anniversary', () => {
    expect(isSidRenewingWithin('2024-10-01', 90, today)).toBe(true);
    expect(isSidRenewingWithin('2024-06-01', 90, today)).toBe(false);
  });
});

describe('sidSubscriptionInactiveReasons', () => {
  const match = (status: string) => ({
    confidence: 'Exact name' as const,
    employee: {
      id: 1,
      fullName: 'Ada Lovelace',
      department: null,
      costCenter: null,
      status,
      unitPath: {},
    },
  });
  const sub = (lastUser: string, ninetyDay = false) => ({
    lastUser,
    ninetyDay,
  });

  it('is active for a matched active employee the feed has seen in use', () => {
    expect(
      sidSubscriptionInactiveReasons(sub('Ada Lovelace'), {
        'Ada Lovelace': match('active'),
      }),
    ).toEqual([]);
  });

  it('reads the roster status of the match', () => {
    expect(
      sidSubscriptionInactiveReasons(sub('Ada Lovelace'), {
        'Ada Lovelace': match('inactive'),
      }),
    ).toEqual(['leaver']);
    expect(
      sidSubscriptionInactiveReasons(sub('Ada Lovelace'), {
        'Ada Lovelace': match('on_leave'),
      }),
    ).toEqual(['on_leave']);
  });

  it('names a seat with no HR match, or none at all', () => {
    expect(
      sidSubscriptionInactiveReasons(sub('PROXYUSER'), {
        PROXYUSER: { confidence: 'Missing HR match', employee: null },
      }),
    ).toEqual(['not_in_hr']);
    expect(sidSubscriptionInactiveReasons(sub('PROXYUSER'), {})).toEqual([
      'not_in_hr',
    ]);
  });

  it('adds the 90-day flag on top of the roster reading', () => {
    expect(
      sidSubscriptionInactiveReasons(sub('Ada Lovelace', true), {
        'Ada Lovelace': match('active'),
      }),
    ).toEqual(['dormant']);
    expect(
      sidSubscriptionInactiveReasons(sub('Ada Lovelace', true), {
        'Ada Lovelace': match('inactive'),
      }),
    ).toEqual(['leaver', 'dormant']);
  });
});
