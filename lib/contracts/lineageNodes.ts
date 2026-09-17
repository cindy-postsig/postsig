import { isInvoiceType } from '@/app/lib/constants';
import { sanitizeOrderNumber } from '@/lib/v2/contracts/orderNumber';

/**
 * Shared, pure helpers behind the two lineage views (the contract-details left
 * nav and the lineage graph). Both render the same hierarchy but only receive
 * lean tree nodes (`id`, `children`, type, products, `tos_urls`); the archived
 * flag, local id and document number live on the full contract records in
 * `allContractsInHierarchy`, so both views index those records by id.
 */

/** A contract is archived when its status is `inactive`. */
export function isArchivedStatus(status: unknown): boolean {
  return status === 'inactive';
}

/** Per-node display data resolved from a full contract record. */
export interface LineageNodeMeta {
  /** Sibling-indexed label shared with the left nav, e.g. `SO-1`. */
  localId: string;
  isArchived: boolean;
  /** The number printed on the source document, or null when not extracted. */
  orderNumber: string | null;
  /** Invoices label their document number "Invoice No.", everything else "Contract No.". */
  isInvoice: boolean;
}

/** The subset of a full contract record the lineage views read. */
export interface LineageContractRecord {
  id: number | string;
  localId?: string;
  status?: unknown;
  type_id?: number | null;
  metadata?: unknown;
  [key: string]: unknown;
}

/** Minimal shape of a hierarchy tree node. */
export interface LineageTreeNode {
  id: number | string;
  children?: LineageTreeNode[];
}

function readOrderNumber(metadata: unknown): string | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const lineage = (metadata as { lineage?: unknown }).lineage;
  if (typeof lineage !== 'object' || lineage === null) return null;
  return sanitizeOrderNumber(
    (lineage as { order_number?: unknown }).order_number,
  );
}

/**
 * Index contract records by stringified id so tree nodes (whose ids may be
 * numbers or strings) can be looked up with a single key type.
 */
export function buildLineageNodeMeta(
  contracts: LineageContractRecord[],
): Map<string, LineageNodeMeta> {
  const metaById = new Map<string, LineageNodeMeta>();

  for (const contract of contracts) {
    metaById.set(contract.id.toString(), {
      localId: contract.localId ?? '',
      isArchived: isArchivedStatus(contract.status),
      orderNumber: readOrderNumber(contract.metadata),
      isInvoice: isInvoiceType(contract.type_id),
    });
  }

  return metaById;
}

/**
 * Ids on the path from the tree root down to `targetId`, inclusive. Empty when
 * the target is absent — callers use it to keep the contract being viewed (and
 * its ancestors) on screen even when it is archived.
 */
export function collectPathIds(
  root: LineageTreeNode | null | undefined,
  targetId: number | string | null | undefined,
): Set<string> {
  const path = new Set<string>();
  if (!root || targetId === null || targetId === undefined) return path;

  const target = targetId.toString();

  const walk = (node: LineageTreeNode, trail: string[]): boolean => {
    const nextTrail = [...trail, node.id.toString()];
    if (node.id.toString() === target) {
      nextTrail.forEach((id) => path.add(id));
      return true;
    }
    return (node.children ?? []).some((child) => walk(child, nextTrail));
  };

  walk(root, []);
  return path;
}

/**
 * Ids of archived nodes that can be folded out of the tree entirely — an
 * archived node qualifies only when every descendant is also hideable, so an
 * archived parent with a live child stays put and the child stays reachable.
 * Nodes in `keepIds` are never hidden, and keeping one forces its ancestors
 * visible too.
 */
export function collectHiddenArchivedIds(
  root: LineageTreeNode | null | undefined,
  isArchived: (nodeId: string) => boolean,
  keepIds: Set<string> = new Set(),
): Set<string> {
  const hidden = new Set<string>();
  if (!root) return hidden;

  const walk = (node: LineageTreeNode): boolean => {
    const nodeId = node.id.toString();
    // Every child is walked before deciding on this node, so descendants are
    // counted even when the whole subtree collapses.
    const childrenHideable = (node.children ?? [])
      .map((child) => walk(child))
      .every(Boolean);

    const hideable =
      isArchived(nodeId) && childrenHideable && !keepIds.has(nodeId);
    if (hideable) hidden.add(nodeId);
    return hideable;
  };

  walk(root);
  return hidden;
}

/**
 * Archived siblings sort after active ones. `Array.prototype.sort` is stable, so
 * the hierarchy's chronological ordering survives within each group.
 */
export function orderArchivedLast<T extends LineageTreeNode>(
  nodes: T[],
  isArchived: (nodeId: string) => boolean,
): T[] {
  return [...nodes].sort(
    (a, b) =>
      Number(isArchived(a.id.toString())) - Number(isArchived(b.id.toString())),
  );
}

/**
 * Prunes invoice contracts out of the hierarchy tree and the flat contract
 * list when the org's Invoices module is off. Tree nodes don't carry
 * `type_id` themselves, so invoice-ness is resolved via `allContracts` — the
 * same lookup-by-id pattern `buildLineageNodeMeta` already uses. The contract
 * currently being viewed is never pruned, even if it is itself an invoice —
 * whether that page is reachable at all is a separate, already-gated concern,
 * not something this hierarchy view should decide. Invoices are always leaf
 * nodes, so removing one never orphans a real child. No-op when
 * `invoicesEnabled` is true, so orgs with the module on see no change at all.
 */
export function filterHierarchyForInvoicesAccess<
  T extends LineageTreeNode,
  C extends LineageContractRecord,
>(
  hierarchy: T | null | undefined,
  allContracts: C[],
  invoicesEnabled: boolean,
  currentContractId: number | string,
): { hierarchy: T | null; allContracts: C[] } {
  if (invoicesEnabled) return { hierarchy: hierarchy ?? null, allContracts };

  const currentId = currentContractId.toString();
  const typeById = new Map(
    allContracts.map((c) => [c.id.toString(), c.type_id]),
  );
  const isPrunable = (id: string): boolean =>
    id !== currentId && isInvoiceType(typeById.get(id));

  const prune = (node: T): T | null => {
    if (isPrunable(node.id.toString())) return null;
    const children = (node.children ?? [])
      .map((child) => prune(child as T))
      .filter((child): child is T => child !== null);
    return { ...node, children } as T;
  };

  return {
    hierarchy: hierarchy ? prune(hierarchy) : null,
    allContracts: allContracts.filter((c) => !isPrunable(c.id.toString())),
  };
}
