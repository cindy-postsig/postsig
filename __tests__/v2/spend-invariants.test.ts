import { generatePriceHistory } from '@/app/lib/budget/priceHistoryCalculator';
import { extractActualCostData } from '@/app/lib/budget/priceHistoryChartUtils';
import type { Contract, PriceHistory } from '@/app/lib/budget/types';

// Phase-1 property tests for the spend engine (docs/spend-engine-design.md,
// "Invariants (property tests)"). Only the invariants checkable against today's
// extractors are exercised here:
//   - Invariant 2: conservation of the actual (billing-date) walk — the guard
//     that would have caught PSK-1850.
//   - Invariant 4: no double counting across renewal boundaries.
//
// deferred to phase 3: needs daily proration / arbitrary windows —
//   Invariant 1 (exact conservation under daily proration): daily proration is
//     rejected by the facade today.
//   Invariant 3 (reconciliation across bases): the committed basis is not
//     implemented yet.
//   Invariant 5 (window additivity): arbitrary ranges do not exist yet.
// Invariant 6 (determinism) is already covered by asOf-determinism.test.ts and
// is not duplicated here. This file is deterministic under real timers: asOf is
// passed explicitly to generatePriceHistory and every FiscalYearInfo window is
// constructed by hand, so nothing reads the wall clock.

interface ProductSpec {
  product_id: number;
  year?: number;
  fees: number;
}
interface ContractSpec {
  id?: number;
  termStart: string;
  termEnd: string;
  subscriptionTerm?: number | null;
  renewalPeriod?: number | null;
  renewalType?: string | null;
  billingFrequency?: string | null;
  annualIncrease?: number | null;
  willNotRenew?: boolean;
  cancelDate?: string | null;
  products: ProductSpec[];
}

// Copied from spend-goldens.test.ts (the oracle) rather than imported, so this
// file never depends on or mutates the golden test.
function makeContract(spec: ContractSpec): Contract {
  return {
    id: spec.id ?? 1,
    vendor_id: 1,
    status: 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: spec.annualIncrease ?? null,
    annual_increase_months: null,
    subscription_term: spec.subscriptionTerm ?? null,
    renewal_period: spec.renewalPeriod ?? null,
    renewal_type: spec.renewalType ?? 'Auto',
    billing_frequency: spec.billingFrequency ?? null,
    will_not_renew: spec.willNotRenew ?? false,
    term_start_date: [{ date: spec.termStart }],
    term_end_date: [{ date: spec.termEnd }],
    cancel_date: spec.cancelDate ? [{ date: spec.cancelDate }] : [],
    vendor_products_details: spec.products.map((p) => ({
      product_id: p.product_id,
      year: p.year ?? 1,
      fees: p.fees,
      vendor_products: { id: p.product_id, name: `Product ${p.product_id}` },
    })),
    vendors: { name: 'Test Vendor' },
    users: { organizations: { fiscal_year_start_month: 1 } },
  } as unknown as Contract;
}

interface FiscalYearInfo {
  currentFiscalYear: number;
  currentFiscalYearStart: Date;
  nextFiscalYearStart: Date;
}

// "Now" as an explicit input. Mirrors the golden's system time but is a plain
// argument, so the test does not depend on fake timers.
const ASOF = new Date(2026, 6, 15);

// A calendar-year window [year, year+1) so the actual-cost walk sees exactly one
// 12-month cycle of a January-aligned contract.
const calendarFY = (year: number): FiscalYearInfo => ({
  currentFiscalYear: year,
  currentFiscalYearStart: new Date(year, 0, 1),
  nextFiscalYearStart: new Date(year + 1, 0, 1),
});

const billingEventsIn = (ph: PriceHistory, year: number): number[] =>
  extractActualCostData([ph], 'current', calendarFY(year))
    .data.map((point) => point.value)
    .filter((value) => value !== 0);

const sumBillingIn = (ph: PriceHistory, year: number): number =>
  billingEventsIn(ph, year).reduce((total, value) => total + value, 0);

// Each billing event is rounded to cents (toCents in the walk), so the sum of N
// events can drift from an exactly-divided fee by up to a cent per event. This
// tolerance separates that rounding noise from a real conservation break like
// PSK-1850, which dropped ~66% of a year's fee.
const centTolerance = (billsPerYear: number): number => 0.01 * billsPerYear;

// Fails with a message naming the shape + frequency; passes silently otherwise.
function expectConserved(
  actual: number,
  expected: number,
  tolerance: number,
  label: string,
): void {
  const ok = Math.abs(actual - expected) <= tolerance;
  expect(
    ok
      ? label
      : `${label}: expected billing events to sum to ~${expected} but got ${actual} ` +
          `(diff ${Math.abs(actual - expected)}, tolerance ${tolerance})`,
  ).toBe(label);
}

const FREQUENCIES: {
  frequency: string;
  billingMonths: number;
  billsPerYear: number;
}[] = [
  { frequency: 'Annually', billingMonths: 12, billsPerYear: 1 },
  { frequency: 'Semi-Annually', billingMonths: 6, billsPerYear: 2 },
  { frequency: 'Quarterly', billingMonths: 3, billsPerYear: 4 },
  { frequency: 'Monthly', billingMonths: 1, billsPerYear: 12 },
];

describe('Invariant 2 — conservation (actual): billing events within a cycle sum to the cycle fee', () => {
  const SINGLE_YEAR_FEE = 56044;

  it.each(FREQUENCIES)(
    'single 12-month cycle conserves under $frequency billing',
    ({ frequency, billsPerYear }) => {
      const ph = generatePriceHistory(
        makeContract({
          id: 5000,
          termStart: '2026-01-01',
          termEnd: '2026-12-31',
          subscriptionTerm: 12,
          renewalPeriod: 12,
          billingFrequency: frequency,
          products: [{ product_id: 100, year: 1, fees: SINGLE_YEAR_FEE }],
        }),
        1,
        'minimal',
        { asOf: ASOF },
      );

      expectConserved(
        sumBillingIn(ph, 2026),
        SINGLE_YEAR_FEE,
        centTolerance(billsPerYear),
        `single-year cycle (${frequency})`,
      );
    },
  );

  // Contract 3047: 36-month subscription_term, year 1/2/3 fees 51044/56044/56044.
  // Each 12-month slice is termType 'initial' with a 12-month date span, but the
  // contract's subscription_term is 36 — exactly the PSK-1850 shape. The extractor
  // must divide each slice's fee by its 12-month date span, not by the 36-month
  // subscription_term. Iterating billing frequency proves conservation is not a
  // property of one billing cadence.
  describe('PSK-1850 regression: 12-month slice of a 36-month subscription_term', () => {
    const YEAR_FEES: Record<number, number> = {
      2024: 51044,
      2025: 56044,
      2026: 56044,
    };

    const build3047 = (frequency: string): PriceHistory =>
      generatePriceHistory(
        makeContract({
          id: 3047,
          termStart: '2024-01-01',
          termEnd: '2026-12-31',
          subscriptionTerm: 36,
          renewalPeriod: 12,
          billingFrequency: frequency,
          products: [
            { product_id: 100, year: 1, fees: 51044 },
            { product_id: 100, year: 2, fees: 56044 },
            { product_id: 100, year: 3, fees: 56044 },
          ],
        }),
        1,
        'minimal',
        { asOf: ASOF },
      );

    it.each(FREQUENCIES)(
      'every 12-month slice conserves under $frequency billing',
      ({ frequency, billsPerYear }) => {
        const ph = build3047(frequency);
        const tolerance = centTolerance(billsPerYear);
        for (const [year, fee] of Object.entries(YEAR_FEES)) {
          expectConserved(
            sumBillingIn(ph, Number(year)),
            fee,
            tolerance,
            `3047 slice ${year} (${frequency})`,
          );
        }
      },
    );

    // The concrete PSK-1850 case. Pre-fix the divisor was subscription_term (36),
    // not the slice's 12-month date span, so year 3 quarterly billed
    // 56044 / 36 * 3 = 4670.33 per quarter -> 18681.33 for the year, dropping
    // ~66% of the fee. This asserts the full year-3 fee is billed.
    it('bills the full year-3 fee (56044), not fee/36 dropped', () => {
      const ph = build3047('Quarterly');
      const events = billingEventsIn(ph, 2026);

      expect(events).toHaveLength(4);
      expectConserved(
        sumBillingIn(ph, 2026),
        56044,
        0.01 * 4,
        '3047 year-3 quarterly (PSK-1850)',
      );

      const preFixUndercount = (56044 / 36) * 3 * 4;
      expect(sumBillingIn(ph, 2026)).not.toBeCloseTo(preFixUndercount, 2);
    });
  });
});

describe('Invariant 4 — no double counting at renewal boundaries', () => {
  // The renewal happens mid-fiscal-year (Aug 2026): the initial cycle
  // (2025-08 -> 2026-07, fee 1200) bills at the old rate through the first half
  // of FY2026 and the projected renewal (2026-08 -> 2027-07, fee 1440 after a
  // 20% increase) bills at the new rate through the second half. No month may
  // receive both an old-cycle and a new-cycle charge.
  const BOUNDARY_FEE = 1200;
  const INCREASE_PCT = 20;

  const buildBoundary = (frequency: string): PriceHistory =>
    generatePriceHistory(
      makeContract({
        id: 903,
        termStart: '2025-08-01',
        termEnd: '2026-07-31',
        subscriptionTerm: 12,
        renewalPeriod: 12,
        annualIncrease: INCREASE_PCT,
        billingFrequency: frequency,
        products: [{ product_id: 100, year: 1, fees: BOUNDARY_FEE }],
      }),
      1,
      'full',
      { asOf: ASOF },
    );

  // Annually is excluded: with a 6-month offset into the fiscal year its single
  // yearly bill lands outside the window on the initial side, so the boundary is
  // never actually crossed within FY2026 and there is nothing to double-count.
  const boundaryFrequencies = FREQUENCIES.filter((f) => f.billsPerYear >= 2);

  it.each(boundaryFrequencies)(
    'each month across the boundary receives exactly one charge under $frequency billing',
    ({ frequency, billingMonths }) => {
      const ph = buildBoundary(frequency);
      const populated = extractActualCostData(
        [ph],
        'current',
        calendarFY(2026),
      ).data.filter((point) => point.value !== 0);

      const oldBill = (BOUNDARY_FEE / 12) * billingMonths;
      const newBill = oldBill * (1 + INCREASE_PCT / 100);
      const tol = 0.01;

      const keys = populated.map((point) => point.key);
      expect(new Set(keys).size).toBe(keys.length);

      for (const point of populated) {
        const matchesOne =
          Math.abs(point.value - oldBill) <= tol ||
          Math.abs(point.value - newBill) <= tol;
        expect(
          matchesOne
            ? point.key
            : `${frequency} boundary: month ${point.key} value ${point.value} ` +
                `matches neither a single old bill (${oldBill}) nor new bill (${newBill}) ` +
                `— looks double-attributed (sum would be ${oldBill + newBill})`,
        ).toBe(point.key);
      }

      const maxValue = Math.max(...populated.map((point) => point.value));
      expect(maxValue).toBeLessThanOrEqual(newBill + tol);

      const hasOld = populated.some(
        (point) => Math.abs(point.value - oldBill) <= tol,
      );
      const hasNew = populated.some(
        (point) => Math.abs(point.value - newBill) <= tol,
      );
      expect(
        hasOld && hasNew
          ? `${frequency} boundary crossed`
          : `${frequency} boundary: expected both old (${oldBill}) and new (${newBill}) ` +
              `bills within FY2026, got ${JSON.stringify(populated.map((p) => p.value))}`,
      ).toBe(`${frequency} boundary crossed`);
    },
  );
});
