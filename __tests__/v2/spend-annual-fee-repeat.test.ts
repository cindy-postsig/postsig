import { resolveFeeSegments, INFERENCE_REASONS } from '@/lib/v2/spend/resolver';
import {
  sliceActual,
  sliceCommitted,
  resolveWindow,
  type FiscalConfig,
} from '@/lib/v2/spend/slicers';
import type { CurrencyPolicy, FeeSegment } from '@/lib/v2/spend';
import type { Contract } from '@/app/lib/budget/types';

// Decision #9 (annual-fee-repeat): a single-year fee row is an annual price.
// When the recorded span or renewal term covers more than one 12-month cycle,
// the fee repeats per cycle instead of being stretched across the whole span.
// Legacy full/minimal read renewals this way (split periods at full fee) and
// legacy actual re-billed the downward term override; the engine now resolves
// both at the resolver so every basis agrees by construction.

interface ProductSpec {
  product_id: number;
  year?: number;
  fees: number;
}
interface ContractSpec {
  id?: number;
  status?: string;
  termStart: string;
  termEnd: string;
  subscriptionTerm?: number | null;
  renewalPeriod?: number | null;
  renewalType?: string | null;
  billingFrequency?: string | null;
  annualIncrease?: number | null;
  willNotRenew?: boolean;
  products: ProductSpec[];
}

function makeContract(spec: ContractSpec): Contract {
  return {
    id: spec.id ?? 1,
    vendor_id: 1,
    status: spec.status ?? 'active',
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

const USD: CurrencyPolicy = { mode: 'preconverted-usd' };
const FISCAL: FiscalConfig = { startMonth: 1 };
const ASOF = new Date(Date.UTC(2026, 6, 15));
const HORIZON_START = new Date(0);

function resolve(contract: Contract, horizonEnd: Date): FeeSegment[] {
  return resolveFeeSegments(contract, undefined, {
    asOf: ASOF,
    horizonStart: HORIZON_START,
    horizonEnd,
    currency: USD,
  });
}

function initialSegments(segments: FeeSegment[]): FeeSegment[] {
  return segments.filter((s) => s.source !== 'renewal-projection');
}

describe('initial term: dates spanning multiple annual cycles', () => {
  const contractB = makeContract({
    termStart: '2024-01-01',
    termEnd: '2025-12-31',
    subscriptionTerm: 12,
    billingFrequency: 'Annually',
    renewalType: 'One-Time',
    products: [{ product_id: 100, fees: 10000 }],
  });

  it('emits one full-fee segment per 12-month cycle (downward override)', () => {
    const segments = resolve(contractB, new Date(Date.UTC(2026, 0, 1)));
    expect(segments).toEqual([
      expect.objectContaining({
        from: '2024-01-01',
        to: '2025-01-01',
        fee: 10000,
        source: 'year-entry',
        confidence: 'inferred',
        reason: INFERENCE_REASONS.annualFeeRepeat,
      }),
      expect.objectContaining({
        from: '2025-01-01',
        to: '2026-01-01',
        fee: 10000,
        confidence: 'inferred',
      }),
    ]);
  });

  it('actual spend re-bills the annual fee each cycle: $20k over two years', () => {
    const segments = resolve(contractB, new Date(Date.UTC(2026, 0, 1)));
    const window = resolveWindow(
      { from: '2024-01-01', to: '2026-01-01' },
      ASOF,
      FISCAL,
    );
    const items = sliceActual(
      segments,
      window,
      'year',
      { billingMonths: 12 },
      FISCAL,
    );
    const total = items.reduce((sum, item) => sum + item.value, 0);
    expect(total).toBe(20000);
  });

  it('committed spend lands one full fee in each fiscal year', () => {
    const segments = resolve(contractB, new Date(Date.UTC(2026, 0, 1)));
    const window = resolveWindow({ fiscalYear: 2025 }, ASOF, FISCAL);
    const items = sliceCommitted(segments, window, 'year', FISCAL);
    expect(items).toEqual([
      expect.objectContaining({ period: 'FY2025', value: 10000 }),
    ]);
  });

  it('a clean multi-year span repeats even without subscription_term', () => {
    const segments = resolve(
      makeContract({
        termStart: '2024-01-01',
        termEnd: '2025-12-31',
        renewalType: 'One-Time',
        products: [{ product_id: 100, fees: 10000 }],
      }),
      new Date(Date.UTC(2026, 0, 1)),
    );
    expect(segments.map((s) => [s.from, s.fee])).toEqual([
      ['2024-01-01', 10000],
      ['2025-01-01', 10000],
    ]);
  });

  it('day-scales a trailing partial cycle so the per-day rate holds', () => {
    const segments = resolve(
      makeContract({
        termStart: '2024-01-01',
        termEnd: '2025-08-31',
        subscriptionTerm: 12,
        renewalType: 'One-Time',
        products: [{ product_id: 100, fees: 10000 }],
      }),
      new Date(Date.UTC(2026, 0, 1)),
    );
    // 2025 stub: 243 retained days of a 365-day cycle.
    expect(segments).toEqual([
      expect.objectContaining({
        from: '2024-01-01',
        to: '2025-01-01',
        fee: 10000,
      }),
      expect.objectContaining({
        from: '2025-01-01',
        to: '2025-09-01',
        fee: Math.round((10000 * 243) / 365 / 0.01) * 0.01,
      }),
    ]);
    expect(segments[1].fee).toBeCloseTo(6657.53, 2);
  });

  it('non-12-month-term shape is untouched: an 18-month span with no explicit term keeps one segment', () => {
    const segments = resolve(
      makeContract({
        termStart: '2025-01-01',
        termEnd: '2026-06-30',
        renewalType: 'One-Time',
        products: [{ product_id: 100, fees: 5000 }],
      }),
      new Date(Date.UTC(2027, 0, 1)),
    );
    expect(initialSegments(segments)).toEqual([
      expect.objectContaining({
        from: '2025-01-01',
        to: '2026-07-01',
        fee: 5000,
        confidence: 'explicit',
      }),
    ]);
  });

  it('a plain 12-month contract is untouched and stays explicit', () => {
    const segments = resolve(
      makeContract({
        termStart: '2024-01-01',
        termEnd: '2024-12-31',
        subscriptionTerm: 12,
        renewalType: 'One-Time',
        products: [{ product_id: 100, fees: 10000 }],
      }),
      new Date(Date.UTC(2025, 0, 1)),
    );
    expect(segments).toEqual([
      expect.objectContaining({
        from: '2024-01-01',
        to: '2025-01-01',
        fee: 10000,
        confidence: 'explicit',
      }),
    ]);
  });
});

describe('renewals: multi-year renewal terms split into annual slices', () => {
  const contractA = makeContract({
    termStart: '2024-01-01',
    termEnd: '2025-12-31',
    subscriptionTerm: 24,
    renewalPeriod: 24,
    products: [{ product_id: 100, fees: 10000 }],
  });

  it('a 24-month renewal term costs 2x the annual fee', () => {
    const segments = resolve(contractA, new Date(Date.UTC(2028, 0, 1)));
    const renewals = segments.filter((s) => s.source === 'renewal-projection');
    expect(renewals.map((s) => [s.from, s.to, s.fee])).toEqual([
      ['2026-01-01', '2027-01-01', 10000],
      ['2027-01-01', '2028-01-01', 10000],
    ]);
  });

  it('annual increase compounds per year within the split term', () => {
    const segments = resolve(
      makeContract({
        termStart: '2024-01-01',
        termEnd: '2025-12-31',
        subscriptionTerm: 24,
        renewalPeriod: 24,
        annualIncrease: 10,
        products: [{ product_id: 100, fees: 10000 }],
      }),
      new Date(Date.UTC(2028, 0, 1)),
    );
    const renewals = segments.filter((s) => s.source === 'renewal-projection');
    expect(renewals.map((s) => s.from)).toEqual(['2026-01-01', '2027-01-01']);
    expect(renewals[0].fee).toBeCloseTo(11000, 6);
    expect(renewals[1].fee).toBeCloseTo(12100, 6);
  });

  it('a 12-month renewal period still projects one segment per term', () => {
    const segments = resolve(
      makeContract({
        termStart: '2024-01-01',
        termEnd: '2024-12-31',
        subscriptionTerm: 12,
        products: [{ product_id: 100, fees: 10000 }],
      }),
      new Date(Date.UTC(2027, 0, 1)),
    );
    const renewals = segments.filter((s) => s.source === 'renewal-projection');
    expect(renewals.map((s) => [s.from, s.to])).toEqual([
      ['2025-01-01', '2026-01-01'],
      ['2026-01-01', '2027-01-01'],
    ]);
  });
});

describe('composition with #1594 (year-as-renewal-hint)', () => {
  it('hint year uses the year-2 fee; later 24-month terms split at that fee', () => {
    const segments = resolve(
      makeContract({
        termStart: '2025-01-01',
        termEnd: '2025-12-31',
        renewalPeriod: 24,
        products: [
          { product_id: 100, year: 1, fees: 1000 },
          { product_id: 100, year: 2, fees: 1100 },
        ],
      }),
      new Date(Date.UTC(2029, 0, 1)),
    );

    expect(initialSegments(segments)).toEqual([
      expect.objectContaining({
        from: '2025-01-01',
        to: '2026-01-01',
        fee: 1000,
      }),
    ]);

    const renewals = segments.filter((s) => s.source === 'renewal-projection');
    expect(renewals.map((s) => [s.from, s.to, s.fee])).toEqual([
      // Hint year seeded from the recorded year-2 fee.
      ['2026-01-01', '2027-01-01', 1100],
      // 24-month renewal term, split annually, seeded from the last-year fee.
      ['2027-01-01', '2028-01-01', 1100],
      ['2028-01-01', '2029-01-01', 1100],
    ]);
  });
});
