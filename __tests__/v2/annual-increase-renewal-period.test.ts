import { generatePriceHistory } from '@/app/lib/budget/priceHistoryCalculator';

// Each renewal advances by a RENEWAL CYCLE, so that is what decides how many
// yearly increases it earns. The code had been using the count of product
// year-ROWS instead — a valid proxy only when the cycle really is that many
// years long. psk-623 comments 14488/14489 settled the order as renewal_period,
// then subscription_term, then the row count as a last resort; those first two
// branches existed in 67402d1a and were dropped by e3f15df2.
//
// The invariant that restores: consecutive 12-month periods are always exactly
// ONE increase apart. A multi-year cycle earns its extra increases through
// yearWithinTerm as the term is split into annual periods, NOT by multiplying
// at the renewal boundary — doing both is the double-count.
function contract(spec: {
  increase: number;
  years: number[];
  renewalPeriod?: number | null;
  subscriptionTerm?: number | null;
  termStart: string;
  termEnd: string;
}) {
  return {
    id: 1,
    vendor_id: 10,
    type_id: 2,
    status: 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: spec.increase,
    annual_increase_months: null,
    subscription_term: spec.subscriptionTerm ?? null,
    renewal_period: spec.renewalPeriod ?? null,
    renewal_type: 'Auto',
    billing_frequency: 'Annually',
    will_not_renew: false,
    term_start_date: [{ date: spec.termStart }],
    term_end_date: [{ date: spec.termEnd }],
    cancel_date: [],
    vendor_products_details: spec.years.map((year) => ({
      product_id: 100,
      year,
      fees: 100000,
      vendor_products: { id: 100, name: 'Product' },
    })),
    vendors: { name: 'Vendor' },
  } as any;
}

/** Ratio between each pair of consecutive projected 12-month periods. */
function stepRatios(c: any): number[] {
  const periods = (
    generatePriceHistory(c, 1, 'full', {}) as any
  ).periods.filter(
    (p: any) => p.termType === 'renewal' || p.termType === 'projected',
  );
  const ratios: number[] = [];
  for (let i = 1; i < periods.length; i++) {
    ratios.push(Number((periods[i].fees / periods[i - 1].fees).toFixed(4)));
  }
  return ratios;
}

const shapes: Array<[string, any]> = [
  [
    // Arcesium #765: 3-year term with year 1/2/3 rows, but ANNUAL renewals.
    // The regression case — each 12-month renewal was applying three increases.
    '12-month renewals with three year-rows',
    contract({
      increase: 10,
      years: [1, 2, 3],
      renewalPeriod: 12,
      subscriptionTerm: 36,
      termStart: '2024-01-01',
      termEnd: '2026-12-31',
    }),
  ],
  [
    // renewal_period matches the row count, so this shape was already correct
    // and must stay unchanged.
    '24-month renewals with two year-rows',
    contract({
      increase: 10,
      years: [1, 2],
      renewalPeriod: 24,
      subscriptionTerm: 24,
      termStart: '2024-01-01',
      termEnd: '2025-12-31',
    }),
  ],
  [
    'no renewal_period — falls back to subscription_term',
    contract({
      increase: 10,
      years: [1, 2, 3],
      renewalPeriod: null,
      subscriptionTerm: 12,
      termStart: '2024-01-01',
      termEnd: '2024-12-31',
    }),
  ],
  [
    'neither recorded — last-resort year-row branch, unchanged',
    contract({
      increase: 10,
      years: [1, 2],
      renewalPeriod: null,
      subscriptionTerm: null,
      termStart: '2024-01-01',
      termEnd: '2025-12-31',
    }),
  ],
];

describe('annual increase counts renewal-cycle years, not product year-rows', () => {
  it.each(shapes)('%s steps exactly one increase per year', (_label, c) => {
    const ratios = stepRatios(c);
    expect(ratios.length).toBeGreaterThan(0);
    for (const ratio of ratios) expect(ratio).toBeCloseTo(1.1, 3);
  });

  it('the regression case no longer triples a 12-month renewal', () => {
    const [, arcesium] = shapes[0];
    const periods = (
      generatePriceHistory(arcesium, 1, 'full', {}) as any
    ).periods.filter((p: any) => p.termType === 'projected');

    // Before the fix the second projected period was 1.1^3 above the first.
    expect(periods.length).toBeGreaterThan(1);
    expect(periods[1].fees / periods[0].fees).toBeCloseTo(1.1, 3);
    expect(periods[1].fees / periods[0].fees).not.toBeCloseTo(1.331, 2);
  });
});
