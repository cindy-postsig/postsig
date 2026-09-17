import { querySpend, queryRenewals, queryTCV } from '@/lib/v2/spend';
import type {
  SpendContractInput,
  SpendEventQuery,
  SpendGroupBy,
  SpendQuery,
  SpendRateProvider,
  SpendResult,
} from '@/lib/v2/spend';

// ---------------------------------------------------------------------------
// Stub provider. Every calendar month and every date carries its OWN rate, so
// a figure converted against the wrong period is visibly wrong rather than
// coincidentally right — and dateRate is never equal to the month rate of the
// same month, which is what separates the term-start bases (committed, the
// event views) from the monthly ones (amortized, actual) in the expectations
// below.
// ---------------------------------------------------------------------------
function monthRateOf(monthKey: string): number {
  const [year, month] = monthKey.split('-').map(Number);
  return (50 + month + (year - 2025) * 10) / 100;
}

function dateRateOf(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return (500 + month * 10 + (year - 2025) * 100 + day) / 1000;
}

interface RecordingRates extends SpendRateProvider {
  monthCalls: string[];
  dateCalls: string[];
}

function stubRates(): RecordingRates {
  const monthCalls: string[] = [];
  const dateCalls: string[] = [];
  return {
    monthCalls,
    dateCalls,
    monthRate(from, monthKey) {
      monthCalls.push(`${from}@${monthKey}`);
      return monthRateOf(monthKey);
    },
    dateRate(from, isoDate) {
      dateCalls.push(`${from}@${isoDate}`);
      return dateRateOf(isoDate);
    },
  };
}

// A provider that must never be consulted: the identity path (contract already
// denominated in the target) has to skip the multiplication entirely.
const forbiddenRates: SpendRateProvider = {
  monthRate() {
    throw new Error('monthRate called on an identity conversion');
  },
  dateRate() {
    throw new Error('dateRate called on an identity conversion');
  },
};

const flatRates = (rate: number): SpendRateProvider => ({
  monthRate: () => rate,
  dateRate: () => rate,
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
interface ContractSpec {
  id: number;
  vendorId?: number;
  currency?: string;
  sponsor?: string[];
  billingFrequency?: string;
  renewalType?: string;
  termStart?: string;
  termEnd?: string;
  /** One product per fee, ids 100, 200, ... in order. */
  fees: number | number[];
}

const sponsorOwnerRows = (names: readonly string[]) =>
  names.map((label, index) => ({
    id: index + 1,
    role: 'sponsor',
    user_id: null,
    org_employee_id: null,
    label,
    org_unit_id: null,
  }));

function makeContract(spec: ContractSpec): SpendContractInput {
  return {
    id: spec.id,
    vendor_id: spec.vendorId ?? 1,
    type_id: 2,
    status: 'active',
    currency: spec.currency ?? 'usd',
    contract_owners: sponsorOwnerRows(spec.sponsor ?? []),
    annual_increase: null,
    annual_increase_months: null,
    subscription_term: 12,
    renewal_period: 12,
    renewal_type: spec.renewalType ?? 'One-Time',
    billing_frequency: spec.billingFrequency ?? 'Annually',
    will_not_renew: false,
    term_start_date: [{ date: spec.termStart ?? '2025-01-01' }],
    term_end_date: [{ date: spec.termEnd ?? '2025-12-31' }],
    cancel_by_date: null,
    vendor_products_details: (Array.isArray(spec.fees)
      ? spec.fees
      : [spec.fees]
    ).map((fees, index) => ({
      product_id: 100 * (index + 1),
      year: 1,
      fees,
      // The pre-converted USD stamp is deliberately 10x the recorded fee, so
      // any number sourced from it instead of the native fee is unmistakable.
      convertedFees: fees * 10,
    })),
  };
}

const AS_OF = new Date('2025-06-15T00:00:00.000Z');
const FY2025 = { from: '2025-01-01', to: '2026-01-01' } as const;
const JANUARY_FY = { startMonth: 1 };
// April fiscal start, so a year bucket is provably NOT a calendar year.
const APRIL_FY = { startMonth: 4 };

function query(overrides: Partial<SpendQuery> & Pick<SpendQuery, 'currency'>) {
  return {
    basis: 'amortized',
    source: 'expected',
    window: FY2025,
    granularity: 'month',
    groupBy: 'total',
    fiscalConfig: JANUARY_FY,
    asOf: AS_OF,
    ...overrides,
  } as SpendQuery;
}

const cents = (value: number): number => Math.round(value * 100) / 100;

const sumByPeriod = (result: { items: SpendResult['items'] }) => {
  const totals = new Map<string, number>();
  for (const item of result.items) {
    totals.set(item.period, cents((totals.get(item.period) ?? 0) + item.value));
  }
  return totals;
};

const valuesByPeriod = (result: { items: SpendResult['items'] }) =>
  result.items.map((item) => [item.period, item.value] as const);

// ---------------------------------------------------------------------------
// Amortized — the flow basis: each month of service converts at its own month.
// ---------------------------------------------------------------------------
describe('base currency, amortized basis: month-by-month conversion', () => {
  const usdContract = makeContract({ id: 1, fees: 1200 });

  it("converts each month's native slice at that month's rate", () => {
    const rates = stubRates();
    const result = querySpend(
      [usdContract],
      query({ currency: { mode: 'base', target: 'eur', rates } }),
    );

    // Native monthly slice is 1200/12 = 100, so each bucket reads the month's
    // rate straight off: 0.51 in January through 0.62 in December.
    expect(valuesByPeriod(result)).toEqual([
      ['2025-01', 51],
      ['2025-02', 52],
      ['2025-03', 53],
      ['2025-04', 54],
      ['2025-05', 55],
      ['2025-06', 56],
      ['2025-07', 57],
      ['2025-08', 58],
      ['2025-09', 59],
      ['2025-10', 60],
      ['2025-11', 61],
      ['2025-12', 62],
    ]);
    // Rates are looked up per CALENDAR month, always for the contract currency.
    expect(rates.monthCalls[0]).toBe('usd@2025-01');
    expect(rates.dateCalls).toEqual([]);
  });

  it('a YEAR bucket equals the sum of its converted months, on a non-January fiscal year', () => {
    const renewing = makeContract({
      id: 2,
      fees: 1200,
      renewalType: 'Auto',
    });
    const window = { from: '2025-04-01', to: '2026-04-01' };
    const run = (granularity: SpendQuery['granularity']) =>
      querySpend(
        [renewing],
        query({
          currency: { mode: 'base', target: 'eur', rates: stubRates() },
          window,
          granularity,
          fiscalConfig: APRIL_FY,
        }),
      );

    const monthly = run('month');
    const yearly = run('year');

    // FY2025 under an April fiscal start spans Apr-2025..Mar-2026, so it picks
    // up three months of the projected 2026 renewal term at 2026 rates.
    expect(valuesByPeriod(monthly)).toEqual([
      ['2025-04', 54],
      ['2025-05', 55],
      ['2025-06', 56],
      ['2025-07', 57],
      ['2025-08', 58],
      ['2025-09', 59],
      ['2025-10', 60],
      ['2025-11', 61],
      ['2025-12', 62],
      ['2026-01', 61],
      ['2026-02', 62],
      ['2026-03', 63],
    ]);
    const expected = monthly.items.reduce((sum, i) => cents(sum + i.value), 0);
    expect(expected).toBe(708);
    expect(valuesByPeriod(yearly)).toEqual([['FY2025', 708]]);
  });

  it('per-product placement converts and re-buckets on its own series', () => {
    const twoProducts = makeContract({ id: 5, fees: [1200, 2400] });
    const run = (groupBy: SpendGroupBy) =>
      querySpend(
        [twoProducts],
        query({
          currency: { mode: 'base', target: 'eur', rates: stubRates() },
          granularity: 'year',
          groupBy,
        }),
      );

    // Each product re-buckets on its OWN (product, period) series: 100/mo and
    // 200/mo, each month at that month's rate.
    const perMonth = (monthly: number) =>
      Array.from({ length: 12 }, (_, i) =>
        cents(monthly * monthRateOf(`2025-${String(i + 1).padStart(2, '0')}`)),
      ).reduce((sum, value) => cents(sum + value), 0);

    expect(run('product').items).toEqual([
      {
        period: 'FY2025',
        groupKey: '5:100',
        value: perMonth(100),
        nativeValue: 1200,
        nativeCurrency: 'USD',
      },
      {
        period: 'FY2025',
        groupKey: '5:200',
        value: perMonth(200),
        nativeValue: 2400,
        nativeCurrency: 'USD',
      },
    ]);
    expect(sumByPeriod(run('product'))).toEqual(sumByPeriod(run('total')));
  });

  it('daily proration converts by month and conserves the converted total', () => {
    const rates = stubRates();
    const result = querySpend(
      [usdContract],
      query({
        currency: { mode: 'base', target: 'eur', rates },
        proration: 'daily',
      }),
    );

    // One segment spans the whole 365-day year, so a month's native value is
    // exactly fee*days/spanDays before conversion.
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const expected = daysInMonth.map((days, index) => {
      const period = `2025-${String(index + 1).padStart(2, '0')}`;
      return [
        period,
        cents(((1200 * days) / 365) * monthRateOf(period)),
      ] as const;
    });
    expect(valuesByPeriod(result)).toEqual(expected);

    // Conservation: at ONE flat rate the converted year is the native year
    // times that rate, up to the per-month cent rounding.
    const flat = querySpend(
      [usdContract],
      query({
        currency: { mode: 'base', target: 'eur', rates: flatRates(0.8) },
        proration: 'daily',
        granularity: 'year',
      }),
    );
    expect(flat.items).toHaveLength(1);
    expect(Math.abs(flat.items[0].value - 1200 * 0.8)).toBeLessThan(0.12);
  });
});

// ---------------------------------------------------------------------------
// Actual — bills convert at the month they are billed in.
// ---------------------------------------------------------------------------
describe('base currency, actual basis: bills convert at their billing month', () => {
  it('a quarterly bill takes the rate of the month it lands in', () => {
    const quarterly = makeContract({
      id: 3,
      fees: 1200,
      billingFrequency: 'Quarterly',
    });
    const result = querySpend(
      [quarterly],
      query({
        basis: 'actual',
        currency: { mode: 'base', target: 'eur', rates: stubRates() },
      }),
    );

    // Four 300 bills, each at its own month's rate — Jan 0.51, Apr 0.54,
    // Jul 0.57, Oct 0.60.
    expect(valuesByPeriod(result)).toEqual([
      ['2025-01', 153],
      ['2025-04', 162],
      ['2025-07', 171],
      ['2025-10', 180],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Committed and the event views — the term-start rule.
// ---------------------------------------------------------------------------
describe('base currency, committed basis: each term at its own term-start rate', () => {
  const renewing = makeContract({ id: 4, fees: 1200, renewalType: 'Auto' });
  const twoYears = { from: '2025-01-01', to: '2027-01-01' } as const;

  it('an initial term and its renewal convert at different rates', () => {
    const rates = stubRates();
    const result = querySpend(
      [renewing],
      query({
        basis: 'committed',
        granularity: 'year',
        window: twoYears,
        currency: { mode: 'base', target: 'eur', rates },
      }),
    );

    // 2025-01-01 -> 0.511, 2026-01-01 -> 0.611. One blended rate could not
    // produce both numbers.
    expect(valuesByPeriod(result)).toEqual([
      ['FY2025', cents(1200 * 0.511)],
      ['FY2026', cents(1200 * 0.611)],
    ]);
    expect(rates.dateCalls).toContain('usd@2025-01-01');
    expect(rates.dateCalls).toContain('usd@2026-01-01');
    expect(rates.monthCalls).toEqual([]);
  });

  it('queryRenewals values a renewal at its term-start rate', () => {
    const eventQuery: SpendEventQuery = {
      window: { from: '2026-01-01', to: '2027-01-01' },
      granularity: 'year',
      groupBy: 'total',
      currency: { mode: 'base', target: 'eur', rates: stubRates() },
      fiscalConfig: JANUARY_FY,
      asOf: AS_OF,
    };
    expect(queryRenewals([renewing], eventQuery).items).toEqual([
      {
        period: 'FY2026',
        groupKey: 'total',
        value: cents(1200 * 0.611),
        // One contract in the bucket, so its native figure rides along even
        // under groupBy 'total' (psk-1796).
        nativeValue: 1200,
        nativeCurrency: 'USD',
      },
    ]);
  });

  it('queryTCV converts at the TERM START, not at the committed-end event date', () => {
    const eventQuery: SpendEventQuery = {
      window: FY2025,
      granularity: 'year',
      groupBy: 'total',
      currency: { mode: 'base', target: 'eur', rates: stubRates() },
      fiscalConfig: JANUARY_FY,
      asOf: AS_OF,
    };
    const result = queryTCV([renewing], eventQuery);
    expect(result.items).toEqual([
      {
        period: 'FY2025',
        groupKey: 'total',
        value: cents(1200 * 0.511),
        nativeValue: 1200,
        nativeCurrency: 'USD',
      },
    ]);
    // The event itself is dated 2025-12-31; its rate (0.643) is NOT the one
    // applied.
    expect(result.items[0].value).not.toBe(
      cents(1200 * dateRateOf('2025-12-31')),
    );
  });
});

// ---------------------------------------------------------------------------
// Mixed currencies — the reason the policy exists.
// ---------------------------------------------------------------------------
describe('base currency, mixed denominations', () => {
  const eurContract = makeContract({
    id: 10,
    vendorId: 10,
    currency: 'EUR',
    sponsor: ['Alice'],
    fees: 1000,
  });
  const usdContract = makeContract({
    id: 20,
    vendorId: 20,
    currency: 'usd',
    sponsor: ['Alice', 'Bob'],
    fees: 1000,
  });
  const basePolicy = () =>
    ({ mode: 'base', target: 'eur', rates: stubRates() }) as const;

  it('groupBy total equals the sum of the per-contract results', () => {
    const together = querySpend(
      [eurContract, usdContract],
      query({ currency: basePolicy() }),
    );
    const apart = [eurContract, usdContract].map((contract) =>
      querySpend([contract], query({ currency: basePolicy() })),
    );

    const summed = new Map<string, number>();
    for (const result of apart) {
      for (const [period, value] of sumByPeriod(result)) {
        summed.set(period, cents((summed.get(period) ?? 0) + value));
      }
    }
    expect(sumByPeriod(together)).toEqual(summed);
  });

  it('the USD contract converts while the EUR contract passes through untouched', () => {
    const converted = querySpend(
      [usdContract],
      query({ currency: basePolicy(), groupBy: 'contract' }),
    );
    // Native monthly slice is toCents(1000/12) = 83.33.
    expect(converted.items[0]).toEqual({
      period: '2025-01',
      groupKey: '20',
      value: cents(83.33 * 0.51),
      nativeValue: 83.33,
      nativeCurrency: 'USD',
    });

    // Identity: a contract already in the target must be byte-identical to a
    // native run — and must not touch the provider at all.
    const identity = querySpend(
      [eurContract],
      query({
        currency: { mode: 'base', target: 'EUR', rates: forbiddenRates },
        groupBy: 'contract',
      }),
    );
    const native = querySpend(
      [eurContract],
      query({ currency: { mode: 'native' }, groupBy: 'contract' }),
    );
    expect(identity.items).toEqual(native.items);
  });

  it('every groupBy stays additive under conversion', () => {
    const contracts = [eurContract, usdContract];
    // Nothing resolved: the allocation dimension still conserves the total,
    // with everything in the unassigned bucket.
    const emptyAllocations = {
      allocations: { resolved: new Map(), unitsById: new Map() },
    };
    const committed = (groupBy: SpendGroupBy) =>
      querySpend(
        contracts,
        query({
          basis: 'committed',
          granularity: 'year',
          groupBy,
          currency: basePolicy(),
        }),
        undefined,
        emptyAllocations,
      );

    const total = sumByPeriod(committed('total'));
    for (const groupBy of [
      'vendor',
      'sponsor',
      'contract',
      'product',
      { kind: 'allocation', level: 'business_group' },
    ] as const) {
      expect(sumByPeriod(committed(groupBy))).toEqual(total);
    }
    // The EUR contract keeps its native 1000; the USD one converts at 0.511.
    expect(total.get('FY2025')).toBe(cents(1000 + 1000 * 0.511));
  });

  it('is groupable everywhere, unlike native', () => {
    const contracts = [eurContract, usdContract];
    const emptyAllocations = {
      allocations: { resolved: new Map(), unitsById: new Map() },
    };
    const allocation = { kind: 'allocation', level: 'business_group' } as const;
    for (const groupBy of ['total', 'vendor', 'sponsor', allocation] as const) {
      expect(() =>
        querySpend(
          contracts,
          query({ currency: basePolicy(), groupBy }),
          undefined,
          emptyAllocations,
        ),
      ).not.toThrow();
      expect(() =>
        querySpend(
          contracts,
          query({ currency: { mode: 'native' }, groupBy }),
          undefined,
          emptyAllocations,
        ),
      ).toThrow(/native currency policy/);
    }
  });
});

// ---------------------------------------------------------------------------
// The pre-existing policies are untouched by the new arm.
// ---------------------------------------------------------------------------
describe('the existing currency policies are unchanged', () => {
  const contract = makeContract({ id: 30, currency: 'eur', fees: 1200 });

  it("'preconverted-usd' still reads the USD stamp", () => {
    const result = querySpend(
      [contract],
      query({ currency: { mode: 'preconverted-usd' }, granularity: 'year' }),
    );
    // The stamp is 10x the recorded fee (12000), amortized over the FY.
    expect(valuesByPeriod(result)).toEqual([['FY2025', 12000]]);
  });

  it("'native' still reads the recorded fee", () => {
    const result = querySpend(
      [contract],
      query({
        currency: { mode: 'native' },
        groupBy: 'contract',
        granularity: 'year',
      }),
    );
    expect(valuesByPeriod(result)).toEqual([['FY2025', 1200]]);
  });
});
