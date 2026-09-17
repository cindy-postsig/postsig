import { parseUTCDate } from '../dates';

// The lineage facts the cutoff walk needs, one row per (contract, product).
// Callers derive these from enrichWithLineage's per-product output (a
// ProductWithLineage carries exactly sourceContractId / isSuperseding); the
// spend engine never fetches relationships itself. `originalStart` is the
// contract's EARLIEST recorded term_start_date (ISO yyyy-MM-dd) — the true
// start even for a contract that has itself been renewed, so a child cuts its
// predecessor at its real beginning.
export interface LineageMember {
  contractId: number;
  productId: number;
  sourceContractId: number;
  isSuperseding: boolean;
  originalStart: string;
}

// The lineage graph, keyed for O(1) per-contract lookup during resolution.
export interface SpendLineage {
  // contractId → productId → cutoff (exclusive ISO date). A superseded
  // product's segments end at (are truncated to) this cutoff and it projects
  // no renewals past it.
  cutoffs: Map<number, Map<number, string>>;
  // contractId → productId → the source contract id this product amends.
  // Metadata only: retags the superseding contract's own segments as
  // source:'amendment'. Never affects slice math.
  amends: Map<number, Map<number, number>>;
  // contractId → the direct relationship parent's subscription_term (months).
  // Recorded facts, populated by buildParentTerms (members.ts) — the resolver
  // applies a parent's term only when the child records neither an end date
  // nor its own subscription_term (addendum term inheritance, parent-agnostic).
  parentTerms: Map<number, number>;
  // contractId → notice-period days inherited from a linked MSA (psk-1855),
  // populated by buildParentNoticeDays. Commitment recognition falls back to
  // this when the contract records no cancel_by_date of its own.
  parentNoticeDays: Map<number, number>;
}

// The slice of the graph a single contract's resolution consumes.
export interface ContractLineage {
  cutoffByProduct: Map<number, string>;
  amendsByProduct: Map<number, number>;
  parentSubscriptionTerm?: number;
}

export const EMPTY_LINEAGE: SpendLineage = {
  cutoffs: new Map(),
  amends: new Map(),
  parentTerms: new Map(),
  parentNoticeDays: new Map(),
};

function setNested<V>(
  outer: Map<number, Map<number, V>>,
  contractId: number,
  productId: number,
  value: V,
): void {
  let inner = outer.get(contractId);
  if (!inner) {
    inner = new Map();
    outer.set(contractId, inner);
  }
  inner.set(productId, value);
}

/**
 * Build the supersession cutoff graph by walking family chains — the resolver's
 * port of the price-history page's buildCutoffsByContract (module retired at the 5.2 price-history port).
 *
 * A "family" is `(product_id, sourceContractId)`: every contract carrying the
 * same product traced back to the same source. Within each family, members are
 * sorted by their original term_start_date and each non-tail member's cutoff is
 * the next member that is strictly later by start OR a source→amendment role
 * change. Members tied on BOTH are concurrent siblings — parallel SOWs under one
 * MSA signed the same day — and never cut each other; they project in parallel.
 *
 * Cutoffs come from real timeline transitions only. We deliberately do NOT read
 * `isSuperseded`: lineage's deduplicateSiblingProducts also sets it to pick an
 * arbitrary winner among concurrent siblings, which would wrongly zero out
 * parallel SOWs.
 *
 * `members` MUST exclude LINKED CHILD invoices (`isLinkedChildInvoice`) — what
 * filterToBudgetContracts / filterForAggregation already drop, because the parent
 * carries the fee. A linked invoice shares its parent's `sourceContractId`, so it
 * lands in the parent's family; since the resolver truncates segments AT the
 * cutoff, its start date would slice a real Service Order down to a few prorated
 * days. Legacy's period-granular zeroing tolerates unfiltered invoices; this
 * segment engine does not. (Verified against a real org: members including linked
 * invoices produced 45 spurious straddles, excluding them produced 2 genuine.)
 *
 * STANDALONE invoices (no parent) are cutoff-neutral — their source resolves to
 * themselves, so they form singleton families and never cut another contract — and
 * they legitimately contribute to spend today, so do NOT blanket-exclude type_id 6.
 * (The price-history rollup excludes all invoices, but that is a per-surface spend
 * policy, not a cutoff-correctness requirement.)
 */
export function buildSpendLineage(members: LineageMember[]): SpendLineage {
  const lineage: SpendLineage = {
    cutoffs: new Map(),
    amends: new Map(),
    parentTerms: new Map(),
    parentNoticeDays: new Map(),
  };

  const families = new Map<string, LineageMember[]>();
  for (const member of members) {
    if (member.isSuperseding) {
      setNested(
        lineage.amends,
        member.contractId,
        member.productId,
        member.sourceContractId,
      );
    }
    const key = `${member.productId}__${member.sourceContractId}`;
    const list = families.get(key) ?? [];
    list.push(member);
    families.set(key, list);
  }

  for (const family of families.values()) {
    if (family.length <= 1) continue;

    const sorted = [...family].sort((a, b) => {
      const dateDiff =
        parseUTCDate(a.originalStart).getTime() -
        parseUTCDate(b.originalStart).getTime();
      if (dateDiff !== 0) return dateDiff;
      // Source first (isSuperseding=false before true) so the source is the
      // member that gets cut when a source and its amendment share a start.
      if (a.isSuperseding !== b.isSuperseding) return a.isSuperseding ? 1 : -1;
      return 0;
    });

    for (let i = 0; i < sorted.length - 1; i++) {
      const member = sorted[i];
      const memberStart = parseUTCDate(member.originalStart).getTime();
      const next = sorted
        .slice(i + 1)
        .find(
          (c) =>
            parseUTCDate(c.originalStart).getTime() !== memberStart ||
            c.isSuperseding !== member.isSuperseding,
        );
      if (!next) continue;
      setNested(
        lineage.cutoffs,
        member.contractId,
        member.productId,
        next.originalStart,
      );
    }
  }

  return lineage;
}

export function lineageFor(
  lineage: SpendLineage,
  contractId: number,
): ContractLineage | undefined {
  const cutoffByProduct = lineage.cutoffs.get(contractId);
  const amendsByProduct = lineage.amends.get(contractId);
  const parentSubscriptionTerm = lineage.parentTerms.get(contractId);
  if (!cutoffByProduct && !amendsByProduct && parentSubscriptionTerm == null) {
    return undefined;
  }
  return {
    cutoffByProduct: cutoffByProduct ?? new Map(),
    amendsByProduct: amendsByProduct ?? new Map(),
    parentSubscriptionTerm,
  };
}
