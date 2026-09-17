import { normalizeBusinessGroupName } from '@/lib/v2/org-units/business-groups';
import type { OrgUnitNode } from '@/lib/v2/org-units/tree';
import { equalSplitPercent } from './percent';

/**
 * The ACL -> cost allocation backfill derivation, run per org by
 * scripts/backfill-cost-allocation-acl.ts. The backfill equality gate derives
 * its fixture allocations through THIS function, so a rule change here is
 * re-judged against the legacy output. Written as a step-for-step mirror of
 * the original SQL (whose comments survive below as the step labels).
 */

/** Relational rows exactly as the migration reads them, one org at a time. */
export interface LegacyGroupBackfillInput {
  groups: Array<{ id: number; name: string }>;
  /** Existing org_units (any level; only business_group nodes participate). */
  units: OrgUnitNode[];
  contracts: Array<{ id: number; business_group: string | null }>;
  contractAclGroups: Array<{ contract_id: number; group_id: number }>;
  folderContracts: Array<{ contract_id: number; folder_id: number }>;
  folderAclGroups: Array<{ folder_id: number; group_id: number }>;
  /** Contracts that already carry any allocation row (skipped: idempotence). */
  allocatedContractIds: ReadonlySet<number>;
  mintUnitId: () => number;
}

export interface LegacyGroupBackfillResult {
  /** business_group root nodes the backfill had to create. */
  createdUnits: OrgUnitNode[];
  /** One whole-contract manual allocation per resolved contract, lines by node id. */
  allocations: Array<{
    contractId: number;
    lines: Array<{ orgUnitId: number; percent: number }>;
  }>;
}

export function deriveLegacyGroupBackfill(
  input: LegacyGroupBackfillInput,
): LegacyGroupBackfillResult {
  const createdUnits: OrgUnitNode[] = [];

  // Node lookup by normalized name (matchBusinessGroups' matching), lowest id
  // winning when path identity holds two same-named nodes.
  const nodeByNorm = new Map<string, OrgUnitNode>();
  const indexNode = (unit: OrgUnitNode) => {
    if (unit.level !== 'business_group') return;
    const norm = normalizeBusinessGroupName(unit.name);
    const existing = nodeByNorm.get(norm);
    if (!existing || unit.id < existing.id) nodeByNorm.set(norm, unit);
  };
  for (const unit of input.units) indexNode(unit);

  const createRootNode = (name: string): OrgUnitNode => {
    const node: OrgUnitNode = {
      id: input.mintUnitId(),
      level: 'business_group',
      name: name.trim(),
      parent_id: null,
    };
    createdUnits.push(node);
    indexNode(node);
    return node;
  };

  // Step 1: a business_group node per groups row — ACL-only groups included,
  // since that is what their monthly report shows today. Distinct on the
  // normalized name, the lowest group id's spelling surviving; whitespace-only
  // names mint nothing (they could never match a node). Creation runs in
  // normalized-name order because the SQL's DISTINCT ON forces that ordering,
  // and the minted ids order each allocation's lines — which places the odd
  // cent.
  const survivorNameByNorm = new Map<string, string>();
  for (const group of [...input.groups].sort((a, b) => a.id - b.id)) {
    const norm = normalizeBusinessGroupName(group.name);
    if (norm === '' || survivorNameByNorm.has(norm)) continue;
    survivorNameByNorm.set(norm, group.name);
  }
  for (const norm of [...survivorNameByNorm.keys()].sort()) {
    if (!nodeByNorm.has(norm)) {
      createRootNode(survivorNameByNorm.get(norm) as string);
    }
  }

  // The legacy set, the SAME one-hop derivation extractBusinessGroups uses:
  // direct contract_acl_group plus the contract's own folders'
  // folder_acl_group via folder_contracts — never the ltree ancestor walk.
  const groupsById = new Map(input.groups.map((group) => [group.id, group]));
  const foldersByContract = new Map<number, number[]>();
  for (const row of input.folderContracts) {
    const folders = foldersByContract.get(row.contract_id) ?? [];
    folders.push(row.folder_id);
    foldersByContract.set(row.contract_id, folders);
  }
  const groupsByFolder = new Map<number, number[]>();
  for (const row of input.folderAclGroups) {
    const groups = groupsByFolder.get(row.folder_id) ?? [];
    groups.push(row.group_id);
    groupsByFolder.set(row.folder_id, groups);
  }
  const directByContract = new Map<number, number[]>();
  for (const row of input.contractAclGroups) {
    const groups = directByContract.get(row.contract_id) ?? [];
    groups.push(row.group_id);
    directByContract.set(row.contract_id, groups);
  }

  const legacyGroupIds = (contractId: number): Set<number> => {
    const ids = new Set<number>(directByContract.get(contractId) ?? []);
    for (const folderId of foldersByContract.get(contractId) ?? []) {
      for (const groupId of groupsByFolder.get(folderId) ?? [])
        ids.add(groupId);
    }
    return ids;
  };

  const allocations: LegacyGroupBackfillResult['allocations'] = [];
  for (const contract of [...input.contracts].sort((a, b) => a.id - b.id)) {
    if (input.allocatedContractIds.has(contract.id)) continue;

    // ACL-derived nodes; two same-named groups collapse onto one node.
    const aclGroupIds = legacyGroupIds(contract.id);
    const nodeIds = new Set<number>();
    for (const groupId of aclGroupIds) {
      const group = groupsById.get(groupId);
      if (!group) continue;
      const node = nodeByNorm.get(normalizeBusinessGroupName(group.name));
      if (node) nodeIds.add(node.id);
    }

    // Step 2: the contracts.business_group scalar only when the ACL SET is
    // empty (parseGroups' precedence: any ACL group suppressed the scalar,
    // resolvable to a node or not) — node by name, created if missing.
    // Expect few; the Owner tab has been nulling the column.
    if (aclGroupIds.size === 0) {
      const scalar = contract.business_group?.trim();
      if (scalar) {
        const norm = normalizeBusinessGroupName(scalar);
        const node = nodeByNorm.get(norm) ?? createRootNode(scalar);
        nodeIds.add(node.id);
      }
    }

    // Step 3: one whole-contract manual allocation at truncated-equal
    // percents (equalSplitPercent — the SQL floors the same way), lines in
    // node-id order. Nothing resolved → no row: the contract stays in the
    // engine's unassigned bucket.
    if (nodeIds.size === 0) continue;
    const ordered = [...nodeIds].sort((a, b) => a - b);
    const percent = equalSplitPercent(ordered.length);
    allocations.push({
      contractId: contract.id,
      lines: ordered.map((orgUnitId) => ({ orgUnitId, percent })),
    });
  }

  return { createdUnits, allocations };
}
