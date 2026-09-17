import { addMonths, addDays, format } from 'date-fns';
import { resolveFeeSegments } from '@/lib/v2/spend/resolver';
import { feeDigestOf } from '@/lib/v2/spend/derivationKey';
import type { CurrencyPolicy, FeeSegment } from '@/lib/v2/spend';
import {
  generatePriceHistory,
  extractBudgetFromPriceHistory,
} from '@/app/lib/budget';
import { calculateLifetimeContractValue } from '@/app/lib/budget/lifetimeValueCalculator';
import { getCurrentTermProducts } from '@/lib/v2/products/transforms';
import { sumRecurringProductFees } from '@/lib/contracts/recurringFees';
import type { Contract } from '@/app/lib/budget/types';

// PSK-1492: a one_time_only product-year row books once, in its recorded
// year, and never repeats (decision-#9 cycles) or seeds renewal projections.
// The ticket example: year 1 = one-time $1K + recurring $2K → current budget
// $3K, projected budget $2K.

const CURRENCY: CurrencyPolicy = { mode: 'preconverted-usd' };
const AS_OF = new Date('2024-06-15T00:00:00.000Z');
const HORIZON_START = new Date(0);

interface ProductSpec {
  product_id: number;
  year?: number;
  fees: number;
  oneTime?: boolean;
}

interface ContractSpec {
  id?: number;
  termStart: string;
  termEnd?: string | null;
  subscriptionTerm?: number | null;
  renewalPeriod?: number | null;
  products: ProductSpec[];
}

function makeContract(spec: ContractSpec): Contract {
  return {
    id: spec.id ?? 1,
    vendor_id: 1,
    status: 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: null,
    annual_increase_months: null,
    subscription_term: spec.subscriptionTerm ?? null,
    renewal_period: spec.renewalPeriod ?? null,
    renewal_type: 'Auto',
    billing_frequency: null,
    will_not_renew: false,
    term_start_date: [{ date: spec.termStart }],
    term_end_date: spec.termEnd ? [{ date: spec.termEnd }] : [],
    cancel_date: [],
    vendor_products_details: spec.products.map((p) => ({
      product_id: p.product_id,
      year: p.year ?? 1,
      fees: p.fees,
      convertedFees: p.fees,
      one_time_only: p.oneTime ?? false,
      vendor_products: { id: p.product_id, name: `Product ${p.product_id}` },
    })),
    vendors: { name: 'Test Vendor' },
    users: { organizations: { fiscal_year_start_month: 1 } },
  } as unknown as Contract;
}

function resolve(contract: Contract, horizonEnd: string): FeeSegment[] {
  return resolveFeeSegments(contract as never, undefined, {
    asOf: AS_OF,
    horizonStart: HORIZON_START,
    horizonEnd: new Date(`${horizonEnd}T00:00:00.000Z`),
    currency: CURRENCY,
  });
}

const ofProduct = (segments: FeeSegment[], productId: number) =>
  segments.filter((s) => s.productId === productId);

describe('resolver: one_time_only products', () => {
  it('books the one-time fee in the initial term and excludes it from every renewal projection (ticket example)', () => {
    const contract = makeContract({
      termStart: '2024-01-01',
      termEnd: '2024-12-31',
      subscriptionTerm: 12,
      renewalPeriod: 12,
      products: [
        { product_id: 1, fees: 1000, oneTime: true },
        { product_id: 2, fees: 2000 },
      ],
    });
    const segments = resolve(contract, '2027-01-01');

    const oneTime = ofProduct(segments, 1);
    expect(oneTime).toHaveLength(1);
    expect(oneTime[0]).toMatchObject({
      source: 'year-entry',
      from: '2024-01-01',
      to: '2025-01-01',
      fee: 1000,
    });

    const projections = segments.filter(
      (s) => s.source === 'renewal-projection',
    );
    expect(projections.length).toBeGreaterThan(0);
    expect(projections.every((s) => s.productId === 2)).toBe(true);
    expect(projections.every((s) => s.fee === 2000)).toBe(true);
  });

  it('does not repeat a one-time fee across decision-#9 cycles', () => {
    const contract = makeContract({
      termStart: '2024-01-01',
      termEnd: '2026-12-31',
      products: [
        { product_id: 1, fees: 1000, oneTime: true },
        { product_id: 2, fees: 2000 },
      ],
    });
    const segments = resolve(contract, '2027-01-01');

    const oneTime = ofProduct(segments, 1);
    expect(oneTime).toHaveLength(1);
    expect(oneTime[0]).toMatchObject({
      from: '2024-01-01',
      to: '2025-01-01',
      fee: 1000,
    });

    const recurringInTerm = ofProduct(segments, 2).filter(
      (s) => s.source === 'year-entry',
    );
    expect(recurringInTerm).toHaveLength(3);
  });

  it('emits a one-time renewal-hint row once and never projects past it', () => {
    const contract = makeContract({
      termStart: '2024-01-01',
      termEnd: '2024-12-31',
      products: [
        { product_id: 2, year: 1, fees: 2000 },
        { product_id: 1, year: 2, fees: 500, oneTime: true },
      ],
    });
    const segments = resolve(contract, '2030-01-01');

    expect(segments).toHaveLength(2);
    const hint = ofProduct(segments, 1);
    expect(hint).toHaveLength(1);
    expect(hint[0]).toMatchObject({
      source: 'renewal-projection',
      from: '2025-01-01',
      to: '2026-01-01',
      fee: 500,
    });
    expect(segments.every((s) => s.from < '2026-01-01')).toBe(true);
  });

  it('keeps a committed final-year one-time row but seeds projections from the recurring rows only', () => {
    const contract = makeContract({
      termStart: '2024-01-01',
      termEnd: '2025-12-31',
      products: [
        { product_id: 2, year: 1, fees: 2000 },
        { product_id: 2, year: 2, fees: 2100 },
        { product_id: 1, year: 2, fees: 500, oneTime: true },
      ],
    });
    const segments = resolve(contract, '2028-01-01');

    const oneTime = ofProduct(segments, 1);
    expect(oneTime).toHaveLength(1);
    expect(oneTime[0]).toMatchObject({
      source: 'year-entry',
      from: '2025-01-01',
      fee: 500,
    });

    const projections = segments.filter(
      (s) => s.source === 'renewal-projection',
    );
    expect(projections.length).toBeGreaterThan(0);
    expect(projections.every((s) => s.productId === 2 && s.fee === 2100)).toBe(
      true,
    );
  });

  it('projects nothing when every final-year row is one-time', () => {
    const contract = makeContract({
      termStart: '2024-01-01',
      termEnd: '2024-12-31',
      subscriptionTerm: 12,
      products: [{ product_id: 1, fees: 1000, oneTime: true }],
    });
    const segments = resolve(contract, '2030-01-01');

    expect(segments).toHaveLength(1);
    expect(segments[0].source).toBe('year-entry');
  });
});

describe('legacy price history: one_time_only products', () => {
  it('pins the ticket example: current $3K, projected $2K', () => {
    const contract = makeContract({
      termStart: '2024-01-01',
      termEnd: '2024-12-31',
      subscriptionTerm: 12,
      renewalPeriod: 12,
      products: [
        { product_id: 1, fees: 1000, oneTime: true },
        { product_id: 2, fees: 2000 },
      ],
    });
    const ph = generatePriceHistory(contract, 1, 'full', { asOf: AS_OF });
    const budget = extractBudgetFromPriceHistory(ph);

    expect(budget.currentUSD).toBe(3000);
    expect(budget.projectedUSD).toBe(2000);

    const nonInitialPeriods = ph.periods.filter(
      (p) => p.termType !== 'initial',
    );
    expect(nonInitialPeriods.length).toBeGreaterThan(0);
    for (const period of nonInitialPeriods) {
      expect(period.productFees.some((f) => f.productId === 1)).toBe(false);
    }
  });

  it('keeps the one-time fee exactly once in a multi-year single-period initial term', () => {
    const contract = makeContract({
      termStart: '2024-01-01',
      termEnd: '2026-12-31',
      products: [
        { product_id: 1, fees: 1000, oneTime: true },
        { product_id: 2, fees: 2000 },
      ],
    });
    const ph = generatePriceHistory(contract, 1, 'full', { asOf: AS_OF });

    const initialPeriods = ph.periods.filter((p) => p.termType === 'initial');
    expect(initialPeriods).toHaveLength(1);
    expect(initialPeriods[0].feesUSD).toBe(3000);
  });
});

describe('feeDigestOf: one_time_only rotates the derivation signature', () => {
  it('changes the digest when only the flag changes', () => {
    const base = {
      vendor_products_details: [
        { product_id: 1, year: 1, fees: 1000, one_time_only: false },
      ],
    };
    const flagged = {
      vendor_products_details: [
        { product_id: 1, year: 1, fees: 1000, one_time_only: true },
      ],
    };
    expect(feeDigestOf(base)).not.toBe(feeDigestOf(flagged));
  });
});

describe('calculateLifetimeContractValue: one_time_only products', () => {
  // Term arrays are newest-first: one recorded renewal (2021) after the
  // original 2020 term → numberOfRenewals = 1.
  const spec = (oneTime: boolean) =>
    ({
      term_start_date: [
        { date: '2021-01-01', updated_at: '', updated_by: '' },
        { date: '2020-01-01', updated_at: '', updated_by: '' },
      ],
      term_end_date: [
        { date: '2021-12-31', updated_at: '', updated_by: '' },
        { date: '2020-12-31', updated_at: '', updated_by: '' },
      ],
      status: 'active',
      renewal_type: 'Auto',
      vendor_products_details: [
        { year: 1, fees: 1000, one_time_only: oneTime },
        { year: 1, fees: 2000 },
      ],
    }) as never;

  it('excludes one-time fees from renewal value', () => {
    expect(calculateLifetimeContractValue(spec(false))).toBe(6000);
    expect(calculateLifetimeContractValue(spec(true))).toBe(5000);
  });
});

describe('getCurrentTermProducts: one_time_only reaches display rows', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('carries the flag through the raw fallback path', () => {
    const result = getCurrentTermProducts(
      {
        currency: 'usd',
        term_start_date: [],
        vendor_products_details: [
          {
            product_id: 1,
            fees: 1000,
            one_time_only: true,
            vendor_products: { id: 1, name: 'Setup' },
          },
          {
            product_id: 2,
            fees: 2000,
            one_time_only: false,
            vendor_products: { id: 2, name: 'License' },
          },
        ],
      },
      1,
    );
    const rows = result.productsByYear['1'];
    expect(rows.find((p) => p.product_id === 1)?.one_time_only).toBe(true);
    expect(rows.find((p) => p.product_id === 2)?.one_time_only).toBe(false);
  });

  // getCurrentTermProducts has no asOf input — it resolves "current" against
  // the wall clock — so the clock is faked to keep the fixture's initial term
  // active.
  it('carries the flag through the price-history path', () => {
    jest.useFakeTimers({ now: AS_OF });
    const start = addMonths(AS_OF, -6);
    const end = addDays(addMonths(start, 12), -1);
    const result = getCurrentTermProducts(
      {
        currency: 'usd',
        term_start_date: [
          {
            date: format(start, 'yyyy-MM-dd'),
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        ],
        term_end_date: [
          {
            date: format(end, 'yyyy-MM-dd'),
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        ],
        subscription_term: 12,
        vendor_products_details: [
          {
            product_id: 1,
            fees: 1000,
            year: 1,
            one_time_only: true,
            vendor_products: { id: 1, name: 'Setup' },
          },
          {
            product_id: 2,
            fees: 2000,
            year: 1,
            one_time_only: false,
            vendor_products: { id: 2, name: 'License' },
          },
        ],
      },
      1,
    );
    const rows = result.productsByYear['1'];
    expect(rows.find((p) => p.product_id === 1)?.one_time_only).toBe(true);
    expect(rows.find((p) => p.product_id === 2)?.one_time_only).toBe(false);
  });
});

describe('sumRecurringProductFees', () => {
  it('excludes one-time rows and coerces string fees', () => {
    expect(
      sumRecurringProductFees([
        { fees: '1000', one_time_only: true },
        { fees: '2000' },
        { fees: 500, one_time_only: false },
      ]),
    ).toBe(2500);
  });

  it('sums to zero when every row is one-time', () => {
    expect(sumRecurringProductFees([{ fees: 1000, one_time_only: true }])).toBe(
      0,
    );
  });

  it('ignores non-numeric fee strings instead of poisoning the total', () => {
    expect(sumRecurringProductFees([{ fees: 'unknown' }, { fees: 2000 }])).toBe(
      2000,
    );
  });
});
