import { readFileSync } from 'fs';
import { join } from 'path';
import { resolveFeeSegments, getTermLength } from '@/lib/v2/spend/resolver';
import {
  sliceAmortized,
  sliceActual,
  resolveWindow,
  type FiscalConfig,
} from '@/lib/v2/spend/slicers';
import type { CurrencyPolicy, SpendLineItem } from '@/lib/v2/spend';
import type { Contract } from '@/app/lib/budget/types';

// Copied from spend-goldens.test.ts (the oracle) rather than imported, so this
// file never depends on or mutates the golden test.
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
  cancelDate?: string | null;
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

const shapes: Record<string, ContractSpec> = {
  standardMultiYear: {
    id: 3047,
    termStart: '2024-01-01',
    termEnd: '2026-12-31',
    subscriptionTerm: 36,
    renewalPeriod: 12,
    billingFrequency: 'Quarterly',
    products: [
      { product_id: 100, year: 1, fees: 51044 },
      { product_id: 100, year: 2, fees: 56044 },
      { product_id: 100, year: 3, fees: 56044 },
    ],
  },
  yearRenewalHint: {
    id: 1594,
    termStart: '2025-01-01',
    termEnd: '2025-12-31',
    subscriptionTerm: 12,
    billingFrequency: 'Annually',
    products: [
      { product_id: 100, year: 1, fees: 1000 },
      { product_id: 100, year: 2, fees: 1100 },
    ],
  },
  gartnerStub: {
    id: 1504,
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
  },
  eighteenMonth: {
    id: 18,
    termStart: '2025-01-01',
    termEnd: '2026-06-30',
    subscriptionTerm: 18,
    billingFrequency: 'Quarterly',
    products: [{ product_id: 100, year: 1, fees: 5000 }],
  },
  oneTime: {
    id: 900,
    termStart: '2026-01-01',
    termEnd: '2026-12-31',
    subscriptionTerm: 12,
    renewalType: 'One-Time',
    billingFrequency: 'Annually',
    products: [{ product_id: 100, year: 1, fees: 8000 }],
  },
  willNotRenew: {
    id: 901,
    termStart: '2026-06-01',
    termEnd: '2027-05-31',
    subscriptionTerm: 12,
    willNotRenew: true,
    billingFrequency: 'Annually',
    products: [{ product_id: 100, year: 1, fees: 9000 }],
  },
  annualIncrease: {
    id: 902,
    termStart: '2024-01-01',
    termEnd: '2024-12-31',
    subscriptionTerm: 12,
    renewalPeriod: 12,
    annualIncrease: 10,
    billingFrequency: 'Annually',
    products: [{ product_id: 100, year: 1, fees: 1000 }],
  },
  annualIncreaseRenewalCycle: {
    id: 2039,
    termStart: '2022-01-01',
    termEnd: '2024-12-31',
    subscriptionTerm: 36,
    renewalPeriod: 12,
    annualIncrease: 4,
    billingFrequency: 'Annually',
    products: [
      { product_id: 100, year: 1, fees: 10000 },
      { product_id: 100, year: 2, fees: 10000 },
      { product_id: 100, year: 3, fees: 10000 },
    ],
  },
};

// ---------------------------------------------------------------------------
// This suite now drives the REAL phase-3a slicers (lib/v2/spend/slicers). It
// pins them against the goldens at the exact configuration legacy produced:
// month granularity, monthly proration, a January fiscal config, and the
// 'currentFY' window resolved through the same asOf the goldens used. Green
// here is the key phase-3a result — the real slicers reproduce the oracle.
// ---------------------------------------------------------------------------

// The slicers emit SpendLineItem { period, groupKey, value }; the goldens are
// {key, value} with zero buckets dropped. This maps between the two.
function chart(items: SpendLineItem[]): { key: string; value: number }[] {
  return items
    .filter((item) => item.value !== 0)
    .map((item) => ({ key: item.period, value: item.value }));
}

function billingMonthsOf(frequency: string | null | undefined): number {
  switch ((frequency ?? '').toLowerCase()) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'bi-annually':
    case 'semi-annually':
      return 6;
    case 'annually':
      return 12;
    default:
      return 0;
  }
}

const CURRENCY: CurrencyPolicy = { mode: 'preconverted-usd' };
const AS_OF = new Date(2026, 6, 15);
const JANUARY: FiscalConfig = { startMonth: 1 };
const FY2026 = resolveWindow('currentFY', AS_OF, JANUARY);

function loadGoldens() {
  const goldenPath = join(__dirname, '__goldens__', 'spend-goldens.json');
  return JSON.parse(readFileSync(goldenPath, 'utf8'));
}

describe('resolver equivalence: sliced segments reproduce the pinned goldens', () => {
  const goldens = loadGoldens();

  const singleContractShapes = [
    'standardMultiYear',
    'yearRenewalHint',
    'gartnerStub',
    'eighteenMonth',
    'oneTime',
    'willNotRenew',
    'annualIncrease',
    'annualIncreaseRenewalCycle',
  ];

  it.each(singleContractShapes)(
    '%s: actualCurrent + amortizedCurrent match the goldens',
    (name) => {
      const spec = shapes[name];
      const segments = resolveFeeSegments(makeContract(spec), undefined, {
        asOf: AS_OF,
        horizonStart: FY2026.start,
        horizonEnd: FY2026.end,
        currency: CURRENCY,
      });

      const amortized = chart(
        sliceAmortized(segments, FY2026, 'month', 'monthly', JANUARY),
      );
      const actual = chart(
        sliceActual(
          segments,
          FY2026,
          'month',
          { billingMonths: billingMonthsOf(spec.billingFrequency) },
          JANUARY,
        ),
      );

      expect(amortized).toEqual(goldens.extractors[name].amortizedCurrent);
      expect(actual).toEqual(goldens.extractors[name].actualCurrent);
    },
  );
});

// PR #1594 "year-as-renewal-hint" — the product-approved divergence from
// legacy. Legacy generatePriceHistory reads #1594 (12-month recorded term, but
// year-1 AND year-2 fee rows) as a 24-month committed term. Product decided the
// recorded contract dates are the true commitment: the recorded 12 months are
// the only committed period, and the extra year-2 row is a PROJECTED renewal.
//
// The golden fixture still pins legacy's 24-month reading and is intentionally
// left untouched — this is a documented set-B divergence, not a golden update.
// Crucially the amortized/actual SPEND NUMBERS are unchanged (the equivalence
// block above still passes): a renewal-projection segment contributes its fee
// to a bucket exactly like a committed period would. Only the segment TAGGING
// (committed 'year-entry'/'explicit' vs. projected 'renewal-projection'/
// 'inferred') and the committed-vs-projected split change.
describe('PR #1594: virtual-extension guard now splits committed vs. projected', () => {
  it('emits one committed year-1 segment and a year-2 renewal projection', () => {
    const segments = resolveFeeSegments(
      makeContract(shapes.yearRenewalHint),
      undefined,
      {
        asOf: AS_OF,
        horizonStart: FY2026.start,
        horizonEnd: FY2026.end,
        currency: CURRENCY,
      },
    );

    expect(segments).toHaveLength(2);

    const committed = segments.find((s) => s.source === 'year-entry');
    expect(committed).toMatchObject({
      from: '2025-01-01',
      to: '2026-01-01',
      fee: 1000,
      source: 'year-entry',
      confidence: 'explicit',
    });

    const projected = segments.find((s) => s.source === 'renewal-projection');
    expect(projected).toMatchObject({
      from: '2026-01-01',
      to: '2027-01-01',
      fee: 1100,
      source: 'renewal-projection',
      confidence: 'inferred',
    });
    expect(typeof projected?.reason).toBe('string');
    expect(projected?.reason?.length).toBeGreaterThan(0);
  });
});

// The concrete PSK-1850 case, asserted directly on the single decoder: contract
// 3047's year-3 slice (date span 2026-01-01 -> 2026-12-31, subscription_term 36,
// maxProductYear 3). The tie-breaker may resolve the term's IDENTITY to 36
// months, but the slice's own divisor must stay 12 so quarterly billing is
// 56044/12*3 = 14011 and the four quarters sum to the full 56044 — not 56044/36.
describe('PSK-1850: a fee segment divides by its own date span, never subscription_term', () => {
  it('year-3 slice divisor is 12, yielding 14011/quarter and 56044/year', () => {
    const sliceSpan = getTermLength('2026-01-01', '2026-12-31');
    expect(sliceSpan).toBe(12);

    const perQuarter = (56044 / sliceSpan) * 3;
    expect(perQuarter).toBe(14011);
    expect(perQuarter * 4).toBe(56044);
  });

  it('the tie-breaker still resolves term identity to 36 when asked', () => {
    expect(getTermLength('2026-01-01', '2026-12-31', 36, 3)).toBe(36);
  });

  it('resolver bills the full year-3 fee, not fee/36', () => {
    const segments = resolveFeeSegments(
      makeContract(shapes.standardMultiYear),
      undefined,
      {
        asOf: AS_OF,
        horizonStart: FY2026.start,
        horizonEnd: FY2026.end,
        currency: CURRENCY,
      },
    );
    const actual = chart(
      sliceActual(segments, FY2026, 'month', { billingMonths: 3 }, JANUARY),
    );
    expect(actual).toHaveLength(4);
    expect(actual.reduce((sum, point) => sum + point.value, 0)).toBe(56044);
    expect(actual.every((point) => point.value === 14011)).toBe(true);
  });
});

// The inactive gate lives in the resolver (generateRenewalSegments), so every
// consumer of resolveFeeSegments inherits it. Same spec, same future horizon:
// only contract.status differs, proving the resolver's status cap — not any
// caller — is what suppresses the projections past the recorded term end.
describe('resolver: inactive status caps renewal projections at the recorded term end', () => {
  const inactiveSpec: ContractSpec = {
    id: 7001,
    termStart: '2023-01-01',
    termEnd: '2023-12-31',
    subscriptionTerm: 12,
    renewalPeriod: 12,
    billingFrequency: 'Annually',
    products: [{ product_id: 100, year: 1, fees: 10000 }],
  };
  const FAR_HORIZON = new Date('2027-12-31T00:00:00.000Z');

  it('emits NO renewal-projection segments past the recorded term end when inactive', () => {
    const segments = resolveFeeSegments(
      makeContract({ ...inactiveSpec, status: 'inactive' }),
      undefined,
      {
        asOf: AS_OF,
        horizonStart: FY2026.start,
        horizonEnd: FAR_HORIZON,
        currency: CURRENCY,
      },
    );

    expect(segments.some((s) => s.source === 'renewal-projection')).toBe(false);
    expect(segments.every((s) => s.to <= '2024-01-01')).toBe(true);
  });

  it('the SAME spec left active DOES project renewals into the future window', () => {
    const segments = resolveFeeSegments(
      makeContract({ ...inactiveSpec, status: 'active' }),
      undefined,
      {
        asOf: AS_OF,
        horizonStart: FY2026.start,
        horizonEnd: FAR_HORIZON,
        currency: CURRENCY,
      },
    );

    const projected = segments.filter((s) => s.source === 'renewal-projection');
    expect(projected.length).toBeGreaterThan(0);
    expect(projected.some((s) => s.from >= '2024-01-01')).toBe(true);
  });
});
