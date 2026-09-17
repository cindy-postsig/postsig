import type { RelationshipEdge } from './members';
import type { CurrencyPolicy } from './types';
import { isHierarchyEdge } from '@/lib/contracts/relationshipEdges';

// Bump on ANY resolver/slicer behavior change — cached derivations are only
// reusable across deploys that compute identical segments.
// v2: termStart stamped on committed segments (metadata for queryCommitments).
// v3: invoices (type_id 6) no longer project renewals (design decision #11).
// v4: annual increases count renewal-cycle years, not fee rows (PR #2039 port).
// v5: actual bills cap at the segment end — a segment shorter than its
//     billing interval conserves instead of over-billing a full interval.
// v6: invoice rules key on isInvoiceType (Invoice + EA Invoice), not a bare
//     type_id 6 — EA invoices stop projecting renewals (psk-1890 types).
// v7: one_time_only products book once in their recorded year — excluded from
//     renewal seeding and decision-#9 repeat cycles (psk-1492).
// v8: an invoice contributes to overall spend only with apply_to_overall_spend
//     set, so an unflagged standalone invoice no longer joins spend lineage.
export const SPEND_ENGINE_VERSION = 8;

export interface ComponentMember {
  id: number;
  // ISO timestamp of the row's last write; null-ish rows contribute ''.
  updated_at?: string | null;
  // Digest of the fee inputs the resolver reads (feeDigestOf). updated_at
  // alone misses them twice over: product rows live in their own table, and
  // convertedFees is re-stamped by currency conversion at contract-set cache
  // fill — an FX refresh changes every derived segment without touching any
  // contract row.
  feeDigest?: string;
  // Digest of the contract's lineage-event cancellation cutoffs
  // (cutoffDigestOf). Confirming a cancellation truncates derived segments
  // without touching the contract row or its fees, so the signature must
  // rotate on it too.
  cutoffDigest?: string;
}

interface FeeDigestProduct {
  product_id?: number | null;
  year?: number | null;
  fees?: number | string | null;
  convertedFees?: number | null;
  one_time_only?: boolean | null;
}

/**
 * Stable digest of the per-product fee inputs the resolver consumes
 * (convertedFees ?? fees, with year/product identity). Feed it to
 * buildComponentSignatures so cached derivations rotate when conversion or a
 * product-row edit changes the fees under an unchanged contract row.
 */
export function feeDigestOf(contract: {
  vendor_products_details?: FeeDigestProduct[] | null;
}): string {
  const rows = (contract.vendor_products_details ?? []).map(
    (p) =>
      // one_time_only changes resolved segments without touching fees, so a
      // toggle must rotate the signature too (psk-1492).
      `${p.product_id ?? ''}:${p.year ?? ''}:${Number(p.convertedFees ?? p.fees) || 0}:${p.one_time_only ? 1 : 0}`,
  );
  return fnv1a(rows.sort().join(','));
}

/**
 * Stable digest of one contract's lineage-event cancellation cutoffs
 * (PSK-1830), keyed at day resolution — the granularity the cutoff graph
 * consumes. Empty or absent maps digest to '' so contracts without
 * cancellations keep their signature.
 */
export function cutoffDigestOf(cutoffs: Map<number, Date> | undefined): string {
  if (!cutoffs?.size) return '';
  const rows = [...cutoffs].map(
    ([productId, date]) => `${productId}:${date.toISOString().slice(0, 10)}`,
  );
  return fnv1a(rows.sort().join(','));
}

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const SIXTY_FOUR_BITS = 0xffffffffffffffffn;

// FNV-1a, 64-bit. These digests gate cache VALIDITY, not bucketing: a
// collision between a contract's OLD and NEW state serves stale segments for
// the whole TTL. At 32 bits that was reachable with ordinary data — product
// 102 at 1142.97 and at 2285.21 hashed alike, so doubling that price kept the
// old segments. The BigInt arithmetic runs once per contract per resolution,
// nothing beside the Redis round-trip it guards.
function fnv1a(input: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash ^ BigInt(input.charCodeAt(i))) * FNV_PRIME) & SIXTY_FOUR_BITS;
  }
  return hash.toString(36);
}

/**
 * A per-contract signature of everything lineage-shaped that can change its
 * derived segments: every member of its lineage component (id + updated_at)
 * and every intra-component relationship edge. max(updated_at) alone is NOT
 * enough — deleting a member or toggling a relationship row changes the
 * derivation without bumping any surviving contract's updated_at, so the
 * signature hashes membership and edges too. Contracts with no relationships
 * form singleton components and get a signature of their own row only.
 */
export function buildComponentSignatures(
  contracts: ComponentMember[],
  relationships: RelationshipEdge[],
): Map<number, string> {
  const adjacency = new Map<number, number[]>();
  const link = (a: number, b: number): void => {
    const list = adjacency.get(a);
    if (list) list.push(b);
    else adjacency.set(a, [b]);
  };
  const edges: string[] = [];
  for (const rel of relationships) {
    // Components here must be the same components the builders derive over
    // (members.ts `orderedEdges`), or the cache key describes a different
    // graph than the cached value was computed from. Billing edges are
    // excluded on both sides.
    if (!isHierarchyEdge(rel)) continue;
    const p = rel.parent_contract_id;
    const c = rel.child_contract_id;
    if (p == null || c == null) continue;
    link(p, c);
    link(c, p);
    edges.push(`${p}>${c}`);
  }

  const byId = new Map(contracts.map((m) => [m.id, m]));
  const signatures = new Map<number, string>();
  const assigned = new Set<number>();

  for (const contract of contracts) {
    if (assigned.has(contract.id)) continue;

    const component = new Set<number>();
    const stack = [contract.id];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (component.has(id)) continue;
      component.add(id);
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!component.has(neighbor)) stack.push(neighbor);
      }
    }

    const memberIds = [...component].sort((a, b) => a - b);
    const memberPart = memberIds
      .map((id) => {
        const member = byId.get(id);
        return `${id}@${member?.updated_at ?? ''}@${member?.feeDigest ?? ''}@${member?.cutoffDigest ?? ''}`;
      })
      .join('|');
    const edgePart = edges
      .filter((e) => {
        const [p, c] = e.split('>').map(Number);
        return component.has(p) && component.has(c);
      })
      .sort()
      .join('|');
    const signature = fnv1a(`${memberPart}#${edgePart}`);

    for (const id of memberIds) {
      if (byId.has(id)) {
        signatures.set(id, signature);
        assigned.add(id);
      }
    }
  }

  return signatures;
}

/**
 * The cache key for one contract's derived FeeSegment[] (design doc,
 * "Caching"): component signature x horizon x asOf day x currency mode x
 * engine version. asOf participates at DAY resolution — the only asOf-
 * sensitive resolver rule (will-not-renew's future-end gate) compares dates.
 * The store layer (Redis, layered on the contract-set cache) lands with the
 * first high-volume port; this key contract is what it must use.
 */
export function derivationCacheKey(
  contractId: number,
  componentSignature: string,
  horizonEnd: Date,
  asOf: Date,
  currency: CurrencyPolicy,
): string {
  const horizon = horizonEnd.toISOString().slice(0, 10);
  const asOfDay = asOf.toISOString().slice(0, 10);
  return `spend:seg:v${SPEND_ENGINE_VERSION}:${contractId}:${componentSignature}:${horizon}:${asOfDay}:${currency.mode}`;
}
