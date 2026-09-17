import {
  derivationCacheKey,
  memoizedSegmentResolver,
  resolveFeeSegments,
  segmentMemoKey,
  type CurrencyPolicy,
  type FeeSegment,
  type SegmentResolver,
  type SpendContractInput,
} from '@/lib/v2/spend';

// The store surface the resolver needs — satisfied by the Redis service
// (user-scoped keys, JSON values, errors degrading to null/false).
export interface SegmentStore {
  mget(keys: string[]): Promise<(FeeSegment[] | null)[]>;
  mset(pairs: Array<{ key: string; value: FeeSegment[] }>): Promise<unknown>;
}

export interface CachedSegmentResolver {
  resolveSegments: SegmentResolver;
  // Writes this request's cache misses back to the store. Call after the
  // query completes so a thrown query never persists partial derivations.
  flush(): Promise<void>;
}

/**
 * Layers the derivation cache (design 5.0.5) around resolveFeeSegments: one
 * mget up front for every contract's key, then a synchronous resolver the
 * engine can call — cache hits return stored segments, misses compute and are
 * collected for a single mset on flush(). Keys follow derivationCacheKey
 * exactly (contract x component signature x horizon x asOf-day x currency x
 * engine version), so entries self-invalidate on any lineage-component edit,
 * window change, day rollover, or engine-version bump. Contracts missing a
 * component signature are resolved directly and never cached.
 */
export async function createCachedSegmentResolver(input: {
  store: SegmentStore;
  contracts: SpendContractInput[];
  signatures: Map<number, string>;
  // Per contract because queryCommitments pads the horizon by each
  // contract's cancel-by offset (commitmentHorizonEnd) — the stored
  // derivation must be keyed at the horizon it was computed with.
  horizonEndOf: (contract: SpendContractInput) => Date;
  asOf: Date;
  currency: CurrencyPolicy;
}): Promise<CachedSegmentResolver> {
  const keyOf = new Map<number, string>();
  // The in-request identity each store entry stands for. The store key already
  // pins horizon x asOf x currency, so a stored value answers ONLY a
  // resolution issued at those same options — matching on contract id alone
  // would serve it to any horizon that happened to ask first.
  const memoKeyOf = new Map<number, string>();
  for (const contract of input.contracts) {
    const signature = input.signatures.get(contract.id);
    if (!signature) continue;
    const horizonEnd = input.horizonEndOf(contract);
    keyOf.set(
      contract.id,
      derivationCacheKey(
        contract.id,
        signature,
        horizonEnd,
        input.asOf,
        input.currency,
      ),
    );
    memoKeyOf.set(
      contract.id,
      segmentMemoKey(contract, {
        asOf: input.asOf,
        horizonEnd,
        currency: input.currency,
      }),
    );
  }

  const ids = [...keyOf.keys()];
  const cached = new Map<string, FeeSegment[]>();
  if (ids.length > 0) {
    const values = await input.store.mget(ids.map((id) => keyOf.get(id)!));
    values.forEach((value, index) => {
      if (value) cached.set(memoKeyOf.get(ids[index])!, value);
    });
  }

  // Store lookup plus write-back collection only; the same-request memo
  // (queryCommitments resolves each contract on several passes) is
  // memoizedSegmentResolver's job, so there is one memo policy engine-wide.
  const computed = new Map<number, FeeSegment[]>();
  const resolveSegments = memoizedSegmentResolver(
    (contract, lineage, options) => {
      const memoKey = segmentMemoKey(contract, options);
      const hit = cached.get(memoKey);
      if (hit) return hit;
      const segments = resolveFeeSegments(contract, lineage, options);
      // Persist only a resolution the store key actually describes; anything
      // else would be filed under a key that misdescribes it.
      if (memoKeyOf.get(contract.id) === memoKey) {
        computed.set(contract.id, segments);
      }
      return segments;
    },
  );

  return {
    resolveSegments,
    async flush() {
      if (computed.size === 0) return;
      await input.store.mset(
        [...computed].map(([id, value]) => ({ key: keyOf.get(id)!, value })),
      );
    },
  };
}
