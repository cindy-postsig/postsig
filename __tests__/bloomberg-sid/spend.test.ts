import type {
  SidAccount,
  SidExchangeFee,
  SidExchangeFeeLine,
  SidSeatSource,
  SidSubscription,
} from '@/lib/v2/bloomberg-sid/report';
import { sidRollupKey } from '@/lib/v2/bloomberg-sid/keys';
import {
  buildSidSeats,
  collapseSidLineItems,
  isSidVendorInvoice,
  sidAllocations,
  sidContractId,
  sidNextRenewalDate,
  sidSeatGoneBefore,
  sidSeatExchangeProductId,
  sidSeatProductId,
  sidSeatSegments,
  sidSegmentResolver,
  sidSpendContracts,
  sidSpendRefs,
  type SidSeat,
} from '@/lib/v2/bloomberg-sid/spend';
import type { AllocationEmployee } from '@/lib/v2/cost-allocation/types';
import type { OrgUnitNode } from '@/lib/v2/org-units/tree';
import {
  mergeLineItems,
  queryCommitments,
  querySpend,
  queryTCV,
  type CurrencyPolicy,
  type SegmentResolver,
  type SpendLineItem,
  type SpendQuery,
} from '@/lib/v2/spend';

const VENDOR_ID = 469;
const HORIZON = new Date('2028-01-01T00:00:00.000Z');
// Every seat here is contracted well after 1970, so an epoch start bounds
// nothing: the fixtures below read as they did before the window bound.
const UNBOUNDED = new Date(0);
const FY2026_WINDOW = {
  start: new Date('2026-01-01T00:00:00.000Z'),
  end: new Date('2027-01-01T00:00:00.000Z'),
};
const MONTHS_PER_YEAR = 12;

const seat = (overrides: Partial<SidSeat> = {}): SidSeat => ({
  vendorId: VENDOR_ID,
  custNum: 30041555,
  accountName: 'Berenberg London',
  currency: 'USD',
  sid: 4805414,
  sidInstNum: 5,
  gptt: 28,
  gpttDescription: 'Bloomberg Anywhere',
  lastUser: 'Cindy Example',
  ninetyDay: false,
  contractDate: '2025-01-01',
  terms: [{ renewalDate: '2027-12-30', monthlyPrice: 100 }],
  exchange: [{ reportMonth: '2026-07-01', monthlyExchangeCost: 0 }],
  entitlements: [],
  lastReportMonth: null,
  ...overrides,
});

const cindy = seat();
const phil = seat({
  sid: 9021893,
  sidInstNum: 1,
  lastUser: 'Phil Example',
  contractDate: '2025-06-05',
  terms: [{ renewalDate: '2027-06-05', monthlyPrice: 100 }],
});

const priceKeyOf = (s: SidSeat): string =>
  `${sidContractId(s.custNum)}:${sidSeatProductId(s)}`;
const exchangeKeyOf = (s: SidSeat): string =>
  `${sidContractId(s.custNum)}:${sidSeatExchangeProductId(s)}`;

const byPeriod = (items: SpendLineItem[]): Record<string, number> => {
  const totals: Record<string, number> = {};
  for (const item of items) {
    totals[item.period] = (totals[item.period] ?? 0) + item.value;
  }
  return totals;
};

const identityRates = { monthRate: () => 1, dateRate: () => 1 };
const usd: CurrencyPolicy = {
  mode: 'base',
  target: 'USD',
  rates: identityRates,
};

const fy2026: SpendQuery = {
  basis: 'amortized',
  source: 'expected',
  window: { fiscalYear: 2026 },
  granularity: 'year',
  groupBy: 'total',
  currency: usd,
  fiscalConfig: { startMonth: 1 },
  asOf: new Date('2026-09-03T00:00:00.000Z'),
};

const sumValues = (items: SpendLineItem[]): number =>
  items.reduce((sum, item) => sum + item.value, 0);

const totalsByKey = (items: SpendLineItem[]): Record<string, number> => {
  const totals: Record<string, number> = {};
  for (const item of items) {
    totals[item.groupKey] = (totals[item.groupKey] ?? 0) + item.value;
  }
  return totals;
};

describe('buildSidSeats', () => {
  const account: SidAccount = {
    custNum: 1,
    name: 'Alpha',
    city: 'London',
    state: null,
    country: 'GB',
    currencyCode: 'D',
    taxRate: 0,
    auto: 2,
    term: 2,
  };
  const subscription = (
    overrides: Partial<SidSubscription> = {},
  ): SidSubscription => ({
    custNum: 1,
    sid: 10,
    sidInstNum: 2,
    contractDate: '2000-04-07',
    renewalDate: '2026-04-07',
    lastUser: 'A User',
    sidType: 1,
    sidDescription: 'Subscription',
    gptt: 28,
    gpttDescription: 'Bloomberg Anywhere',
    serialNumber: 'sn',
    ws: null,
    ninetyDay: false,
    special: null,
    price: 2215,
    poNumber: null,
    ...overrides,
  });

  // One exchange fee and one admin fee per month; only the exchange lines of
  // the seat count, and a masked pro-rate is unknown rather than zero.
  const source = (
    reportMonth: string,
    subscriptions: SidSubscription[],
    proRate: number | null,
  ): SidSeatSource => {
    const fees: SidExchangeFee[] = [
      {
        id: Number(reportMonth.slice(5, 7)) * 10,
        custNum: 1,
        rptMonth: reportMonth,
        feeKind: 'exchange',
        exchangeCode: 'CBOE',
        exchangeName: 'Cboe Europe',
        subscriptions: 1,
        currencyCode: 'D',
        totalPrice: proRate,
        contributorBills: false,
      },
      {
        id: Number(reportMonth.slice(5, 7)) * 10 + 1,
        custNum: 1,
        rptMonth: reportMonth,
        feeKind: 'admin',
        exchangeCode: 'ADM',
        exchangeName: 'Admin',
        subscriptions: 1,
        currencyCode: 'D',
        totalPrice: 5,
        contributorBills: false,
      },
    ];
    const feeLines: SidExchangeFeeLine[] = subscriptions.flatMap((sub) =>
      fees.map((fee) => ({
        feeId: fee.id,
        sid: sub.sid,
        sidInstNum: sub.sidInstNum,
        proRate: fee.feeKind === 'exchange' ? proRate : 5,
        contributorBills: false,
        eidNumber: 1,
      })),
    );
    return {
      reportMonth,
      accounts: [account],
      subscriptions,
      fees,
      feeLines,
    };
  };

  const february = source('2026-02-01', [subscription()], 52);
  const march = source('2026-03-01', [subscription()], 51.1);
  const april = source(
    '2026-04-01',
    [subscription({ renewalDate: '2028-04-07', price: 2360 })],
    51.1,
  );

  it('keeps one term per observed renewal date, ascending, and one exchange entry per report', () => {
    const [built] = buildSidSeats(VENDOR_ID, [february, march, april]);

    expect(built).toMatchObject({
      vendorId: VENDOR_ID,
      custNum: 1,
      accountName: 'Alpha',
      currency: 'USD',
      sid: 10,
      sidInstNum: 2,
      lastUser: 'A User',
      contractDate: '2000-04-07',
      lastReportMonth: null,
    });
    expect(built.terms).toEqual([
      { renewalDate: '2026-04-07', monthlyPrice: 2215 },
      { renewalDate: '2028-04-07', monthlyPrice: 2360 },
    ]);
    expect(built.exchange).toEqual([
      { reportMonth: '2026-02-01', monthlyExchangeCost: 52 },
      { reportMonth: '2026-03-01', monthlyExchangeCost: 51.1 },
      { reportMonth: '2026-04-01', monthlyExchangeCost: 51.1 },
    ]);
    expect(built.entitlements).toEqual([
      { exchangeCode: 'CBOE', exchangeName: 'Cboe Europe', monthlyCost: 51.1 },
    ]);
  });

  it('takes the 90-day flag from the latest report the seat appears in', () => {
    const flagged = source(
      '2026-03-01',
      [subscription({ ninetyDay: true })],
      51.1,
    );

    expect(buildSidSeats(VENDOR_ID, [february, flagged])[0].ninetyDay).toBe(
      true,
    );
    expect(buildSidSeats(VENDOR_ID, [flagged, april])[0].ninetyDay).toBe(false);
  });

  it('lets the latest report of a term set its price', () => {
    const corrected = source(
      '2026-03-01',
      [subscription({ price: 2225 })],
      51.1,
    );

    const [built] = buildSidSeats(VENDOR_ID, [february, corrected]);

    expect(built.terms).toEqual([
      { renewalDate: '2026-04-07', monthlyPrice: 2225 },
    ]);
  });

  it('stamps the last month a seat missing from the newest report was seen in', () => {
    const [built] = buildSidSeats(VENDOR_ID, [
      february,
      march,
      source('2026-04-01', [], null),
    ]);

    expect(built.lastReportMonth).toBe('2026-03-01');
    expect(built.exchange).toHaveLength(2);
  });

  it('takes the identity fields from the latest report the seat appears in', () => {
    const moved = source(
      '2026-04-01',
      [subscription({ lastUser: 'New Holder', contractDate: '2001-01-01' })],
      51.1,
    );

    const [built] = buildSidSeats(VENDOR_ID, [february, moved]);

    expect(built).toMatchObject({
      lastUser: 'New Holder',
      contractDate: '2001-01-01',
    });
  });

  it('ignores masked pro-rates and non-exchange fees, and falls back to the customer number', () => {
    const masked = source('2026-02-01', [subscription()], null);

    const [built] = buildSidSeats(VENDOR_ID, [{ ...masked, accounts: [] }]);

    expect(built.accountName).toBe('1');
    expect(built.currency).toBe('USD');
    expect(built.exchange).toEqual([
      { reportMonth: '2026-02-01', monthlyExchangeCost: 0 },
    ]);
  });
});

describe('sidSeatSegments', () => {
  it('emits nothing for a waived seat', () => {
    expect(
      sidSeatSegments(
        seat({ terms: [{ renewalDate: '2027-12-30', monthlyPrice: 0 }] }),
        UNBOUNDED,
        HORIZON,
      ),
    ).toEqual([]);
  });

  it('slices 12 months back from the renewal date, then projects a renewal term forward to the horizon', () => {
    const segments = sidSeatSegments(phil, UNBOUNDED, HORIZON);
    expect(
      segments.map(({ from, to, fee, source, confidence, termStart }) => ({
        from,
        to,
        fee,
        source,
        confidence,
        termStart,
      })),
    ).toEqual([
      {
        from: '2025-06-05',
        to: '2026-06-05',
        fee: 1200,
        source: 'year-entry',
        confidence: 'explicit',
        termStart: '2025-06-05',
      },
      {
        from: '2026-06-05',
        to: '2027-06-05',
        fee: 1200,
        source: 'year-entry',
        confidence: 'explicit',
        termStart: '2025-06-05',
      },
      {
        from: '2027-06-05',
        to: '2028-06-05',
        fee: 1278,
        source: 'renewal-projection',
        confidence: 'inferred',
        termStart: '2027-06-05',
      },
    ]);
    expect(segments.every((s) => s.productId === sidSeatProductId(phil))).toBe(
      true,
    );
    expect(segments.every((s) => s.currency === 'USD')).toBe(true);
    expect(segments[2].reason).toContain(
      'one two-year renewal term projected past the renewal date at an estimated 6.5% seat price increase',
    );
  });

  it('projects exactly one two-year renewal term, both slices on the same term start', () => {
    const segments = sidSeatSegments(
      phil,
      UNBOUNDED,
      new Date('2031-01-01T00:00:00.000Z'),
    );
    const projected = segments.filter((s) => s.source === 'renewal-projection');
    expect(
      projected.map(({ from, to, termStart }) => ({ from, to, termStart })),
    ).toEqual([
      { from: '2027-06-05', to: '2028-06-05', termStart: '2027-06-05' },
      { from: '2028-06-05', to: '2029-06-05', termStart: '2027-06-05' },
    ]);
  });

  it('gives the earliest slice the remainder between the cadence and the contract date', () => {
    const segments = sidSeatSegments(cindy, UNBOUNDED, HORIZON);
    expect(segments.map(({ from, to, fee }) => ({ from, to, fee }))).toEqual([
      { from: '2025-01-01', to: '2025-12-30', fee: 1200 },
      { from: '2025-12-30', to: '2026-12-30', fee: 1200 },
      { from: '2026-12-30', to: '2027-12-30', fee: 1200 },
      { from: '2027-12-30', to: '2028-12-30', fee: 1278 },
    ]);
  });

  it('projects nothing when the horizon ends before the renewal date', () => {
    const segments = sidSeatSegments(
      phil,
      UNBOUNDED,
      new Date('2027-01-01T00:00:00.000Z'),
    );
    expect(segments.map((s) => s.source)).toEqual(['year-entry', 'year-entry']);
  });

  it('keeps a month-end anchor from drifting across slices', () => {
    const segments = sidSeatSegments(
      seat({
        contractDate: '2024-02-29',
        terms: [{ renewalDate: '2028-02-29', monthlyPrice: 100 }],
      }),
      UNBOUNDED,
      new Date('2028-01-01T00:00:00.000Z'),
    );
    expect(segments.map((s) => s.from)).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
    ]);
  });

  it('prices the terminal at its term price, exchange charges apart', () => {
    const withExchange = seat({
      terms: [{ renewalDate: '2027-12-30', monthlyPrice: 2360 }],
      exchange: [{ reportMonth: '2026-07-01', monthlyExchangeCost: 40.25 }],
      entitlements: [],
    });

    const segments = sidSeatSegments(withExchange, UNBOUNDED, HORIZON);
    const price = segments.filter(
      (s) => s.productId === sidSeatProductId(withExchange),
    );
    const exchange = segments.filter(
      (s) => s.productId === sidSeatExchangeProductId(withExchange),
    );

    expect(price[0].fee).toBe(28320);
    expect(exchange.every((s) => s.fee === 40.25)).toBe(true);
    expect(exchange[0]).toMatchObject({
      from: '2025-01-01',
      to: '2025-02-01',
      source: 'year-entry',
      confidence: 'explicit',
    });
  });

  it('steps the seat price, and only the seat price, on the projected renewal term', () => {
    const stepping = seat({
      exchange: [{ reportMonth: '2026-07-01', monthlyExchangeCost: 10 }],
      entitlements: [],
    });

    const segments = sidSeatSegments(
      stepping,
      UNBOUNDED,
      new Date('2029-01-01T00:00:00.000Z'),
    );
    const price = segments.filter(
      (s) => s.productId === sidSeatProductId(stepping),
    );
    const exchange = segments.filter(
      (s) => s.productId === sidSeatExchangeProductId(stepping),
    );

    expect(
      price.filter((s) => s.source === 'year-entry').map((s) => s.fee),
    ).toEqual([1200, 1200, 1200]);
    expect(
      price.filter((s) => s.source === 'renewal-projection').map((s) => s.fee),
    ).toEqual([1278, 1278]);
    expect(new Set(exchange.map((s) => s.fee))).toEqual(new Set([10]));
    expect(exchange.some((s) => s.source === 'renewal-projection')).toBe(false);
  });
});

describe('sidSeatSegments bounded to the query window', () => {
  const FY2026 = FY2026_WINDOW;
  const veteran = seat({
    contractDate: '2000-04-07',
    terms: [{ renewalDate: '2027-04-07', monthlyPrice: 100 }],
  });

  it('emits only the slices overlapping the window, at their true dates', () => {
    const segments = sidSeatSegments(veteran, FY2026.start, FY2026.end);

    expect(
      segments.map(({ from, to, source }) => ({ from, to, source })),
    ).toEqual([
      { from: '2025-04-07', to: '2026-04-07', source: 'year-entry' },
      { from: '2026-04-07', to: '2027-04-07', source: 'year-entry' },
    ]);
  });

  it('keeps the projection when the renewal falls inside the window', () => {
    const renewing = seat({
      contractDate: '2000-04-07',
      terms: [{ renewalDate: '2026-04-07', monthlyPrice: 100 }],
    });

    const segments = sidSeatSegments(renewing, FY2026.start, FY2026.end);

    expect(
      segments.map(({ from, to, source }) => ({ from, to, source })),
    ).toEqual([
      { from: '2025-04-07', to: '2026-04-07', source: 'year-entry' },
      { from: '2026-04-07', to: '2027-04-07', source: 'renewal-projection' },
    ]);
  });

  // The bound is an optimisation, not a semantic: what it drops is exactly what
  // every basis would have discarded at placement.
  it.each([
    ['the seat contract year', { fiscalYear: 2025 }],
    ['a mid-life year', { fiscalYear: 2026 }],
    ['the renewal year', { fiscalYear: 2027 }],
    ['the projected term', { fiscalYear: 2028 }],
    ['a whole lifetime', { from: '2000-01-01', to: '2030-01-01' } as const],
  ])(
    'books the same amortized, actual and committed totals as an unbounded resolver over %s',
    (_label, window) => {
      const seats = [veteran, cindy, phil];
      const contracts = sidSpendContracts(seats);
      const unbounded: SegmentResolver = (contract, _lineage, resolveOptions) =>
        seats
          .filter((s) => sidContractId(s.custNum) === contract.id)
          .flatMap((s) =>
            sidSeatSegments(s, UNBOUNDED, resolveOptions.horizonEnd),
          );

      for (const basis of ['amortized', 'actual', 'committed'] as const) {
        const query = { ...fy2026, basis, window };
        expect(
          sumValues(
            querySpend(contracts, query, undefined, {
              resolveSegments: sidSegmentResolver(seats),
            }).items,
          ),
        ).toBe(
          sumValues(
            querySpend(contracts, query, undefined, {
              resolveSegments: unbounded,
            }).items,
          ),
        );
      }
    },
  );

  // queryTCV sums EVERY recorded segment a resolver hands it, so over seats it
  // now reports the window's slices rather than the seat's whole subscription.
  // No surface runs TCV (or renewals) over seats; this pins the behaviour for
  // whoever first does.
  it('reports a window-relative TCV over seats', () => {
    const contracts = sidSpendContracts([cindy]);
    const fy2027 = {
      ...fy2026,
      window: { fiscalYear: 2027 } as const,
      groupBy: 'total' as const,
    };

    const bounded = queryTCV(contracts, fy2027, undefined, {
      resolveSegments: sidSegmentResolver([cindy]),
    });
    const unbounded = queryTCV(contracts, fy2027, undefined, {
      resolveSegments: (contract, _lineage, resolveOptions) =>
        sidSeatSegments(cindy, UNBOUNDED, resolveOptions.horizonEnd),
    });

    expect(sumValues(bounded.items)).toBe(1200);
    expect(sumValues(unbounded.items)).toBe(3600);
  });
});

// The worked example: SID 266891/5 across the February, March and April 2026
// Berenberg imports. The seat renewed on 2026-04-07 and stepped 6.5%; only its
// exchange entitlements move month to month.
describe('a seat priced per term with monthly exchange charges', () => {
  const berenberg = (overrides: Partial<SidSeat> = {}): SidSeat =>
    seat({
      sid: 266891,
      sidInstNum: 5,
      lastUser: 'user 492 ffm',
      contractDate: '2000-04-07',
      terms: [
        { renewalDate: '2026-04-07', monthlyPrice: 2215 },
        { renewalDate: '2028-04-07', monthlyPrice: 2360 },
      ],
      exchange: [
        { reportMonth: '2026-02-01', monthlyExchangeCost: 52 },
        { reportMonth: '2026-03-01', monthlyExchangeCost: 51.1 },
        { reportMonth: '2026-04-01', monthlyExchangeCost: 51.1 },
      ],
      entitlements: [],
      ...overrides,
    });

  const monthlySeries = (seats: SidSeat[]): Record<string, number> =>
    byPeriod(
      querySpend(
        sidSpendContracts(seats),
        { ...fy2026, granularity: 'month' },
        undefined,
        { resolveSegments: sidSegmentResolver(seats) },
      ).items,
    );

  it('books each month at the term in force plus that month exchange charges', () => {
    expect(monthlySeries([berenberg()])).toEqual({
      // Before the first import: the earliest term's price, the earliest
      // report's exchange charges.
      '2026-01': 2267,
      '2026-02': 2267,
      '2026-03': 2266.1,
      // The renewal steps the price on the 7th; the April report's exchange
      // charges carry through the rest of the year.
      '2026-04': 2411.1,
      '2026-05': 2411.1,
      '2026-06': 2411.1,
      '2026-07': 2411.1,
      '2026-08': 2411.1,
      '2026-09': 2411.1,
      '2026-10': 2411.1,
      '2026-11': 2411.1,
      '2026-12': 2411.1,
    });
  });

  it('commits the whole incoming term in the fiscal year it starts', () => {
    const seats = [berenberg()];
    const committed = querySpend(
      sidSpendContracts(seats),
      { ...fy2026, basis: 'committed', groupBy: 'product' },
      undefined,
      { resolveSegments: sidSegmentResolver(seats) },
    );

    expect(totalsByKey(committed.items)[priceKeyOf(seats[0])]).toBe(
      2360 * MONTHS_PER_YEAR,
    );
  });

  it('stops a seat that disappears from the reports at the end of its last month', () => {
    const gone = berenberg({
      lastReportMonth: '2026-03-01',
      exchange: [
        { reportMonth: '2026-02-01', monthlyExchangeCost: 52 },
        { reportMonth: '2026-03-01', monthlyExchangeCost: 51.1 },
      ],
      entitlements: [],
    });

    expect(monthlySeries([gone])).toEqual({
      '2026-01': 2267,
      '2026-02': 2267,
      '2026-03': 2266.1,
    });
    expect(
      sidSeatSegments(gone, FY2026_WINDOW.start, FY2026_WINDOW.end).some(
        (s) => s.source === 'renewal-projection',
      ),
    ).toBe(false);
  });

  it('carries nothing back past a seat contracted after the earliest import', () => {
    const joined = berenberg({
      contractDate: '2026-03-15',
      terms: [{ renewalDate: '2028-03-15', monthlyPrice: 2360 }],
      exchange: [
        { reportMonth: '2026-03-01', monthlyExchangeCost: 51.1 },
        { reportMonth: '2026-04-01', monthlyExchangeCost: 51.1 },
      ],
      entitlements: [],
    });

    expect(monthlySeries([joined])).toEqual({
      '2026-03': 2411.1,
      '2026-04': 2411.1,
      '2026-05': 2411.1,
      '2026-06': 2411.1,
      '2026-07': 2411.1,
      '2026-08': 2411.1,
      '2026-09': 2411.1,
      '2026-10': 2411.1,
      '2026-11': 2411.1,
      '2026-12': 2411.1,
    });
  });

  it('carries the previous report exchange charges through a month with no import', () => {
    const skipped = berenberg({
      exchange: [
        { reportMonth: '2026-02-01', monthlyExchangeCost: 52 },
        { reportMonth: '2026-04-01', monthlyExchangeCost: 51.1 },
      ],
      entitlements: [],
    });
    const seats = [skipped];
    const byProduct = querySpend(
      sidSpendContracts(seats),
      { ...fy2026, granularity: 'month', groupBy: 'product' },
      undefined,
      { resolveSegments: sidSegmentResolver(seats) },
    );

    expect(
      byPeriod(
        byProduct.items.filter((i) => i.groupKey === exchangeKeyOf(skipped)),
      ),
    ).toMatchObject({
      '2026-01': 52,
      '2026-02': 52,
      '2026-03': 52,
      '2026-04': 51.1,
    });
  });
});

describe('sidSpendContracts', () => {
  it('builds one negative-id input per billing account', () => {
    const other = seat({
      custNum: 715298,
      accountName: 'Zurich',
      lastUser: 'Z',
      contractDate: '2010-04-14',
    });
    const contracts = sidSpendContracts([cindy, phil, other]);
    expect(contracts.map((c) => c.id)).toEqual([
      sidContractId(30041555),
      sidContractId(715298),
    ]);
    expect(contracts[0]).toMatchObject({
      id: -30041555,
      vendor_id: VENDOR_ID,
      currency: 'USD',
      billing_frequency: 'monthly',
      term_start_date: [{ date: '2025-01-01' }],
    });
    expect(contracts[0].vendor_products_details).toEqual([
      { product_id: sidSeatProductId(cindy), year: 1, fees: 1200 },
      { product_id: sidSeatExchangeProductId(cindy), year: 1, fees: 0 },
      { product_id: sidSeatProductId(phil), year: 1, fees: 1200 },
      { product_id: sidSeatExchangeProductId(phil), year: 1, fees: 0 },
    ]);
    expect(contracts[1].term_start_date).toEqual([{ date: '2010-04-14' }]);
  });

  it('prices the fee rows at the latest term and the latest exchange charges', () => {
    const stepped = seat({
      terms: [
        { renewalDate: '2026-04-07', monthlyPrice: 2215 },
        { renewalDate: '2028-04-07', monthlyPrice: 2360 },
      ],
      exchange: [
        { reportMonth: '2026-02-01', monthlyExchangeCost: 52 },
        { reportMonth: '2026-04-01', monthlyExchangeCost: 51.1 },
      ],
      entitlements: [],
    });

    expect(sidSpendContracts([stepped])[0].vendor_products_details).toEqual([
      { product_id: sidSeatProductId(stepped), year: 1, fees: 28320 },
      { product_id: sidSeatExchangeProductId(stepped), year: 1, fees: 613.2 },
    ]);
  });

  it('keeps seat ids unique across instances of one SID', () => {
    expect(sidSeatProductId({ sid: 10, sidInstNum: 1 })).not.toBe(
      sidSeatProductId({ sid: 10, sidInstNum: 2 }),
    );
    expect(sidSeatProductId({ sid: 4805414, sidInstNum: 5 })).toBeLessThan(0);
  });

  it('rejects an instance number outside the id space rather than colliding with the next SID', () => {
    expect(sidSeatProductId({ sid: 10, sidInstNum: 999 })).not.toBe(
      sidSeatProductId({ sid: 11, sidInstNum: 0 }),
    );
    expect(() => sidSeatProductId({ sid: 10, sidInstNum: 1000 })).toThrow(
      RangeError,
    );
    expect(() => sidSeatProductId({ sid: 10, sidInstNum: -1 })).toThrow(
      RangeError,
    );
  });

  it('keeps a seat exchange product out of every other id block', () => {
    const ids = [
      sidContractId(cindy.custNum),
      ...[cindy, phil].flatMap((s) => [
        sidSeatProductId(s),
        sidSeatExchangeProductId(s),
      ]),
    ];

    expect(new Set(ids).size).toBe(ids.length);
    expect(sidSeatExchangeProductId(cindy)).toBeLessThan(
      sidSeatProductId(phil),
    );
  });
});

describe('seats through the engine', () => {
  const seats = [cindy, phil];
  const contracts = sidSpendContracts(seats);
  const options = { resolveSegments: sidSegmentResolver(seats) };

  it('amortizes each seat at its monthly rate inside its own period', () => {
    const { items } = querySpend(contracts, fy2026, undefined, options);
    expect(sumValues(items)).toBe(2400);

    const monthly = querySpend(
      contracts,
      { ...fy2026, granularity: 'month', groupBy: 'product' },
      undefined,
      options,
    ).items;
    const philKey = `${sidContractId(phil.custNum)}:${sidSeatProductId(phil)}`;
    const philMonths = monthly.filter((i) => i.groupKey === philKey);
    expect(philMonths).toHaveLength(12);
    expect(philMonths.every((i) => i.value === 100)).toBe(true);
  });

  it('books a seat before its contract date nowhere', () => {
    const { items } = querySpend(
      contracts,
      { ...fy2026, window: { fiscalYear: 2024 } },
      undefined,
      options,
    );
    expect(items).toEqual([]);
  });

  it('bills monthly on the actual basis and one year-slice per FY on the committed basis', () => {
    const actual = querySpend(
      contracts,
      { ...fy2026, basis: 'actual' },
      undefined,
      options,
    );
    expect(sumValues(actual.items)).toBe(2400);

    const committed = querySpend(
      contracts,
      { ...fy2026, basis: 'committed' },
      undefined,
      options,
    );
    expect(sumValues(committed.items)).toBe(2400);

    const contractTerm = queryCommitments(
      contracts,
      { ...fy2026, valuation: 'annual', recognition: 'term-start' },
      undefined,
      options,
    );
    expect(sumValues(contractTerm.items)).toBe(2400);
    expect(new Set(contractTerm.items.map((i) => i.kind))).toEqual(
      new Set(['multi-year']),
    );

    const renewalYear = queryCommitments(
      contracts,
      {
        ...fy2026,
        window: { fiscalYear: 2027 },
        valuation: 'annual',
        recognition: 'term-start',
      },
      undefined,
      options,
    );
    expect(sumValues(renewalYear.items)).toBe(2556);
    expect(new Set(renewalYear.items.map((i) => i.kind))).toEqual(
      new Set(['renewal']),
    );
  });

  it('projects a renewed seat at the stepped rate for one renewal term, then stops', () => {
    const renewalYear = querySpend(
      contracts,
      { ...fy2026, window: { fiscalYear: 2028 } },
      undefined,
      options,
    );
    expect(sumValues(renewalYear.items)).toBe(2556);

    const afterTerm = querySpend(
      contracts,
      { ...fy2026, window: { fiscalYear: 2030 } },
      undefined,
      options,
    );
    expect(afterTerm.items).toEqual([]);
  });

  it('converts at the monthly rate under the base policy', () => {
    const eur: CurrencyPolicy = {
      mode: 'base',
      target: 'EUR',
      rates: { monthRate: () => 0.9, dateRate: () => 0.9 },
    };
    const { items } = querySpend(
      contracts,
      { ...fy2026, currency: eur },
      undefined,
      options,
    );
    expect(sumValues(items)).toBe(2160);
    expect(items[0]).toMatchObject({
      nativeValue: 2400,
      nativeCurrency: 'USD',
    });
  });
});

describe('sidAllocations', () => {
  const employee: AllocationEmployee = {
    id: 7,
    name: 'Cindy Example',
    org_unit_id: 10,
    cost_center_unit_id: 20,
    active: true,
  };
  const employeeOf = (lastUser: string) =>
    lastUser === 'Cindy Example' ? employee : undefined;

  it("allocates a matched seat's terminal and exchange products wholly to its employee, and leaves an unmatched seat unassigned", () => {
    const resolved = sidAllocations([cindy, phil], employeeOf);
    const account = resolved.get(sidContractId(cindy.custNum));
    const lines = [
      {
        target: {
          kind: 'employee',
          id: 7,
          name: 'Cindy Example',
          orgUnitId: 10,
          costCenterUnitId: 20,
        },
        percent: 100,
      },
    ];
    const scope = (productId: number, scopeLines: unknown[]) => ({
      productId,
      mode: 'manual',
      sourceContractId: sidContractId(cindy.custNum),
      lines: scopeLines,
      unlinkedUserCount: 0,
    });

    expect(account?.scopes).toEqual([
      scope(sidSeatProductId(cindy), lines),
      scope(sidSeatExchangeProductId(cindy), lines),
      scope(sidSeatProductId(phil), []),
      scope(sidSeatExchangeProductId(phil), []),
    ]);
  });

  it('splits the engine allocation dimension per seat holder', () => {
    const seats = [cindy, phil];
    const units = new Map<number, OrgUnitNode>([
      [10, { id: 10, level: 'department', name: 'Trading', parent_id: null }],
    ]);
    const allocations = {
      resolved: sidAllocations(seats, employeeOf),
      unitsById: units,
    };
    const byUser = querySpend(
      sidSpendContracts(seats),
      { ...fy2026, groupBy: { kind: 'allocation', level: 'user' } },
      undefined,
      { resolveSegments: sidSegmentResolver(seats), allocations },
    );
    expect(totalsByKey(byUser.items)).toEqual({
      'user:7': 1200,
      unassigned: 1200,
    });

    const byDepartment = querySpend(
      sidSpendContracts(seats),
      { ...fy2026, groupBy: { kind: 'allocation', level: 'department' } },
      undefined,
      { resolveSegments: sidSegmentResolver(seats), allocations },
    );
    expect(totalsByKey(byDepartment.items)).toEqual({
      'unit:10': 1200,
      unassigned: 1200,
    });
  });
});

describe('sidSpendRefs', () => {
  it('gives the terminal and its exchange charges the same product identity, so a product rollup folds them', () => {
    const refs = sidSpendRefs([cindy], {
      id: VENDOR_ID,
      name: 'Bloomberg Finance L.P.',
      domain: 'bloomberg.com',
    });
    const seatRef = {
      label: 'Bloomberg Anywhere · Cindy Example',
      vendorDomain: 'bloomberg.com',
      productName: 'Bloomberg Anywhere',
      vendorId: VENDOR_ID,
      productId: 28,
    };
    const entitlementsRef = {
      label: 'Exchange entitlements · Cindy Example',
      vendorDomain: 'bloomberg.com',
      productName: 'Bloomberg Anywhere',
      vendorId: VENDOR_ID,
      productId: 28,
    };

    expect(refs).toEqual({
      '469': { label: 'Bloomberg Finance L.P.', vendorDomain: 'bloomberg.com' },
      '-30041555': {
        label: 'Bloomberg Finance L.P.',
        vendorDomain: 'bloomberg.com',
        productName: 'Bloomberg SID · Berenberg London',
        vendorId: VENDOR_ID,
      },
      [priceKeyOf(cindy)]: seatRef,
      [exchangeKeyOf(cindy)]: entitlementsRef,
    });
  });
});

describe('mergeLineItems', () => {
  it('sums shared buckets, keeps kinds apart, and drops the native figure when currencies mix', () => {
    const merged = mergeLineItems([
      [
        {
          period: 'FY2026',
          groupKey: 'total',
          value: 10,
          nativeValue: 9,
          nativeCurrency: 'EUR',
        },
        {
          period: 'FY2026',
          groupKey: 'total',
          value: 1,
          nativeValue: 1,
          nativeCurrency: 'EUR',
          kind: 'new',
        },
      ],
      [
        {
          period: 'FY2026',
          groupKey: 'total',
          value: 5,
          nativeValue: 6,
          nativeCurrency: 'USD',
        },
        {
          period: 'FY2027',
          groupKey: 'total',
          value: 2,
          nativeValue: 2,
          nativeCurrency: 'EUR',
        },
        {
          period: 'FY2026',
          groupKey: 'total',
          value: 3,
          nativeValue: 3,
          nativeCurrency: 'EUR',
          kind: 'new',
        },
      ],
    ]);
    expect(merged).toEqual([
      { period: 'FY2026', groupKey: 'total', value: 15 },
      {
        period: 'FY2027',
        groupKey: 'total',
        value: 2,
        nativeValue: 2,
        nativeCurrency: 'EUR',
      },
      {
        period: 'FY2026',
        groupKey: 'total',
        value: 4,
        nativeValue: 4,
        nativeCurrency: 'EUR',
        kind: 'new',
      },
    ]);
  });

  it('is the identity over one list', () => {
    const items = [{ period: '2026-01', groupKey: 'a', value: 1.5 }];
    expect(mergeLineItems([items])).toEqual(items);
  });
});

describe('collapseSidLineItems', () => {
  const vendor = {
    id: VENDOR_ID,
    name: 'Bloomberg Finance L.P.',
    domain: 'bloomberg.com',
  };
  const frankfurt = seat({
    custNum: 30099001,
    accountName: 'Berenberg Frankfurt',
    sid: 7000001,
    sidInstNum: 1,
    lastUser: 'Ada Example',
  });
  const refs = sidSpendRefs([cindy, frankfurt], vendor);
  const londonKey = String(sidContractId(cindy.custNum));
  const frankfurtKey = String(sidContractId(frankfurt.custNum));

  it('folds every billing account into one Bloomberg key per period and leaves contracts alone', () => {
    const { items, refs: collapsed } = collapseSidLineItems(
      [
        { period: '2026-01', groupKey: '12', value: 50 },
        { period: '2026-01', groupKey: londonKey, value: 100 },
        { period: '2026-01', groupKey: frankfurtKey, value: 100 },
        { period: '2026-02', groupKey: londonKey, value: 100 },
      ],
      refs,
    );

    expect(items).toEqual([
      { period: '2026-01', groupKey: '12', value: 50 },
      { period: '2026-01', groupKey: sidRollupKey(VENDOR_ID), value: 200 },
      { period: '2026-02', groupKey: sidRollupKey(VENDOR_ID), value: 100 },
    ]);
    expect(collapsed[sidRollupKey(VENDOR_ID)]).toEqual({
      label: 'Bloomberg Finance L.P.',
      vendorDomain: 'bloomberg.com',
      productName: 'Terminals and exchange entitlements',
      vendorId: VENDOR_ID,
    });
    expect(collapsed[londonKey]).toEqual(refs[londonKey]);
  });

  it('keeps the native figure when every account bills in one currency', () => {
    const { items } = collapseSidLineItems(
      [
        {
          period: '2026-01',
          groupKey: londonKey,
          value: 90,
          nativeValue: 100,
          nativeCurrency: 'USD',
        },
        {
          period: '2026-01',
          groupKey: frankfurtKey,
          value: 45,
          nativeValue: 50,
          nativeCurrency: 'USD',
        },
      ],
      refs,
    );

    expect(items).toEqual([
      {
        period: '2026-01',
        groupKey: sidRollupKey(VENDOR_ID),
        value: 135,
        nativeValue: 150,
        nativeCurrency: 'USD',
      },
    ]);
  });

  it('returns the input untouched when no item is a seat account', () => {
    const items = [{ period: '2026-01', groupKey: '12', value: 50 }];
    const result = collapseSidLineItems(items, refs);

    expect(result.items).toBe(items);
    expect(result.refs).toBe(refs);
  });
});

describe('isSidVendorInvoice', () => {
  const sidVendors = new Set([VENDOR_ID]);
  const row = (vendorId: number | null, typeId: number) => ({
    vendor_id: vendorId,
    contract: { type_id: typeId },
  });

  it("names only the seat vendor's invoices", () => {
    expect(isSidVendorInvoice(row(VENDOR_ID, 6), sidVendors)).toBe(true);
    expect(isSidVendorInvoice(row(VENDOR_ID, 13), sidVendors)).toBe(true);
    expect(isSidVendorInvoice(row(VENDOR_ID, 2), sidVendors)).toBe(false);
    expect(isSidVendorInvoice(row(7, 6), sidVendors)).toBe(false);
    expect(isSidVendorInvoice(row(null, 6), sidVendors)).toBe(false);
  });
});

describe('sidNextRenewalDate', () => {
  const today = new Date('2026-09-08T00:00:00.000Z');

  it('is the latest observed renewal date while it lies ahead', () => {
    expect(sidNextRenewalDate(cindy, today)).toBe('2027-12-30');
  });

  it('steps a passed renewal forward by whole two-year terms', () => {
    const passed = seat({
      terms: [{ renewalDate: '2026-04-07', monthlyPrice: 100 }],
    });
    expect(sidNextRenewalDate(passed, today)).toBe('2028-04-07');

    const longPassed = seat({
      terms: [{ renewalDate: '2020-10-01', monthlyPrice: 100 }],
    });
    expect(sidNextRenewalDate(longPassed, today)).toBe('2026-10-01');
  });

  it('counts a renewal falling on today as still ahead', () => {
    const dueToday = seat({
      terms: [{ renewalDate: '2026-09-08', monthlyPrice: 100 }],
    });
    expect(sidNextRenewalDate(dueToday, today)).toBe('2026-09-08');
  });
});

describe('sidSeatGoneBefore', () => {
  const april = new Date('2026-04-01T00:00:00.000Z');

  it('is true once the month after the seat was last seen has begun', () => {
    expect(
      sidSeatGoneBefore(seat({ lastReportMonth: '2026-03-01' }), april),
    ).toBe(true);
    expect(
      sidSeatGoneBefore(seat({ lastReportMonth: '2026-04-01' }), april),
    ).toBe(false);
  });

  it('is never true for a seat still in the latest report', () => {
    expect(sidSeatGoneBefore(cindy, april)).toBe(false);
  });
});
