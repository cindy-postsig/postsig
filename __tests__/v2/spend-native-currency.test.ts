import type { Contract } from '@/app/lib/budget/types';
import {
  querySpend,
  resolveFeeSegments,
  lineageFor,
  EMPTY_LINEAGE,
} from '@/lib/v2/spend';
import { buildEngineSpendByContract } from '@/lib/v2/spend/enrich';
import type { ContractWithPricing } from '@/lib/v2/core/types';

// The engine's legacy USD policy: fixtures carry pre-converted USD stamps.
const USD_POLICY = { mode: 'preconverted-usd' } as const;

const ASOF = new Date('2026-07-01T00:00:00Z');
const HORIZON = new Date('2028-01-01T00:00:00Z');
const HORIZON_START = new Date(0);

// EUR contract: the recorded fee and the USD stamp differ, so the two modes
// are distinguishable everywhere.
const NATIVE_FEE = 199_929;
const USD_FEE = 230_172.21;

const eurContract = {
  id: 1,
  vendor_id: 10,
  type_id: 2,
  status: 'active',
  status_id: 4,
  currency: 'eur',
  annual_increase: null,
  annual_increase_months: null,
  subscription_term: 12,
  renewal_period: 12,
  renewal_type: 'Auto',
  billing_frequency: 'Annually',
  will_not_renew: false,
  term_start_date: [{ date: '2026-01-01' }],
  term_end_date: [{ date: '2026-12-31' }],
  cancel_date: [],
  cancel_by_date: null,
  vendor_products_details: [
    {
      product_id: 100,
      year: 1,
      fees: NATIVE_FEE,
      convertedFees: USD_FEE,
      vendor_products: { id: 100, name: 'Feed' },
    },
  ],
  vendors: { name: 'Euronext' },
} as unknown as Contract;

describe('native currency policy (per-contract fee read)', () => {
  it('resolves segments from the original recorded fee, not the USD stamp', () => {
    const resolve = (mode: 'preconverted-usd' | 'native') =>
      resolveFeeSegments(eurContract, lineageFor(EMPTY_LINEAGE, 1), {
        asOf: ASOF,
        horizonStart: HORIZON_START,
        horizonEnd: HORIZON,
        currency: { mode },
      });

    expect(resolve('preconverted-usd')[0].fee).toBe(USD_FEE);
    expect(resolve('native')[0].fee).toBe(NATIVE_FEE);
  });

  it('carries the native fee through renewal projections', () => {
    const segments = resolveFeeSegments(
      eurContract,
      lineageFor(EMPTY_LINEAGE, 1),
      {
        asOf: ASOF,
        horizonStart: HORIZON_START,
        horizonEnd: HORIZON,
        currency: { mode: 'native' },
      },
    );
    const projections = segments.filter(
      (s) => s.source === 'renewal-projection',
    );
    expect(projections.length).toBeGreaterThan(0);
    for (const segment of projections) {
      expect(segment.fee).toBe(NATIVE_FEE);
    }
  });

  it('querySpend under native returns exact native totals per contract', () => {
    const result = querySpend([eurContract], {
      basis: 'amortized',
      source: 'expected',
      window: 'currentFY',
      granularity: 'year',
      groupBy: 'contract',
      currency: { mode: 'native' },
      fiscalConfig: { startMonth: 1 },
      asOf: ASOF,
    });
    const total = result.items.reduce((sum, item) => sum + item.value, 0);
    // Exact native cents — not a back-conversion from USD.
    expect(total).toBeCloseTo(NATIVE_FEE, 2);
  });

  it('stamps carry both currencies for the same window', () => {
    const enriched = [
      {
        id: 1,
        vendor_id: 10,
        contract: eurContract,
        products: [],
        priceHistory: null,
        isLinkedChildInvoice: false,
      } as unknown as ContractWithPricing,
    ];
    const values = buildEngineSpendByContract(
      enriched,
      [],
      { startMonth: 1 },
      ASOF,
      { currency: USD_POLICY },
    );
    expect(values.get(1)).toEqual({
      currentBase: USD_FEE,
      projectedBase: USD_FEE,
      currentNative: NATIVE_FEE,
      projectedNative: NATIVE_FEE,
    });
  });
});
