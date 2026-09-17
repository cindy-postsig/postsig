import type { Contract } from '@/app/lib/budget/types';
import { queryCommitments, EMPTY_LINEAGE } from '@/lib/v2/spend';

const ASOF = new Date('2026-07-01T00:00:00Z');
const usd = { mode: 'preconverted-usd' } as const;

// 36-month term, one year-1 fee row of 100k. Decision #9 reads that as an
// ANNUAL price, so the resolver emits three 12-month segments of 100k that all
// share a termStart — the shape where 'term' and 'annual' valuation diverge.
const threeYear = {
  id: 1,
  vendor_id: 10,
  type_id: 2,
  status: 'active',
  status_id: 4,
  currency: 'usd',
  annual_increase: null,
  annual_increase_months: null,
  subscription_term: 36,
  renewal_period: 36,
  renewal_type: 'Auto',
  billing_frequency: 'Annually',
  will_not_renew: false,
  term_start_date: [{ date: '2026-01-01' }],
  term_end_date: [{ date: '2028-12-31' }],
  cancel_date: [],
  cancel_by_date: null,
  vendor_products_details: [
    {
      product_id: 100,
      year: 1,
      fees: 100000,
      vendor_products: { id: 100, name: 'Product' },
    },
  ],
  vendors: { name: 'Test Vendor' },
} as unknown as Contract;

function totalFor(
  valuation: 'term' | 'annual',
  window: 'currentFY' | 'nextFY',
): number {
  const result = queryCommitments(
    [threeYear],
    {
      window,
      granularity: 'year',
      groupBy: 'contract',
      currency: usd,
      fiscalConfig: { startMonth: 1 },
      asOf: ASOF,
      valuation,
    },
    EMPTY_LINEAGE,
  );
  return result.items.reduce((sum, item) => sum + item.value, 0);
}

describe('commitment valuation', () => {
  it("'term' puts the whole 36-month obligation in the year it was agreed", () => {
    expect(totalFor('term', 'currentFY')).toBe(300000);
  });

  it("'term' leaves later years empty — the value was already counted", () => {
    expect(totalFor('term', 'nextFY')).toBe(0);
  });

  it("'annual' counts one year of the same term in each fiscal year", () => {
    expect(totalFor('annual', 'currentFY')).toBe(100000);
    expect(totalFor('annual', 'nextFY')).toBe(100000);
  });

  it('defaults to term valuation when unspecified', () => {
    const result = queryCommitments(
      [threeYear],
      {
        window: 'currentFY',
        granularity: 'year',
        groupBy: 'contract',
        currency: usd,
        fiscalConfig: { startMonth: 1 },
        asOf: ASOF,
      },
      EMPTY_LINEAGE,
    );
    expect(result.items.reduce((s, i) => s + i.value, 0)).toBe(300000);
  });
});
