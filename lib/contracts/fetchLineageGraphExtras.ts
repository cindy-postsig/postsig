import {
  fetchBillingChildrenByUserRoles,
  fetchBillingParentsForContractsByUserRoles,
} from '@/data/superuser/contracts';
import { getAmendmentChain } from '@/lib/v2';
import { isInvoiceType } from '@/app/lib/constants';
import logger from '@/utils/pino';
import type { UserMetadata } from '@/constants/types';
import {
  buildLineageGraphExtras,
  type BillingLineageEdge,
  type LineageChain,
  type LineageGraphExtras,
} from '@/lib/contracts/lineageGraph';

/**
 * Every 'billing' edge touching the tree, as payer -> invoice links: invoices
 * billed under tree contracts, and billing parents of the tree's invoices.
 * Both fetchers are ACL-pruned, so a link never names a hidden contract.
 */
async function fetchBillingLinksForTree(
  treeContracts: Array<{ id: number; [key: string]: unknown }>,
  userMetadata: UserMetadata,
): Promise<BillingLineageEdge[]> {
  const invoiceIds = treeContracts
    .filter((c) => isInvoiceType(c.type_id as number | null | undefined))
    .map((c) => c.id);
  const [childrenByParent, parentsByInvoice] = await Promise.all([
    fetchBillingChildrenByUserRoles({
      parentContractIds: treeContracts.map((c) => c.id),
      userMetadata,
    }),
    fetchBillingParentsForContractsByUserRoles({
      childContractIds: invoiceIds,
      userMetadata,
    }),
  ]);

  return [
    ...Object.entries(childrenByParent).flatMap(([parentId, invoices]) =>
      invoices.map((invoice) => ({
        source: Number(parentId),
        target: invoice.id,
      })),
    ),
    ...Object.entries(parentsByInvoice).flatMap(([invoiceId, parents]) =>
      parents.map((parent) => ({
        source: parent.id,
        target: Number(invoiceId),
      })),
    ),
  ];
}

/**
 * Billing-linked chains + edges for the lineage map, one level out
 * from the primary chain. Linked chains resolve through `getAmendmentChain`
 * (React.cache'd, ACL'd). A failure degrades to no extras rather than a
 * failed page — the lineage view is supplementary to the contract itself.
 */
export async function fetchLineageGraphExtras(
  amendment: LineageChain & { allContractsInHierarchy: Array<{ id: number }> },
  userMetadata: UserMetadata,
  contractId: number,
  invoicesEnabled: boolean,
): Promise<LineageGraphExtras> {
  const empty: LineageGraphExtras = {
    additionalHierarchies: [],
    additionalContracts: [],
    billingEdges: [],
  };
  // Every edge/chain this resolves is invoice-linked by definition (see
  // fetchBillingLinksForTree), so there is nothing to compute once the org's
  // Invoices module is off.
  if (!invoicesEnabled) return empty;
  if (amendment.allContractsInHierarchy.length === 0) return empty;

  try {
    const links = await fetchBillingLinksForTree(
      amendment.allContractsInHierarchy,
      userMetadata,
    );
    if (links.length === 0) return empty;

    const linkedIds = new Set<number>();
    links.forEach((link) => {
      linkedIds.add(link.source);
      linkedIds.add(link.target);
    });

    // Sequential on purpose: many linked ids usually belong to one external
    // chain (an MSA paying dozens of invoices from a single tree), so each
    // resolved chain marks its members covered and the rest skip entirely —
    // a parallel fan-out would fetch the same chain once per member.
    const covered = new Set(amendment.allContractsInHierarchy.map((c) => c.id));
    const chains = [];
    for (const linkedId of linkedIds) {
      if (covered.has(linkedId)) continue;
      const chain = await getAmendmentChain(linkedId);
      chain.allContractsInHierarchy.forEach((c) => covered.add(c.id));
      chains.push(chain);
    }
    return buildLineageGraphExtras(amendment, chains, links);
  } catch (error) {
    logger.error({ error, contractId }, 'Error assembling lineage graph');
    return empty;
  }
}
