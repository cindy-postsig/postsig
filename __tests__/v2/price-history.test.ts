import {
  generatePriceHistory,
  type PriceHistoryOptions,
} from '@/app/lib/budget/priceHistoryCalculator';
import type { Contract } from '@/app/lib/budget/types';

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
  annualIncrease?: number | null;
  status?: string;
  status_id?: number;
  products: ProductSpec[];
}

function makeContract(spec: ContractSpec): Contract {
  return {
    id: spec.id ?? 1,
    vendor_id: 1,
    status: spec.status ?? 'active',
    status_id: spec.status_id ?? 4,
    currency: 'usd',
    annual_increase: spec.annualIncrease ?? null,
    annual_increase_months: null,
    subscription_term: spec.subscriptionTerm ?? null,
    renewal_period: spec.renewalPeriod ?? null,
    renewal_type: spec.renewalType ?? null,
    billing_frequency: null,
    will_not_renew: false,
    term_start_date: [{ date: spec.termStart }],
    term_end_date: [{ date: spec.termEnd }],
    cancel_date: [],
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

function generate(
  spec: ContractSpec,
  mode: 'full' | 'minimal' | 'max' = 'full',
  options?: PriceHistoryOptions,
) {
  return generatePriceHistory(makeContract(spec), 1, mode, options);
}

describe('generateInitialTerm — virtual term extension guard', () => {
  // Regression: PR #1594 originally extended any term where
  // recordedTermMonths < maxYear * 12. That over-fired for multi-cycle
  // contracts with full per-year product data (e.g. Gartner contract 1504,
  // 27mo + year=1/2/3 entries). Fix tightened the trigger to "would the
  // backward split produce a degenerate first-year period?".

  it('does NOT virtually extend a 27-month term with year=1/2/3 entries', () => {
    // Gartner-shape: recorded term legitimately spans 3 cycles, products
    // describe each cycle. Backward split leaves a 3-month year-1 stub.
    const ph = generate({
      termStart: '2025-10-01',
      termEnd: '2027-12-31',
      subscriptionTerm: 27,
      products: [
        { product_id: 100, year: 1, fees: 0 },
        { product_id: 100, year: 2, fees: 36900 },
        { product_id: 100, year: 3, fees: 38374 },
        { product_id: 200, year: 1, fees: 0 },
        { product_id: 200, year: 2, fees: 147600 },
        { product_id: 200, year: 3, fees: 153496 },
      ],
    });

    const initialPeriods = ph.periods.filter((p) => p.termType === 'initial');
    expect(
      initialPeriods.map((p) => ({
        startDate: p.startDate,
        endDate: p.endDate,
        yearWithinTerm: p.yearWithinTerm,
        fees: p.fees,
      })),
    ).toEqual([
      // year-1 stub: Oct 2025 → Dec 2025 (3 months) with no year=1 fees
      {
        startDate: '2025-10-01',
        endDate: '2025-12-31',
        yearWithinTerm: 1,
        fees: 0,
      },
      // year-2: full calendar 2026
      {
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        yearWithinTerm: 2,
        fees: 184500,
      },
      // year-3: full calendar 2027
      {
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        yearWithinTerm: 3,
        fees: 191870,
      },
    ]);

    // TCV is sum of current term fees, regardless of which period is active
    expect(ph.totalContractValue).toBe(376370);
  });

  it('DOES virtually extend a 12-month term with year=1/2 entries (the original target case)', () => {
    // The case PR #1594 was actually written for: contract author entered
    // year=2 fees inline as a renewal price hint, even though the recorded
    // term only spans one 12-month cycle.
    const ph = generate({
      termStart: '2025-01-01',
      termEnd: '2025-12-31',
      subscriptionTerm: 12,
      products: [
        { product_id: 100, year: 1, fees: 1000 },
        { product_id: 100, year: 2, fees: 1100 },
      ],
    });

    const initialPeriods = ph.periods.filter((p) => p.termType === 'initial');
    expect(initialPeriods).toHaveLength(2);
    // Without the extension, year-1 would collapse to 0 months and double-bucket fees.
    // With it, year-1 is the recorded 12 months and year-2 is the extended 12 months.
    expect(initialPeriods[0]).toMatchObject({
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      yearWithinTerm: 1,
      fees: 1000,
    });
    expect(initialPeriods[1]).toMatchObject({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      yearWithinTerm: 2,
      fees: 1100,
    });
  });

  it('does NOT extend an 18-month term with year=1/2 entries (year-1 stub is non-degenerate)', () => {
    // Another case the over-eager trigger would have wrongly extended:
    // 18mo recorded with year=1/2 → backward split yields a 6-month
    // year-1 stub, which is fine. No extension should fire.
    const ph = generate({
      termStart: '2025-01-01',
      termEnd: '2026-06-30',
      subscriptionTerm: 18,
      products: [
        { product_id: 100, year: 1, fees: 500 },
        { product_id: 100, year: 2, fees: 1100 },
      ],
    });

    const initialPeriods = ph.periods.filter((p) => p.termType === 'initial');
    expect(initialPeriods).toHaveLength(2);
    expect(initialPeriods[0]).toMatchObject({
      startDate: '2025-01-01',
      endDate: '2025-06-30',
      yearWithinTerm: 1,
      fees: 500,
    });
    expect(initialPeriods[1]).toMatchObject({
      startDate: '2025-07-01',
      endDate: '2026-06-30',
      yearWithinTerm: 2,
      fees: 1100,
    });
  });
});
