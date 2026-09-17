import { querySpend } from '@/lib/v2/spend';
import type {
  CurrencyPolicy,
  SpendContractInput,
  SpendQuery,
  SpendRateProvider,
} from '@/lib/v2/spend';
import {
  buildMonthlyValuesByContract,
  monthlyReportWindows,
} from '@/lib/v2/reports/monthly-report/engine';
import type { ContractWithPricing } from '@/lib/v2/core/types';

// ---------------------------------------------------------------------------
// PSK-1796's acceptance test, pinned as an engine invariant: the monthly
// amounts in the monthly intelligence report equal the monthly amounts in the
// amortized view of the budget chart. Both surfaces query the same engine
// under the same 'base' currency policy, so per-contract report values must
// sum to the chart's bucket for the same month — including when conversion
// applies a DIFFERENT rate to each month. A drift here means one surface
// converted against the wrong period.
// ---------------------------------------------------------------------------

// Every calendar month carries its own rate so a figure converted against the
// wrong month is visibly wrong rather than coincidentally right.
function monthRateOf(monthKey: string): number {
  const [year, month] = monthKey.split('-').map(Number);
  return (50 + month + (year - 2025) * 10) / 100;
}

const rates: SpendRateProvider = {
  monthRate: (_from, monthKey) => monthRateOf(monthKey),
  dateRate: () => 0.777,
};

interface Spec {
  id: number;
  currency: string;
  fees: number;
  termStart: string;
  termEnd: string;
  billingFrequency?: string;
}

function makeSpendInput(spec: Spec): SpendContractInput {
  return {
    id: spec.id,
    vendor_id: spec.id * 10,
    type_id: 2,
    status: 'active',
    currency: spec.currency,
    annual_increase: null,
    annual_increase_months: null,
    subscription_term: 12,
    renewal_period: 12,
    renewal_type: 'One-Time',
    billing_frequency: spec.billingFrequency ?? 'Quarterly',
    will_not_renew: false,
    term_start_date: [{ date: spec.termStart }],
    term_end_date: [{ date: spec.termEnd }],
    cancel_by_date: null,
    vendor_products_details: [
      { product_id: spec.id * 100, year: 1, fees: spec.fees },
    ],
  };
}

// The report engine takes the enriched shape but reads only `.contract` (plus
// lineage inputs this fixture leaves empty), so the wrapper is honest.
function makeEnriched(spec: Spec): ContractWithPricing {
  return {
    id: spec.id,
    vendor_id: spec.id * 10,
    contract: makeSpendInput(spec),
    products: [],
    isLinkedChildInvoice: false,
  } as unknown as ContractWithPricing;
}

// Mixed-currency org: a EUR contract (identity under a EUR base) and two USD
// contracts converted month by month, one of them straddling fiscal years.
const SPECS: Spec[] = [
  {
    id: 1,
    currency: 'eur',
    fees: 12000,
    termStart: '2026-01-01',
    termEnd: '2026-12-31',
  },
  {
    id: 2,
    currency: 'usd',
    fees: 9000,
    termStart: '2026-03-01',
    termEnd: '2027-02-28',
    billingFrequency: 'Monthly',
  },
  {
    id: 3,
    currency: 'usd',
    fees: 6000,
    termStart: '2025-10-15',
    termEnd: '2026-10-14',
  },
];

const POLICY: CurrencyPolicy = { mode: 'base', target: 'EUR', rates };

const cents = (value: number): number => Math.round(value * 100) / 100;

function chartMonthTotal(
  basis: 'amortized' | 'actual',
  monthKey: string,
  fiscalConfig: { startMonth: number },
  asOf: Date,
): number {
  const result = querySpend(SPECS.map(makeSpendInput), {
    basis,
    source: 'expected',
    window: 'currentFY',
    granularity: 'month',
    groupBy: 'total',
    currency: POLICY,
    fiscalConfig,
    asOf,
  } as SpendQuery);
  return cents(
    result.items
      .filter((item) => item.period === monthKey)
      .reduce((sum, item) => sum + item.value, 0),
  );
}

function reportMonthTotal(
  values: Map<number, { currentMonth: number; nextMonth: number }>,
  month: 'currentMonth' | 'nextMonth',
): number {
  return cents(
    [...values.values()].reduce((sum, value) => sum + value[month], 0),
  );
}

describe.each([
  ['January fiscal year', { startMonth: 1 }, new Date('2026-07-15T00:00:00Z')],
  ['April fiscal year', { startMonth: 4 }, new Date('2026-02-10T00:00:00Z')],
])(
  'monthly intelligence reconciles with the amortized budget chart (%s)',
  (_label, fiscalConfig, asOf) => {
    const windows = monthlyReportWindows(asOf, fiscalConfig);
    const report = buildMonthlyValuesByContract(
      SPECS.map(makeEnriched),
      [],
      fiscalConfig,
      asOf,
      { currency: POLICY },
    );

    it.each(['amortized', 'actual'] as const)(
      '%s: current month totals agree',
      (basis) => {
        expect(reportMonthTotal(report[basis], 'currentMonth')).toBe(
          chartMonthTotal(basis, windows.currentMonthKey, fiscalConfig, asOf),
        );
      },
    );

    it.each(['amortized', 'actual'] as const)(
      '%s: next month totals agree',
      (basis) => {
        expect(reportMonthTotal(report[basis], 'nextMonth')).toBe(
          chartMonthTotal(basis, windows.nextMonthKey, fiscalConfig, asOf),
        );
      },
    );

    it('conversion actually happened (guards against a vacuous pass)', () => {
      expect(
        reportMonthTotal(report.amortized, 'currentMonth'),
      ).toBeGreaterThan(0);
      // The USD contracts convert at the current month's rate, so the total
      // must differ from the unconverted native sum for the same month.
      const native = buildMonthlyValuesByContract(
        SPECS.map(makeEnriched),
        [],
        fiscalConfig,
        asOf,
        { currency: { mode: 'native' } },
      );
      expect(reportMonthTotal(report.amortized, 'currentMonth')).not.toBe(
        reportMonthTotal(native.amortized, 'currentMonth'),
      );
    });
  },
);
