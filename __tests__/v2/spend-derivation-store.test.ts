import type { Contract } from '@/app/lib/budget/types';
import {
  createCachedSegmentResolver,
  type SegmentStore,
} from '@/app/api/v2/handlers/spend/derivation-store';
import {
  derivationCacheKey,
  EMPTY_LINEAGE,
  lineageFor,
  type FeeSegment,
  type ResolveOptions,
} from '@/lib/v2/spend';

function makeContract(id: number): Contract {
  return {
    id,
    vendor_id: 10,
    status: 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: null,
    annual_increase_months: null,
    subscription_term: 12,
    renewal_period: 12,
    renewal_type: 'One-Time',
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

const horizonEnd = new Date(Date.UTC(2027, 0, 1));
const asOf = new Date(Date.UTC(2026, 6, 15));
const usd = { mode: 'preconverted-usd' } as const;
const resolveOptions: ResolveOptions = {
  asOf,
  horizonStart: new Date(0),
  horizonEnd,
  currency: usd,
};

function fakeStore(seed: Record<string, FeeSegment[]> = {}) {
  const data = new Map(Object.entries(seed));
  const writes: Array<{ key: string; value: FeeSegment[] }> = [];
  const store: SegmentStore = {
    mget: async (keys) => keys.map((key) => data.get(key) ?? null),
    mset: async (pairs) => {
      writes.push(...pairs);
      for (const { key, value } of pairs) data.set(key, value);
    },
  };
  return { store, writes };
}

describe('createCachedSegmentResolver', () => {
  it('computes on miss and flushes under the exact derivation key', async () => {
    const contract = makeContract(1);
    const { store, writes } = fakeStore();
    const { resolveSegments, flush } = await createCachedSegmentResolver({
      store,
      contracts: [contract],
      signatures: new Map([[1, 'sig1']]),
      horizonEndOf: () => horizonEnd,
      asOf,
      currency: usd,
    });

    const segments = resolveSegments(
      contract,
      lineageFor(EMPTY_LINEAGE, 1),
      resolveOptions,
    );
    expect(segments.length).toBeGreaterThan(0);

    await flush();
    expect(writes).toHaveLength(1);
    expect(writes[0].key).toBe(
      derivationCacheKey(1, 'sig1', horizonEnd, asOf, usd),
    );
    expect(writes[0].value).toEqual(segments);
  });

  it('returns stored segments on hit without recomputing', async () => {
    const contract = makeContract(1);
    const sentinel: FeeSegment[] = [
      {
        productId: 100,
        from: '2026-01-01',
        to: '2027-01-01',
        fee: 424242,
        currency: 'USD',
        source: 'year-entry',
        confidence: 'explicit',
      },
    ];
    const key = derivationCacheKey(1, 'sig1', horizonEnd, asOf, usd);
    const { store, writes } = fakeStore({ [key]: sentinel });
    const { resolveSegments, flush } = await createCachedSegmentResolver({
      store,
      contracts: [contract],
      signatures: new Map([[1, 'sig1']]),
      horizonEndOf: () => horizonEnd,
      asOf,
      currency: usd,
    });

    expect(
      resolveSegments(contract, lineageFor(EMPTY_LINEAGE, 1), resolveOptions),
    ).toEqual(sentinel);
    await flush();
    expect(writes).toHaveLength(0);
  });

  it('resolves but never caches a contract without a component signature', async () => {
    const contract = makeContract(2);
    const { store, writes } = fakeStore();
    const { resolveSegments, flush } = await createCachedSegmentResolver({
      store,
      contracts: [contract],
      signatures: new Map(),
      horizonEndOf: () => horizonEnd,
      asOf,
      currency: usd,
    });

    const segments = resolveSegments(
      contract,
      lineageFor(EMPTY_LINEAGE, 2),
      resolveOptions,
    );
    expect(segments.length).toBeGreaterThan(0);
    await flush();
    expect(writes).toHaveLength(0);
  });

  it('flushes nothing when every contract hits', async () => {
    const contract = makeContract(1);
    const key = derivationCacheKey(1, 'sig1', horizonEnd, asOf, usd);
    const { store, writes } = fakeStore({
      [key]: [],
    });
    const resolver = await createCachedSegmentResolver({
      store,
      contracts: [contract],
      signatures: new Map([[1, 'sig1']]),
      horizonEndOf: () => horizonEnd,
      asOf,
      currency: usd,
    });
    await resolver.flush();
    expect(writes).toHaveLength(0);
  });
});
