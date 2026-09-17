import { createClient } from '@/utils/supabase/service_server';
import { fetchAllRelationshipsForOrg } from '@/data/superuser/contracts';
import { isHierarchyEdge } from '@/lib/contracts/relationshipEdges';
import { isInvoiceType, reverseContractTypeMap } from '@/app/lib/constants';
import { sanitizeOrderNumber } from '@/lib/v2/contracts/orderNumber';
import logger from '@/utils/pino';

export interface NonInvoiceDescendant {
  id: number;
  typeName: string;
}

export interface ArchiveDescendants {
  invoiceDescendantIds: number[];
  nonInvoiceDescendants: NonInvoiceDescendant[];
}

export interface ReactivatableChild {
  id: number;
  typeName: string;
  label: string;
}

/**
 * Coerce a request-supplied list of contract ids to finite numbers, dropping
 * anything non-numeric.
 */
export function normalizeContractIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => Number(id)).filter((id) => Number.isFinite(id));
}

/**
 * Collect all descendant contract ids of `rootIds` by walking the (live) parent
 * -> child edges. Cycle-safe via a visited set; the roots themselves are excluded.
 */
function collectDescendantIds(
  rootIds: number[],
  childrenByParent: Map<number, number[]>,
): number[] {
  const roots = new Set(rootIds);
  const visited = new Set<number>();
  const queue = [...rootIds];

  while (queue.length > 0) {
    const parentId = queue.shift() as number;
    for (const childId of childrenByParent.get(parentId) ?? []) {
      if (visited.has(childId) || roots.has(childId)) continue;
      visited.add(childId);
      queue.push(childId);
    }
  }

  return [...visited];
}

/**
 * All descendant contract ids of `rootIds` (any depth) across the org's live
 * relationship graph. Roots are excluded; cycle-safe.
 */
async function getDescendantIds(
  organizationId: string,
  rootIds: number[],
): Promise<number[]> {
  if (rootIds.length === 0) return [];

  const relationships = await fetchAllRelationshipsForOrg(organizationId);

  const childrenByParent = new Map<number, number[]>();
  for (const rel of relationships) {
    if (rel.parent_contract_id == null || rel.child_contract_id == null) {
      continue;
    }
    // Archiving is state-mutating and invoice descendants are cascaded without
    // user opt-in, so a billing parent must never pull an invoice it does not
    // structurally own into the archive set.
    if (!isHierarchyEdge(rel)) continue;
    const children = childrenByParent.get(rel.parent_contract_id) ?? [];
    children.push(rel.child_contract_id);
    childrenByParent.set(rel.parent_contract_id, children);
  }

  return collectDescendantIds(rootIds, childrenByParent);
}

/**
 * Resolve the descendants that archiving `rootIds` should touch, partitioned by
 * whether they are invoices. Invoice descendants (at any depth, including those
 * nested under a non-invoice child) are always archived; non-invoice descendants
 * are only archived when the user opts in.
 */
export async function resolveArchiveDescendants(
  organizationId: string,
  rootIds: number[],
): Promise<ArchiveDescendants> {
  const descendantIds = await getDescendantIds(organizationId, rootIds);
  if (descendantIds.length === 0) {
    return { invoiceDescendantIds: [], nonInvoiceDescendants: [] };
  }

  // Only descendants that are not already archived are relevant — an
  // already-inactive child would be a no-op to archive and must not appear in
  // the non-invoice confirmation prompt.
  const supabase = createClient();
  const { data, error } = await supabase
    .from('contracts')
    .select('id, type_id')
    .in('id', descendantIds)
    .neq('status', 'inactive');

  if (error) {
    logger.error(
      { error, organizationId, rootIds },
      'Error resolving archive descendants',
    );
    throw error;
  }

  const invoiceDescendantIds: number[] = [];
  const nonInvoiceDescendants: NonInvoiceDescendant[] = [];

  for (const contract of data ?? []) {
    if (isInvoiceType(contract.type_id)) {
      invoiceDescendantIds.push(contract.id);
    } else {
      nonInvoiceDescendants.push({
        id: contract.id,
        typeName: typeNameFor(contract.type_id, null),
      });
    }
  }

  return { invoiceDescendantIds, nonInvoiceDescendants };
}

type JoinedName = { name: string | null } | { name: string | null }[] | null;

interface InactiveDescendantRow {
  id: number;
  type_id: number | null;
  metadata: { lineage?: { order_number?: unknown } } | null;
  vendors: JoinedName;
  contract_types: JoinedName;
}

function joinedName(value: JoinedName): string | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0]?.name ?? null) : value.name;
}

function typeNameFor(
  typeId: number | null,
  contractTypeName: string | null,
): string {
  return (
    contractTypeName ||
    (typeId != null && reverseContractTypeMap[typeId]) ||
    'Contract'
  );
}

/**
 * Resolve the currently-archived (status `inactive`) descendants of `rootIds`,
 * with a human label, so the user can pick which to reactivate alongside the
 * parent. Includes invoice and non-invoice descendants at any depth.
 */
export async function resolveInactiveDescendants(
  organizationId: string,
  rootIds: number[],
): Promise<ReactivatableChild[]> {
  const descendantIds = await getDescendantIds(organizationId, rootIds);
  if (descendantIds.length === 0) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('contracts')
    .select('id, type_id, metadata, vendors ( name ), contract_types ( name )')
    .in('id', descendantIds)
    .eq('status', 'inactive');

  if (error) {
    logger.error(
      { error, organizationId, rootIds },
      'Error resolving inactive descendants',
    );
    throw error;
  }

  const rows = (data ?? []) as unknown as InactiveDescendantRow[];

  return rows.map((row) => {
    const typeName = typeNameFor(row.type_id, joinedName(row.contract_types));
    const label = [
      joinedName(row.vendors),
      typeName,
      sanitizeOrderNumber(row.metadata?.lineage?.order_number),
    ]
      .filter(Boolean)
      .join(' · ');
    return { id: row.id, typeName, label };
  });
}

/**
 * Build the de-duplicated set of contract ids to archive: the roots, all invoice
 * descendants, and — only when `includeNonInvoice` is true — the non-invoice
 * descendants.
 */
export function buildArchiveIdSet(
  rootIds: number[],
  invoiceDescendantIds: number[],
  nonInvoiceDescendantIds: number[],
  includeNonInvoice: boolean,
): number[] {
  const ids = new Set<number>([...rootIds, ...invoiceDescendantIds]);
  if (includeNonInvoice) {
    for (const id of nonInvoiceDescendantIds) ids.add(id);
  }
  return [...ids];
}
