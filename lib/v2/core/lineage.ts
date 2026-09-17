/**
 * Lineage Enrichment Functions
 *
 * Handles contract hierarchy relationships - which contracts are parents/children,
 * which products are superseded by amendments, etc.
 */

import {
  buildContractHierarchyMap,
  findTopmostParentWithProduct,
  findDeepestChildWithProduct,
  type HierarchyMap,
} from '@/lib/inventory/hierarchyUtils';
import {
  ContractWithLineage,
  InheritedCancelByDate,
  ProductWithLineage,
  EnrichedProduct,
} from './types';
import { format, isValid, parseISO, sub } from 'date-fns';
import _ from 'lodash';
import { isInvoiceType, isServiceOrderType } from '@/app/lib/constants';
import { isHierarchyEdge } from '@/lib/contracts/relationshipEdges';

/** Master Service Agreement contract type ID */
const CONTRACT_TYPE_MSA = 1;

/**
 * Derive a service order's cancel-by date from its direct MSA parent.
 *
 * Service orders rarely restate the notice period their MSA already sets, so
 * they otherwise show no cancel-by date at all. What carries down is the MSA's
 * notice period, NOT its resolved date: the notice counts back from the service
 * order's own term end, and the two terms usually differ. Copying the MSA's
 * date instead would place the deadline after the service order has expired.
 *
 * Returns null unless every condition holds - the service order must have no
 * cancel-by date and no notice period of its own (its own terms win), its
 * direct parent must be an MSA carrying a notice period, and it must have a
 * term end to count back from.
 */
export function deriveCancelByDateFromParent(
  contract: any,
  parent: any,
): InheritedCancelByDate | null {
  if (!isServiceOrderType(contract?.type_id)) return null;
  if (contract.cancel_date?.[0]?.date) return null;
  if (contract.cancel_by_date != null && contract.cancel_by_date !== '') {
    return null;
  }

  if (parent?.type_id !== CONTRACT_TYPE_MSA) return null;

  // Number(null) and Number('') are both 0, which would silently resolve to the
  // term end date itself rather than reporting "no notice period recorded"
  if (parent.cancel_by_date == null || parent.cancel_by_date === '')
    return null;

  const noticeDays = Number(parent.cancel_by_date);
  if (!Number.isFinite(noticeDays) || noticeDays < 0) return null;

  const termEnd = contract.term_end_date?.[0]?.date;
  if (!termEnd) return null;

  const parsedTermEnd = parseISO(termEnd);
  if (!isValid(parsedTermEnd)) return null;

  return {
    date: format(sub(parsedTermEnd, { days: noticeDays }), 'yyyy-MM-dd'),
    noticeDays,
    sourceContractId: parent.id,
  };
}

/**
 * Explains an inherited cancel-by date wherever one is shown.
 * Single source of the copy so the surfaces cannot drift apart.
 */
export function formatInheritedCancelByTooltip(noticeDays: number): string {
  return `Inherited from the linked MSA's ${noticeDays}-day notice period, counted back from this contract's end date.`;
}

/** Hierarchy-map wrapper around {@link deriveCancelByDateFromParent}. */
export function resolveInheritedCancelByDate(
  contract: any,
  hierarchyMap: HierarchyMap,
  contractsMap: Map<number, any>,
): InheritedCancelByDate | null {
  const parentId = hierarchyMap.parents.get(contract.id);
  if (parentId === undefined) return null;

  return deriveCancelByDateFromParent(contract, contractsMap.get(parentId));
}

/**
 * Enrich contracts with lineage information.
 * Adds sourceContractId, isSuperseded to each product.
 */
export function enrichWithLineage(
  contracts: any[],
  relationships: any[],
): ContractWithLineage[] {
  const hierarchyMap = buildContractHierarchyMap(contracts, relationships);
  const contractsMap = new Map(contracts.map((c) => [c.id, c]));

  const enrichedContracts: ContractWithLineage[] = [];

  for (const contract of contracts) {
    const isInvoice = isInvoiceType(contract.type_id);

    // Group product details by product_id
    const productDetailsMap = new Map<number, any[]>();
    contract.vendor_products_details?.forEach((vpd: any) => {
      const productId = vpd.product_id || vpd.vendor_products?.id;
      if (!productId) return;

      if (!productDetailsMap.has(productId)) {
        productDetailsMap.set(productId, []);
      }
      productDetailsMap.get(productId)!.push(vpd);
    });

    // Enrich each product with lineage
    const enrichedProducts: ProductWithLineage[] = [];

    for (const [productId, details] of productDetailsMap) {
      // Find source contract (topmost with this product)
      const topmostWithProduct = findTopmostParentWithProduct(
        contract.id,
        productId,
        hierarchyMap,
        contractsMap,
      );
      const sourceContractId = topmostWithProduct?.id || contract.id;

      // Check if superseded (is there a deeper child with this product?)
      // Invoices don't supersede - they're just records of bills
      const deepestChild = findDeepestChildWithProduct(
        contract.id,
        productId,
        hierarchyMap,
        contractsMap,
      );
      const deepestChildIsInvoice = isInvoiceType(
        deepestChild?.contract.type_id,
      );
      const isSuperseded =
        !isInvoice &&
        deepestChild !== null &&
        deepestChild.contract.id !== contract.id &&
        !deepestChildIsInvoice;
      const supersededByContractId = isSuperseded
        ? deepestChild!.contract.id
        : undefined;

      // Check if this product supersedes a parent's product
      // True if the product originally comes from another contract
      // Invoices don't supersede — they're billing records, not amendments
      const isSuperseding = !isInvoice && sourceContractId !== contract.id;
      const supersedesProductInContractId = isSuperseding
        ? sourceContractId
        : undefined;

      // Get product name
      const productName =
        details[0]?.vendor_products?.name || 'Unknown Product';

      // An invoice may bill the same product on several lines in one year
      // and this map keys on product_id alone, so taking details[0]
      // would silently drop every line after the first. Sum within the year
      // details[0] reports instead — the multi-year case still reads the first
      // year's row, exactly as before.
      const firstYear = details[0]?.year || 1;
      const fees = isInvoice
        ? details
            .filter((detail) => (detail.year || 1) === firstYear)
            .reduce((sum, detail) => sum + (detail.fees || 0), 0)
        : details[0]?.fees || 0;

      enrichedProducts.push({
        product_id: productId,
        name: productName,
        fees,
        year: firstYear,
        one_time_only: details[0]?.one_time_only ?? false,
        sort_order: details[0]?.sort_order ?? null,
        sourceContractId,
        isSuperseded,
        supersededByContractId,
        isSuperseding,
        supersedesProductInContractId,
      });
    }

    // Check if this is a linked child invoice (with a parent)
    const hasParent = hierarchyMap.parents.has(contract.id);
    const isLinkedChildInvoice = isInvoice && hasParent;
    // An invoice counts toward overall spend only when a reviewer says so
    // Everything else always counts.
    const excludedFromOverallSpend =
      isInvoice && contract.apply_to_overall_spend !== true;

    enrichedContracts.push({
      id: contract.id,
      vendor_id: contract.vendor_id,
      vendor_name: contract.vendors?.name || 'Unknown Vendor',
      vendor_domain: contract.vendors?.domain,
      contract,
      products: enrichedProducts,
      isLinkedChildInvoice,
      excludedFromOverallSpend,
      inheritedCancelByDate: resolveInheritedCancelByDate(
        contract,
        hierarchyMap,
        contractsMap,
      ),
    });
  }

  deduplicateSiblingProducts(enrichedContracts, hierarchyMap, contractsMap);

  return enrichedContracts;
}

/**
 * Ensure each product_id is non-superseded in exactly one contract per family.
 * When multiple sibling amendments override the same product in a parent,
 * only the deepest/latest one wins. Others are marked as superseded.
 */
function deduplicateSiblingProducts(
  enrichedContracts: ContractWithLineage[],
  hierarchyMap: HierarchyMap,
  contractsMap: Map<number, any>,
): void {
  const families = new Map<
    string,
    { contractId: number; product: ProductWithLineage }[]
  >();

  for (const ec of enrichedContracts) {
    for (const product of ec.products) {
      const key = `${product.product_id}-${product.sourceContractId}`;
      if (!families.has(key)) {
        families.set(key, []);
      }
      families.get(key)!.push({ contractId: ec.id, product });
    }
  }

  for (const members of families.values()) {
    const nonSuperseded = members.filter((m) => !m.product.isSuperseded);
    if (nonSuperseded.length <= 1) continue;

    const { product_id: productId, sourceContractId } = members[0].product;
    const deepestChild = findDeepestChildWithProduct(
      sourceContractId,
      productId,
      hierarchyMap,
      contractsMap,
    );

    const deepestIsInvoice = isInvoiceType(deepestChild?.contract.type_id);
    // If deepest is an invoice (e.g. parent→amendment→invoice), use the
    // invoice's parent (the amendment) rather than falling back to root
    const winnerId = deepestIsInvoice
      ? (hierarchyMap.parents.get(deepestChild!.contract.id) ??
        sourceContractId)
      : (deepestChild?.contract.id ?? sourceContractId);

    for (const member of nonSuperseded) {
      if (member.contractId !== winnerId) {
        const contract = contractsMap.get(member.contractId);
        if (isInvoiceType(contract?.type_id)) continue;

        member.product.isSuperseded = true;
        member.product.supersededByContractId = winnerId;
      }
    }
  }
}

/**
 * Expand a seed set of contract ids to the full connected lineage component(s)
 * they belong to, walking relationship edges in both directions.
 *
 * Needed for scoped price-history fetches: `buildContractHierarchyMap` only
 * keeps edges where BOTH endpoints are loaded, so a subset must contain every
 * contract in the seeds' components or the lineage flags (sourceContractId,
 * supersession) would silently differ from the full-org computation.
 */
export function expandToLineageComponents(
  seedIds: number[],
  relationships: {
    parent_contract_id: number | null;
    child_contract_id: number | null;
    relationship_type?: string | null;
  }[],
): Set<number> {
  const adjacency = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    (adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b);
  };
  for (const rel of relationships) {
    // Must agree with buildContractHierarchyMap on what a component is, per
    // the contract stated above — and that map excludes billing edges.
    if (!isHierarchyEdge(rel)) continue;
    const p = rel.parent_contract_id;
    const c = rel.child_contract_id;
    if (p == null || c == null) continue;
    link(p, c);
    link(c, p);
  }

  const component = new Set<number>();
  const stack = [...seedIds];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (component.has(id)) continue;
    component.add(id);
    for (const neighbor of adjacency.get(id) ?? []) {
      if (!component.has(neighbor)) stack.push(neighbor);
    }
  }
  return component;
}

/**
 * Filter products to one per family (product_id + sourceContractId).
 * Non-superseded products take priority.
 *
 * Uses lineage metadata to deduplicate products across amendment chains.
 */
export function filterToOnePerFamily(
  products: EnrichedProduct[],
): EnrichedProduct[] {
  const productsByFamily = _.groupBy(
    products,
    (p) => `${p.product_id}-${p.sourceContractId}`,
  );
  const result: EnrichedProduct[] = [];

  for (const familyProducts of Object.values(productsByFamily)) {
    const activeProduct = familyProducts.find((p) => !p.isSuperseded);
    result.push(activeProduct || familyProducts[0]);
  }

  return result;
}
