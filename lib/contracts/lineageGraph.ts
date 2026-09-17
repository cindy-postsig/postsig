import type {
  LineageContractRecord,
  LineageTreeNode,
} from '@/lib/contracts/lineageNodes';

/**
 * Pure assembly for the lineage graph's billing extension: the lineage map
 * renders one connected DAG — the primary hierarchy plus the chains of
 * directly billing-linked contracts, joined by dashed billing edges. This
 * module merges the fetched pieces; it never fetches and never touches
 * strike-through resolution (`chainContracts` stays per-chain by design).
 */

/** A `'billing'` relationship as a directed graph edge: payer -> invoice. */
export interface BillingLineageEdge {
  source: number;
  target: number;
}

/** One amendment chain as fetched by `getAmendmentChain`. */
export interface LineageChain {
  completeHierarchy: LineageTreeNode | null;
  allContractsInHierarchy: LineageContractRecord[];
}

export interface LineageGraphExtras {
  /** Roots of billing-linked chains, minus the primary chain and duplicates. */
  additionalHierarchies: LineageTreeNode[];
  /** Records backing the additional trees' node meta; primary chain wins ties. */
  additionalContracts: LineageContractRecord[];
  /** Billing edges whose endpoints both exist in the merged graph. */
  billingEdges: BillingLineageEdge[];
}

function collectTreeIds(node: LineageTreeNode | null, into: Set<string>): void {
  if (!node) return;
  into.add(node.id.toString());
  (node.children ?? []).forEach((child) => collectTreeIds(child, into));
}

/**
 * Merge billing-linked chains into graph extras for the lineage map.
 *
 * A linked chain rooted inside the primary chain IS the primary chain
 * (`getAmendmentChain` always resolves the topmost root), so it is skipped;
 * so are chains already added via another billing link. Billing edges are
 * deduplicated and dropped unless both endpoints survived — an edge into an
 * ACL-pruned chain must not dangle.
 */
export function buildLineageGraphExtras(
  primary: LineageChain,
  linkedChains: LineageChain[],
  billingLinks: BillingLineageEdge[],
): LineageGraphExtras {
  const nodeIds = new Set<string>();
  collectTreeIds(primary.completeHierarchy, nodeIds);

  const additionalHierarchies: LineageTreeNode[] = [];
  const additionalContracts: LineageContractRecord[] = [];

  for (const chain of linkedChains) {
    const root = chain.completeHierarchy;
    if (!root || nodeIds.has(root.id.toString())) continue;

    additionalHierarchies.push(root);
    const before = new Set(nodeIds);
    collectTreeIds(root, nodeIds);
    additionalContracts.push(
      ...chain.allContractsInHierarchy.filter(
        (contract) => !before.has(contract.id.toString()),
      ),
    );
  }

  const seenEdges = new Set<string>();
  const billingEdges = billingLinks.filter((edge) => {
    const key = `${edge.source}->${edge.target}`;
    if (seenEdges.has(key)) return false;
    seenEdges.add(key);
    return (
      nodeIds.has(edge.source.toString()) && nodeIds.has(edge.target.toString())
    );
  });

  return { additionalHierarchies, additionalContracts, billingEdges };
}

/**
 * Whether the lineage view has anything to show: a hierarchy with children,
 * or at least one billing edge. Gates the Lineage tab and its FTUX intro —
 * a lone root with no billing links renders an empty map, so no tab.
 */
export function hasLineageContent(
  completeHierarchy: LineageTreeNode | null | undefined,
  billingEdges: BillingLineageEdge[] | undefined,
): boolean {
  return (
    (completeHierarchy?.children?.length ?? 0) > 0 ||
    (billingEdges?.length ?? 0) > 0
  );
}
