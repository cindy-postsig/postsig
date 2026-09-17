import {
  buildComponentSignatures,
  cutoffDigestOf,
  derivationCacheKey,
  feeDigestOf,
  SPEND_ENGINE_VERSION,
} from '@/lib/v2/spend';
import type { RelationshipEdge } from '@/lib/v2/spend';

const edge = (parent: number, child: number): RelationshipEdge => ({
  parent_contract_id: parent,
  child_contract_id: child,
});

const T1 = '2026-01-01T00:00:00Z';
const T2 = '2026-06-15T12:30:00Z';

describe('buildComponentSignatures', () => {
  const contracts = [
    { id: 1, updated_at: T1 },
    { id: 2, updated_at: T1 },
    { id: 3, updated_at: T1 },
  ];
  const rels = [edge(1, 2)];

  it('every member of a component shares one signature; other components differ', () => {
    const signatures = buildComponentSignatures(contracts, rels);
    expect(signatures.get(1)).toBe(signatures.get(2));
    expect(signatures.get(3)).toBeDefined();
    expect(signatures.get(3)).not.toBe(signatures.get(1));
  });

  it("changes when ANY member's updated_at changes — not just the contract's own", () => {
    const before = buildComponentSignatures(contracts, rels);
    const after = buildComponentSignatures(
      [
        { id: 1, updated_at: T1 },
        { id: 2, updated_at: T2 },
        { id: 3, updated_at: T1 },
      ],
      rels,
    );
    // Contract 1's own row is untouched, but its component changed.
    expect(after.get(1)).not.toBe(before.get(1));
    expect(after.get(3)).toBe(before.get(3));
  });

  it('changes when a member is REMOVED even though no surviving row changed', () => {
    const before = buildComponentSignatures(contracts, rels);
    const after = buildComponentSignatures(
      [
        { id: 1, updated_at: T1 },
        { id: 3, updated_at: T1 },
      ],
      [],
    );
    expect(after.get(1)).not.toBe(before.get(1));
  });

  it('changes when a relationship edge appears, with no contract row touched', () => {
    const before = buildComponentSignatures(contracts, rels);
    const after = buildComponentSignatures(contracts, [edge(1, 2), edge(1, 3)]);
    expect(after.get(1)).not.toBe(before.get(1));
    expect(after.get(3)).not.toBe(before.get(3));
  });

  // psk-1930: the signature keys the derivation cache; the builders it caches
  // (members.ts orderedEdges) skip billing edges. If the two disagree, the key
  // describes a graph the cached value was never computed from.
  it('does not merge components across a billing edge', () => {
    const billing = {
      parent_contract_id: 1,
      child_contract_id: 3,
      relationship_type: 'billing',
    };
    const signatures = buildComponentSignatures(contracts, [...rels, billing]);
    expect(signatures.get(1)).toBe(signatures.get(2));
    expect(signatures.get(3)).not.toBe(signatures.get(1));
  });

  it('is unchanged by adding a billing edge', () => {
    const before = buildComponentSignatures(contracts, rels);
    const after = buildComponentSignatures(contracts, [
      ...rels,
      {
        parent_contract_id: 1,
        child_contract_id: 3,
        relationship_type: 'billing',
      },
    ]);
    expect(after.get(1)).toBe(before.get(1));
    expect(after.get(3)).toBe(before.get(3));
  });

  it('changes when an edge is added between ALREADY-connected members (membership identical)', () => {
    const chain = [edge(1, 2), edge(2, 3)];
    const before = buildComponentSignatures(contracts, chain);
    // A redundant/reversed link changes parenthood but not membership — the
    // signature must still move, or a relationship flip would serve stale
    // segments.
    const after = buildComponentSignatures(contracts, [...chain, edge(3, 1)]);
    expect(after.get(1)).not.toBe(before.get(1));
  });

  it('is deterministic across input order', () => {
    const shuffled = buildComponentSignatures(
      [contracts[2], contracts[0], contracts[1]],
      [edge(1, 2)],
    );
    const straight = buildComponentSignatures(contracts, rels);
    expect(shuffled.get(1)).toBe(straight.get(1));
    expect(shuffled.get(3)).toBe(straight.get(3));
  });

  // The 2026-07-30 stale-card incident: an FX refresh re-stamps convertedFees
  // at contract-set cache fill without touching updated_at, so a signature
  // blind to fees keeps serving old-rate segments all day.
  it("changes when a member's fee digest changes under an unchanged updated_at", () => {
    const withFees = (digest: string) => [
      { id: 1, updated_at: T1, feeDigest: digest },
      { id: 2, updated_at: T1 },
      { id: 3, updated_at: T1 },
    ];
    const before = buildComponentSignatures(withFees('a'), rels);
    const after = buildComponentSignatures(withFees('b'), rels);
    expect(after.get(1)).not.toBe(before.get(1));
    // The whole component rotates with it, and untouched components do not.
    expect(after.get(2)).not.toBe(before.get(2));
    expect(after.get(3)).toBe(before.get(3));
  });

  // PSK-1830: confirming a product cancellation truncates derived segments
  // without touching the contract row or its fees, so a signature blind to
  // cutoffs keeps serving un-cut segments all day.
  it("changes when a member's cutoff digest changes under unchanged fees", () => {
    const withCutoffs = (digest: string) => [
      { id: 1, updated_at: T1, cutoffDigest: digest },
      { id: 2, updated_at: T1 },
      { id: 3, updated_at: T1 },
    ];
    const before = buildComponentSignatures(withCutoffs(''), rels);
    const after = buildComponentSignatures(withCutoffs('c1'), rels);
    expect(after.get(1)).not.toBe(before.get(1));
    // The whole component rotates with it, and untouched components do not.
    expect(after.get(2)).not.toBe(before.get(2));
    expect(after.get(3)).toBe(before.get(3));
  });

  it('cutoffDigestOf is order-stable, day-resolution, and empty for no cutoffs', () => {
    const cutoffs = new Map([
      [10, new Date('2026-03-01T00:00:00Z')],
      [20, new Date('2026-09-15T00:00:00Z')],
    ]);
    const reversed = new Map([...cutoffs].reverse());
    expect(cutoffDigestOf(cutoffs)).toBe(cutoffDigestOf(reversed));

    // Same day, different wall-clock time → same digest.
    const laterSameDay = new Map([
      [10, new Date('2026-03-01T18:30:00Z')],
      [20, new Date('2026-09-15T00:00:00Z')],
    ]);
    expect(cutoffDigestOf(laterSameDay)).toBe(cutoffDigestOf(cutoffs));

    const movedDate = new Map([
      [10, new Date('2026-04-01T00:00:00Z')],
      [20, new Date('2026-09-15T00:00:00Z')],
    ]);
    expect(cutoffDigestOf(movedDate)).not.toBe(cutoffDigestOf(cutoffs));

    expect(cutoffDigestOf(undefined)).toBe('');
    expect(cutoffDigestOf(new Map())).toBe('');
  });

  it('feeDigestOf reads convertedFees over native fees and is order-stable', () => {
    const digest = (details: object[]) =>
      feeDigestOf({ vendor_products_details: details as never });
    const rows = [
      { product_id: 100, year: 1, fees: 178767, convertedFees: 206138.04 },
      { product_id: 200, year: 1, fees: 5000 },
    ];
    expect(digest(rows)).toBe(digest([...rows].reverse()));
    expect(
      digest([{ ...rows[0], convertedFees: 205111.66 }, rows[1]]),
    ).not.toBe(digest(rows));
    // Native-fee change with no conversion present also rotates.
    expect(digest([rows[0], { ...rows[1], fees: 6000 }])).not.toBe(
      digest(rows),
    );
  });

  // These digests gate cache VALIDITY, so a collision between a contract's old
  // and new state serves stale segments for the whole TTL. Under the former
  // 32-bit digest this exact pair collided — a doubled price that the cache
  // could not see.
  it('separates fee states that collided under a 32-bit digest', () => {
    const digest = (fees: number) =>
      feeDigestOf({
        vendor_products_details: [{ product_id: 102, year: 1, fees }],
      });
    expect(digest(1142.97)).not.toBe(digest(2285.21));
  });
});

describe('derivationCacheKey', () => {
  const base = {
    horizon: new Date('2028-01-01T00:00:00Z'),
    asOf: new Date('2026-07-18T15:45:00Z'),
  };

  it('encodes contract, signature, horizon, asOf DAY, currency mode, and engine version', () => {
    const key = derivationCacheKey(3038, 'abc123', base.horizon, base.asOf, {
      mode: 'preconverted-usd',
    });
    expect(key).toBe(
      `spend:seg:v${SPEND_ENGINE_VERSION}:3038:abc123:2028-01-01:2026-07-18:preconverted-usd`,
    );
  });

  it('same day, different wall-clock time → same key (day resolution)', () => {
    const morning = derivationCacheKey(
      1,
      's',
      base.horizon,
      new Date('2026-07-18T01:00:00Z'),
      { mode: 'preconverted-usd' },
    );
    const evening = derivationCacheKey(
      1,
      's',
      base.horizon,
      new Date('2026-07-18T23:00:00Z'),
      { mode: 'preconverted-usd' },
    );
    expect(morning).toBe(evening);
  });

  it('horizon and signature changes produce distinct keys', () => {
    const a = derivationCacheKey(1, 's1', base.horizon, base.asOf, {
      mode: 'preconverted-usd',
    });
    const b = derivationCacheKey(1, 's2', base.horizon, base.asOf, {
      mode: 'preconverted-usd',
    });
    const c = derivationCacheKey(
      1,
      's1',
      new Date('2029-01-01T00:00:00Z'),
      base.asOf,
      { mode: 'preconverted-usd' },
    );
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
