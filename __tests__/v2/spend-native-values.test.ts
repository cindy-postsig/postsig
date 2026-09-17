import { querySpend, queryRenewals } from '@/lib/v2/spend';
import type {
  SpendContractInput,
  SpendEventQuery,
  SpendQuery,
  SpendRateProvider,
} from '@/lib/v2/spend';

/**
 * PSK-1796: every engine line item carries its pre-conversion amount wherever
 * the bucket is denominationally coherent — nativeValue/nativeCurrency next to
 * the converted value. That is the display rule made structural: a single
 * contract shows unconverted, only genuine cross-currency aggregates convert,
 * and consumers (the spend chart popover) read the stamp instead of running a
 * second query.
 *
 * Native figures are PLACED from the unconverted segments, never divided back
 * out of the converted (cents-rounded) value, so the expectations below are
 * exact — no toBeCloseTo.
 */

// Distinct month and date rates, so a term-start-converted figure can never
// accidentally equal a month-converted one.
const rates: SpendRateProvider = {
  monthRate: () => 0.9,
  dateRate: () => 0.8,
};

const EUR_BASE = { mode: 'base', target: 'eur', rates } as const;

interface ContractSpec {
  id: number;
  vendorId?: number;
  currency?: string;
  sponsor?: string[];
  fees: number;
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
    renewal_type: 'One-Time',
    billing_frequency: 'Annually',
    will_not_renew: false,
    term_start_date: [{ date: '2025-01-01' }],
    term_end_date: [{ date: '2025-12-31' }],
    cancel_by_date: null,
    vendor_products_details: [
      {
        product_id: 100,
        year: 1,
        fees: spec.fees,
        // Deliberately absurd, so any number sourced from the legacy stamp
        // instead of the native fee is unmistakable.
        convertedFees: spec.fees * 10,
      },
    ],
  };
}

const AS_OF = new Date('2025-06-15T00:00:00.000Z');

function spendQuery(overrides: Partial<SpendQuery> = {}): SpendQuery {
  return {
    basis: 'amortized',
    source: 'expected',
    window: { from: '2025-01-01', to: '2026-01-01' },
    granularity: 'year',
    groupBy: 'contract',
    currency: EUR_BASE,
    fiscalConfig: { startMonth: 1 },
    asOf: AS_OF,
    ...overrides,
  } as SpendQuery;
}

describe('native value stamps, amortized basis (monthly conversion)', () => {
  it('a foreign contract carries its unconverted amount and currency', () => {
    const [item] = querySpend(
      [makeContract({ id: 1, currency: 'usd', fees: 1200 })],
      spendQuery(),
    ).items;

    expect(item.value).toBe(1080); // 1200 × 0.9, month by month
    expect(item.nativeValue).toBe(1200); // the recorded fee, untouched
    expect(item.nativeCurrency).toBe('USD');
  });

  it('an identity contract stamps native == value', () => {
    const [item] = querySpend(
      [makeContract({ id: 1, currency: 'eur', fees: 1200 })],
      spendQuery(),
    ).items;

    expect(item.value).toBe(1200);
    expect(item.nativeValue).toBe(1200);
    expect(item.nativeCurrency).toBe('EUR');
  });

  it('a mixed cross-contract bucket carries no native figure', () => {
    const items = querySpend(
      [
        makeContract({ id: 1, currency: 'usd', fees: 1200 }),
        makeContract({ id: 2, currency: 'gbp', fees: 600 }),
      ],
      spendQuery({ groupBy: 'total' }),
    ).items;

    expect(items).toHaveLength(1);
    expect(items[0].nativeValue).toBeUndefined();
    expect(items[0].nativeCurrency).toBeUndefined();
  });

  it('a single-currency cross-contract bucket keeps its shared denomination', () => {
    // Two USD contracts under a EUR org: their vendor bucket never left USD,
    // so the native sum still means something and rides along.
    const items = querySpend(
      [
        makeContract({ id: 1, vendorId: 7, currency: 'usd', fees: 1200 }),
        makeContract({ id: 2, vendorId: 7, currency: 'usd', fees: 600 }),
      ],
      spendQuery({ groupBy: 'vendor' }),
    ).items;

    expect(items).toHaveLength(1);
    expect(items[0].value).toBe(1620); // (1200 + 600) × 0.9
    expect(items[0].nativeValue).toBe(1800);
    expect(items[0].nativeCurrency).toBe('USD');
  });

  it('sponsor splits are cents-preserving in both denominations, remainder included', () => {
    // 1200.01 does not halve: splitEvenly hands the odd cent to the first
    // key, and it must do so in the native denomination too. Committed basis,
    // where the whole term places at once — the amortized bases quantize each
    // month to cents first, so an odd term cent never reaches their split.
    const items = querySpend(
      [
        makeContract({
          id: 1,
          currency: 'usd',
          sponsor: ['Alice', 'Bob'],
          fees: 1200.01,
        }),
      ],
      spendQuery({ groupBy: 'sponsor', basis: 'committed' }),
    ).items;

    expect(items).toHaveLength(2);
    const natives = items.map((i) => i.nativeValue).sort((a, b) => b! - a!);
    expect(natives).toEqual([600.01, 600]);
    const cents = (n: number) => Math.round(n * 100);
    expect(cents(items[0].nativeValue!) + cents(items[1].nativeValue!)).toBe(
      120001,
    );
    items.forEach((i) => expect(i.nativeCurrency).toBe('USD'));
  });
});

describe('native value stamps, term-start conversion (event views)', () => {
  // A window that CONTAINS the 2026-01-01 renewal event of the standard
  // fixture (auto-renewing 2025 term).
  const eventQuery: SpendEventQuery = {
    window: { from: '2026-01-01', to: '2027-01-01' },
    granularity: 'year',
    groupBy: 'contract',
    currency: EUR_BASE,
    fiscalConfig: { startMonth: 1 },
    asOf: AS_OF,
  };

  it('renewals: converted at the date rate, native untouched', () => {
    const [item] = queryRenewals(
      [
        {
          ...makeContract({ id: 1, currency: 'usd', fees: 1200 }),
          renewal_type: 'Auto',
        },
      ],
      eventQuery,
    ).items;

    expect(item.nativeValue).toBe(1200); // the incoming term, unconverted
    expect(item.value).toBe(960); // 1200 × 0.8: dateRate, not monthRate
    expect(item.nativeCurrency).toBe('USD');
  });
});

describe('native value stamps, legacy policy', () => {
  it("'preconverted-usd' emits nothing — the native amounts were never resolved", () => {
    const [item] = querySpend(
      [makeContract({ id: 1, currency: 'usd', fees: 1200 })],
      spendQuery({ currency: { mode: 'preconverted-usd' } }),
    ).items;

    expect(item.value).toBe(12000); // the 10× stamp — the legacy path's read
    expect(item.nativeValue).toBeUndefined();
    expect(item.nativeCurrency).toBeUndefined();
  });

  it("'native' stamps value as its own native", () => {
    const [item] = querySpend(
      [makeContract({ id: 1, currency: 'usd', fees: 1200 })],
      spendQuery({ currency: { mode: 'native' } }),
    ).items;

    expect(item.value).toBe(1200);
    expect(item.nativeValue).toBe(1200);
    expect(item.nativeCurrency).toBe('USD');
  });
});
