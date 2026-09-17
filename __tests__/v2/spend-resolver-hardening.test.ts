import { resolveFeeSegments, INFERENCE_REASONS } from '@/lib/v2/spend/resolver';
import { querySpend } from '@/lib/v2/spend';
import type { CurrencyPolicy, FeeSegment } from '@/lib/v2/spend';
import type { Contract } from '@/app/lib/budget/types';
import logger from '@/utils/pino';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const warn = logger.warn as jest.Mock;

interface ProductSpec {
  product_id: number;
  year?: number;
  fees: number;
}
interface ContractSpec {
  id?: number;
  status?: string;
  termStarts: string[];
  termEnds: string[];
  subscriptionTerm?: number | null;
  renewalPeriod?: number | null;
  renewalType?: string | null;
  billingFrequency?: string | null;
  products: ProductSpec[];
}

function makeContract(spec: ContractSpec): Contract {
  return {
    id: spec.id ?? 1,
    vendor_id: 1,
    status: spec.status ?? 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: null,
    annual_increase_months: null,
    subscription_term: spec.subscriptionTerm ?? null,
    renewal_period: spec.renewalPeriod ?? null,
    renewal_type: spec.renewalType ?? 'Auto',
    billing_frequency: spec.billingFrequency ?? null,
    will_not_renew: false,
    term_start_date: spec.termStarts.map((date) => ({ date })),
    term_end_date: spec.termEnds.map((date) => ({ date })),
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
const ASOF = new Date(Date.UTC(2026, 6, 15));
const HORIZON_START = new Date(0);

function resolve(contract: Contract): FeeSegment[] {
  return resolveFeeSegments(contract, undefined, {
    asOf: ASOF,
    horizonStart: HORIZON_START,
    horizonEnd: new Date(Date.UTC(2027, 0, 1)),
    currency: USD,
  });
}

// Legacy toIsoDateString parity: manually-entered non-ISO dates must degrade
// gracefully, never throw "Invalid time value" out of querySpend for the
// whole contract set.
describe('invalid-date recovery', () => {
  it('recovers US-format manual dates via the lenient parser', () => {
    const segments = resolve(
      makeContract({
        termStarts: ['01/31/2022'],
        termEnds: ['01/30/2023'],
        subscriptionTerm: 12,
        renewalType: 'One-Time',
        products: [{ product_id: 100, fees: 10000 }],
      }),
    );
    expect(segments).toEqual([
      expect.objectContaining({
        from: '2022-01-31',
        to: '2023-01-31',
        fee: 10000,
      }),
    ]);
  });

  it('resolves to no segments when no start date is parseable', () => {
    const segments = resolve(
      makeContract({
        termStarts: ['not a date'],
        termEnds: ['2023-01-30'],
        renewalType: 'One-Time',
        products: [{ product_id: 100, fees: 10000 }],
      }),
    );
    expect(segments).toEqual([]);
  });

  it('falls back to subscription_term when no end date is parseable', () => {
    const segments = resolve(
      makeContract({
        termStarts: ['2024-01-01'],
        termEnds: ['garbage'],
        subscriptionTerm: 12,
        renewalType: 'One-Time',
        products: [{ product_id: 100, fees: 10000 }],
      }),
    );
    expect(segments).toEqual([
      expect.objectContaining({
        from: '2024-01-01',
        to: '2025-01-01',
        fee: 10000,
      }),
    ]);
  });

  it('drops unparseable entries and keeps the valid ones', () => {
    const segments = resolve(
      makeContract({
        termStarts: ['banana', '2024-01-01'],
        termEnds: ['2024-12-31', 'banana'],
        subscriptionTerm: 12,
        renewalType: 'One-Time',
        products: [{ product_id: 100, fees: 10000 }],
      }),
    );
    expect(segments).toEqual([
      expect.objectContaining({ from: '2024-01-01', to: '2025-01-01' }),
    ]);
  });

  it('one bad contract does not fail querySpend for the whole set', () => {
    const bad = makeContract({
      id: 1,
      termStarts: ['not a date'],
      termEnds: ['also not a date'],
      renewalType: 'One-Time',
      products: [{ product_id: 100, fees: 99999 }],
    });
    const good = makeContract({
      id: 2,
      termStarts: ['2026-01-01'],
      termEnds: ['2026-12-31'],
      subscriptionTerm: 12,
      renewalType: 'One-Time',
      products: [{ product_id: 200, fees: 12000 }],
    });

    const result = querySpend([bad, good], {
      basis: 'committed',
      source: 'expected',
      window: { fiscalYear: 2026 },
      granularity: 'year',
      groupBy: 'contract',
      currency: USD,
      fiscalConfig: { startMonth: 1 },
      asOf: ASOF,
    });

    expect(result.items).toEqual([
      { period: 'FY2026', groupKey: '2', value: 12000 },
    ]);
  });
});

// Legacy breaks on termStart > archivedContractEnd, so a renewal cycle
// starting exactly ON the latest recorded end date is still emitted.
describe('inactive-cap boundary parity', () => {
  const base = {
    termStarts: ['2024-01-01'],
    subscriptionTerm: 12,
    products: [{ product_id: 100, fees: 10000 }],
  };

  it('emits the cycle whose start coincides with the recorded end', () => {
    // Irregular data: an extra end entry one day past the initial term end
    // makes the first renewal's start coincide with the recorded end.
    const segments = resolve(
      makeContract({
        ...base,
        status: 'inactive',
        termEnds: ['2024-12-31', '2025-01-01'],
      }),
    );
    expect(segments.filter((s) => s.source === 'renewal-projection')).toEqual([
      expect.objectContaining({ from: '2025-01-01', to: '2026-01-01' }),
    ]);
  });

  it('still projects nothing when the recorded end precedes the first cycle start', () => {
    const segments = resolve(
      makeContract({
        ...base,
        status: 'inactive',
        termEnds: ['2024-12-31'],
      }),
    );
    expect(segments.filter((s) => s.source === 'renewal-projection')).toEqual(
      [],
    );
  });
});

describe('defaulted renewal length surfaces in segment metadata', () => {
  it('tags projections with the renewalLengthDefault reason when length was non-positive', () => {
    const segments = resolve(
      makeContract({
        termStarts: ['2024-01-01'],
        termEnds: ['2024-12-31'],
        renewalPeriod: -6,
        products: [{ product_id: 100, fees: 10000 }],
      }),
    );
    const renewals = segments.filter((s) => s.source === 'renewal-projection');
    expect(renewals.length).toBeGreaterThan(0);
    for (const segment of renewals) {
      expect(segment.reason).toBe(INFERENCE_REASONS.renewalLengthDefault);
    }
    // Defaulted to 12-month cycles.
    expect(renewals[0]).toEqual(
      expect.objectContaining({ from: '2025-01-01', to: '2026-01-01' }),
    );
  });

  it('keeps the ordinary projection reason when the length is valid', () => {
    const segments = resolve(
      makeContract({
        termStarts: ['2024-01-01'],
        termEnds: ['2024-12-31'],
        subscriptionTerm: 12,
        products: [{ product_id: 100, fees: 10000 }],
      }),
    );
    const renewals = segments.filter((s) => s.source === 'renewal-projection');
    expect(renewals.length).toBeGreaterThan(0);
    for (const segment of renewals) {
      expect(segment.reason).toBe(INFERENCE_REASONS.renewalProjection);
    }
  });
});

// The 200-cycle guard exists to stop a runaway loop, not to model an end of
// life: when it fires the projection stops short of the requested horizon, so
// it has to say so rather than hand back quietly truncated segments.
describe('renewal projection cap', () => {
  beforeEach(() => warn.mockClear());

  const monthlyCycle = (horizonEnd: Date): FeeSegment[] =>
    resolveFeeSegments(
      makeContract({
        id: 4242,
        termStarts: ['1970-01-01'],
        termEnds: ['1970-01-31'],
        renewalPeriod: 1,
        products: [{ product_id: 100, fees: 1200 }],
      }),
      undefined,
      { asOf: ASOF, horizonStart: HORIZON_START, horizonEnd, currency: USD },
    );

  it('warns once, with the contract and horizon, when the cap truncates', () => {
    const segments = monthlyCycle(new Date(Date.UTC(2030, 0, 1)));
    // 201 monthly cycles from 1970-02 lands well short of the 2030 horizon.
    expect(
      segments.filter((s) => s.source === 'renewal-projection'),
    ).toHaveLength(201);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: 4242,
        renewalCount: 201,
        horizon: '2030-01-01',
        cap: 200,
      }),
      expect.stringContaining('truncated'),
    );
  });

  it('stays silent when the horizon is reached before the cap', () => {
    monthlyCycle(new Date(Date.UTC(1975, 0, 1)));
    expect(warn).not.toHaveBeenCalled();
  });
});
