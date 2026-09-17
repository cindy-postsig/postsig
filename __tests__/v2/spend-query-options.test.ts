import type { Contract } from '@/app/lib/budget/types';
import {
  querySpend,
  queryRenewals,
  queryTCV,
  memoizedSegmentResolver,
  resolveFeeSegments,
  type SegmentResolver,
  type SpendQuery,
  type SpendEventQuery,
} from '@/lib/v2/spend';

function makeContract(): Contract {
  return {
    id: 1,
    vendor_id: 10,
    status: 'active',
    status_id: 4,
    currency: 'usd',
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
    vendor_products_details: [
      {
        product_id: 100,
        year: 1,
        fees: 1200,
        vendor_products: { id: 100, name: 'Product 100' },
      },
    ],
    vendors: { name: 'Test Vendor' },
  } as unknown as Contract;
}

const query: SpendQuery = {
  basis: 'amortized',
  source: 'expected',
  window: { fiscalYear: 2026 },
  granularity: 'month',
  groupBy: 'contract',
  currency: { mode: 'preconverted-usd' },
  fiscalConfig: { startMonth: 1 },
  asOf: new Date(Date.UTC(2026, 6, 15)),
};

const eventQuery: SpendEventQuery = {
  window: { fiscalYear: 2027 },
  granularity: 'month',
  groupBy: 'contract',
  currency: { mode: 'preconverted-usd' },
  fiscalConfig: { startMonth: 1 },
  asOf: new Date(Date.UTC(2026, 6, 15)),
};

describe('resolveSegments injection seam', () => {
  it('a delegating resolver reproduces the default result and receives engine opts', () => {
    const calls: Array<{
      contractId: number;
      horizonStart: Date;
      horizonEnd: Date;
      asOf: Date;
    }> = [];
    const delegating: SegmentResolver = (contract, lineage, options) => {
      calls.push({
        contractId: contract.id as number,
        horizonStart: options.horizonStart,
        horizonEnd: options.horizonEnd,
        asOf: options.asOf,
      });
      return resolveFeeSegments(contract, lineage, options);
    };

    const base = querySpend([makeContract()], query);
    const injected = querySpend([makeContract()], query, undefined, {
      resolveSegments: delegating,
    });

    expect(injected).toEqual(base);
    expect(calls).toHaveLength(1);
    expect(calls[0].contractId).toBe(1);
    // Horizon derives from the window END (design invariant), never asOf.
    expect(calls[0].horizonEnd).toEqual(new Date(Date.UTC(2027, 0, 1)));
    expect(calls[0].horizonStart).toEqual(new Date(Date.UTC(2026, 0, 1)));
    expect(calls[0].asOf).toEqual(query.asOf);
  });

  it('querySpend consumes the injected segments, not a re-derivation', () => {
    const canned: SegmentResolver = () => [
      {
        productId: 100,
        from: '2026-03-01',
        to: '2026-04-01',
        fee: 999,
        currency: 'USD',
        source: 'year-entry',
        confidence: 'explicit',
      },
    ];
    const result = querySpend([makeContract()], query, undefined, {
      resolveSegments: canned,
    });
    expect(result.items).toEqual([
      { period: '2026-03', groupKey: '1', value: 999 },
    ]);
  });

  it('queryRenewals and queryTCV consume the injected segments too', () => {
    const canned: SegmentResolver = () => [
      {
        productId: 100,
        from: '2027-02-01',
        to: '2028-02-01',
        fee: 555,
        currency: 'USD',
        source: 'renewal-projection',
        confidence: 'inferred',
        reason: 'renewal-projection',
        termStart: '2027-02-01',
      },
      {
        productId: 100,
        from: '2026-02-01',
        to: '2027-02-01',
        fee: 777,
        currency: 'USD',
        source: 'year-entry',
        confidence: 'explicit',
      },
    ];

    expect(
      queryRenewals([makeContract()], eventQuery, undefined, {
        resolveSegments: canned,
      }).items,
    ).toEqual([{ period: '2027-02', groupKey: '1', value: 555 }]);
    // TCV buckets the committed segment at the day before its exclusive end.
    expect(
      queryTCV([makeContract()], eventQuery, undefined, {
        resolveSegments: canned,
      }).items,
    ).toEqual([{ period: '2027-01', groupKey: '1', value: 777 }]);
  });
});

describe('memoizedSegmentResolver', () => {
  const HORIZON = new Date(Date.UTC(2027, 0, 1));
  const ASOF = new Date(Date.UTC(2026, 6, 15));
  const USD = { mode: 'preconverted-usd' } as const;
  const HORIZON_START = new Date(Date.UTC(2026, 0, 1));
  const opts = {
    asOf: ASOF,
    horizonStart: HORIZON_START,
    horizonEnd: HORIZON,
    currency: USD,
  };

  // Every field the key carries must be able to change the answer on its own,
  // so a memo keyed on anything less can serve one query another's segments.
  it.each([
    ['horizon', { ...opts, horizonEnd: new Date(Date.UTC(2028, 0, 1)) }],
    ['asOf', { ...opts, asOf: new Date(Date.UTC(2026, 7, 15)) }],
    ['currency mode', { ...opts, currency: { mode: 'native' } as const }],
  ])('re-resolves when the %s differs', (_label, other) => {
    let calls = 0;
    const resolve = memoizedSegmentResolver(() => {
      calls += 1;
      return [];
    });
    resolve(makeContract(), undefined, opts);
    resolve(makeContract(), undefined, other);
    expect(calls).toBe(2);
  });

  // horizonStart is deliberately outside the key: the contract resolver
  // ignores it, so two windows sharing an end resolve identically.
  it('shares one entry across windows differing only in their start', () => {
    let calls = 0;
    const resolve = memoizedSegmentResolver(() => {
      calls += 1;
      return [];
    });
    resolve(makeContract(), undefined, opts);
    resolve(makeContract(), undefined, {
      ...opts,
      horizonStart: new Date(Date.UTC(2020, 0, 1)),
    });
    expect(calls).toBe(1);
  });

  it('resolves once for repeated calls with the same contract and options', () => {
    let calls = 0;
    const resolve = memoizedSegmentResolver(() => {
      calls += 1;
      return [];
    });
    resolve(makeContract(), undefined, opts);
    resolve(makeContract(), undefined, { ...opts });
    expect(calls).toBe(1);
  });

  it('keeps distinct contracts apart', () => {
    const seen: number[] = [];
    const resolve = memoizedSegmentResolver((contract) => {
      seen.push(contract.id as number);
      return [];
    });
    resolve(makeContract(), undefined, opts);
    resolve({ ...makeContract(), id: 2 }, undefined, opts);
    expect(seen).toEqual([1, 2]);
  });

  it('defaults to resolveFeeSegments', () => {
    const contract = makeContract();
    expect(memoizedSegmentResolver()(contract, undefined, opts)).toEqual(
      resolveFeeSegments(contract, undefined, opts),
    );
  });
});
