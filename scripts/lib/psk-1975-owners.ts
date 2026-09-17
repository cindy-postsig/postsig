import type { Json } from '@/database.types';
import { deriveLegacyGroupBackfill } from '@/lib/v2/cost-allocation/legacy-backfill';
import { normalizeBusinessGroupName } from '@/lib/v2/org-units/business-groups';
import type { OrgUnitNode } from '@/lib/v2/org-units/tree';
import type { OwnerSponsorRef } from '@/lib/v2/owners/types';

/**
 * The pure half of scripts/psk-1975-populate-owners.ts: what to write to
 * contract_owners and what to delete from contract_cost_allocations, derived
 * from one org's rows. Every rule here comes from docs/psk-1975-facts.md.
 */

/** #2145 reached prod on the evening of 2026-08-26; the Owner tab has written allocations since. */
export const OWNER_TAB_WINDOW_START = '2026-08-26T18:00:00.000Z';
/** The Owner tab's Save updates the contracts row a second or two before it writes the allocation. */
export const OWNER_TAB_PAIRING_WINDOW_MS = 30_000;

export interface AllocationRow {
  id: number;
  contract_id: number;
  product_id: number | null;
  mode: string;
  created_by: string | null;
  /** Set by a Cost Allocation tab edit; a backfilled row that carries it was touched by hand. */
  updated_by: string | null;
  updated_at: string | null;
  created_at: string;
  lines: Array<{
    org_unit_id: number | null;
    org_employee_id: number | null;
    percent: number;
  }>;
}

export interface OwnerRunInput {
  groups: Array<{ id: number; name: string }>;
  units: OrgUnitNode[];
  contracts: Array<{
    id: number;
    business_group: string | null;
    business_sponsor: Json | null;
  }>;
  contractAclGroups: Array<{
    contract_id: number;
    group_id: number;
    perm: string;
  }>;
  folderContracts: Array<{ contract_id: number; folder_id: number }>;
  folderAclGroups: Array<{ folder_id: number; group_id: number }>;
  /** Rows already in contract_owners; the run adds only what is missing. */
  existingOwners: ExistingOwnerRow[];
  allocations: AllocationRow[];
  /** audit_log rows: resource_type 'contracts', action 'UPDATE', since the window start. */
  contractUpdates: Array<{ contractId: number; timestamp: string }>;
  /** Allocation ids a person confirmed as Owner-tab saves after reading the dry run. */
  confirmedOwnerTabAllocationIds: ReadonlySet<number>;
  matchSponsors: (names: string[]) => OwnerSponsorRef[];
  mintUnitId: () => number;
}

export interface ExistingOwnerRow {
  contract_id: number;
  role: string;
  user_id: string | null;
  org_employee_id: number | null;
  label: string | null;
  org_unit_id: number | null;
}

function existingOwnerKey(row: ExistingOwnerRow): string | null {
  if (row.org_unit_id !== null) return `group:${row.org_unit_id}`;
  if (row.user_id !== null) return `user:${row.user_id}`;
  if (row.org_employee_id !== null) return `employee:${row.org_employee_id}`;
  if (row.label !== null) return `label:${row.label.trim().toLowerCase()}`;
  return null;
}

export type OwnerRow =
  | { contractId: number; role: 'group'; orgUnitId: number }
  | { contractId: number; role: 'sponsor'; ref: OwnerSponsorRef };

export type GroupSource = 'owner-tab' | 'write-acl' | 'scalar' | 'none';

export interface OwnerTabCandidate {
  allocationId: number;
  contractId: number;
  nodeIds: number[];
  createdAt: string;
  pairedUpdateAt: string | null;
  verdict: 'owner-tab' | 'unpaired';
}

export type CensusBucket =
  | 'write-acl'
  | 'scalar'
  | 'read-only'
  | 'folder-only'
  | 'unshared';

export interface OwnerRunPlan {
  createdUnits: OrgUnitNode[];
  rows: OwnerRow[];
  groupSources: Map<number, GroupSource>;
  ownerTabCandidates: OwnerTabCandidate[];
  /** Contracts left untouched because their Owner-tab candidate was not confirmed. */
  skippedUnconfirmed: number[];
  /** Contracts that already had owner rows (an Owner-tab save since deploy) and gained more. */
  mergedContracts: number[];
  /** Backfilled contracts (created_by null) by what the run found for them. */
  census: Record<CensusBucket, number[]>;
  sponsorStats: {
    contractsWithSponsors: number;
    users: number;
    employees: number;
    labels: number;
  };
}

export interface DeletePlan {
  deletable: Array<{
    allocation: AllocationRow;
    reason: 'backfill' | 'owner-tab';
  }>;
  drifted: Array<{
    allocation: AllocationRow;
    storedNodeIds: number[];
    derivedNodeIds: number[];
    reason: DriftReason;
  }>;
}

/** Why a backfilled allocation is kept: it is no longer what the backfill would write today. */
export type DriftReason =
  | 'hand-edited'
  | 'nodes-differ'
  | 'product-scope'
  | 'employee-lines';

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
const sortedIds = (ids: readonly number[]) => unique(ids).sort((a, b) => a - b);
const sameIds = (a: readonly number[], b: readonly number[]) => {
  const x = sortedIds(a);
  const y = sortedIds(b);
  return x.length === y.length && x.every((id, i) => id === y[i]);
};

/** Mirrors the engine's tolerant read of the column: array of strings, a string, or `{ name }`. */
export function sponsorNamesOf(value: Json | null | undefined): string[] {
  const nameOf = (entry: Json): string | null => {
    if (typeof entry === 'string') return entry.trim() || null;
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      const name = entry.name;
      return typeof name === 'string' ? name.trim() || null : null;
    }
    return null;
  };
  const entries: Json[] = Array.isArray(value)
    ? value
    : value === null || value === undefined
      ? []
      : [value];
  return unique(entries.map(nameOf).filter((n): n is string => n !== null));
}

export function isOwnerTabShaped(
  allocation: AllocationRow,
  unitsById: ReadonlyMap<number, OrgUnitNode>,
): boolean {
  if (
    allocation.created_by === null ||
    allocation.product_id !== null ||
    allocation.mode !== 'manual' ||
    allocation.lines.length === 0
  ) {
    return false;
  }
  const percent = allocation.lines[0].percent;
  return allocation.lines.every(
    (line) =>
      line.org_employee_id === null &&
      line.org_unit_id !== null &&
      unitsById.get(line.org_unit_id)?.level === 'business_group' &&
      line.percent === percent,
  );
}

export function classifyOwnerTabCandidates(
  input: Pick<OwnerRunInput, 'allocations' | 'units' | 'contractUpdates'>,
): OwnerTabCandidate[] {
  const unitsById = new Map(input.units.map((unit) => [unit.id, unit]));
  const updatesByContract = new Map<number, number[]>();
  for (const update of input.contractUpdates) {
    const list = updatesByContract.get(update.contractId) ?? [];
    list.push(Date.parse(update.timestamp));
    updatesByContract.set(update.contractId, list);
  }
  const windowStart = Date.parse(OWNER_TAB_WINDOW_START);
  const candidates: OwnerTabCandidate[] = [];
  for (const allocation of input.allocations) {
    const createdAt = Date.parse(allocation.created_at);
    if (createdAt < windowStart || !isOwnerTabShaped(allocation, unitsById)) {
      continue;
    }
    const paired = (updatesByContract.get(allocation.contract_id) ?? [])
      .filter(
        (at) =>
          at <= createdAt && createdAt - at <= OWNER_TAB_PAIRING_WINDOW_MS,
      )
      .sort((a, b) => b - a)[0];
    candidates.push({
      allocationId: allocation.id,
      contractId: allocation.contract_id,
      nodeIds: sortedIds(
        allocation.lines.map((line) => line.org_unit_id as number),
      ),
      createdAt: allocation.created_at,
      pairedUpdateAt:
        paired === undefined ? null : new Date(paired).toISOString(),
      verdict: paired === undefined ? 'unpaired' : 'owner-tab',
    });
  }
  return candidates.sort((a, b) => a.allocationId - b.allocationId);
}

export function planOwnerRun(input: OwnerRunInput): OwnerRunPlan {
  const createdUnits: OrgUnitNode[] = [];
  const nodeByNorm = new Map<string, OrgUnitNode>();
  for (const unit of input.units) {
    if (unit.level !== 'business_group') continue;
    const norm = normalizeBusinessGroupName(unit.name);
    const existing = nodeByNorm.get(norm);
    if (!existing || unit.id < existing.id) nodeByNorm.set(norm, unit);
  }
  const nodeFor = (name: string): number => {
    const norm = normalizeBusinessGroupName(name);
    const existing = nodeByNorm.get(norm);
    if (existing) return existing.id;
    const node: OrgUnitNode = {
      id: input.mintUnitId(),
      level: 'business_group',
      name: name.trim(),
      parent_id: null,
    };
    createdUnits.push(node);
    nodeByNorm.set(norm, node);
    return node.id;
  };

  const groupNameById = new Map(input.groups.map((g) => [g.id, g.name]));
  const aclByContract = new Map<number, OwnerRunInput['contractAclGroups']>();
  for (const acl of input.contractAclGroups) {
    const list = aclByContract.get(acl.contract_id) ?? [];
    list.push(acl);
    aclByContract.set(acl.contract_id, list);
  }
  const sharedFolderIds = new Set(
    input.folderAclGroups.map((f) => f.folder_id),
  );
  const folderSharedContracts = new Set(
    input.folderContracts
      .filter((fc) => sharedFolderIds.has(fc.folder_id))
      .map((fc) => fc.contract_id),
  );

  const ownerTabCandidates = classifyOwnerTabCandidates(input);
  const candidateByContract = new Map<number, OwnerTabCandidate>();
  for (const candidate of ownerTabCandidates) {
    if (candidate.verdict === 'owner-tab') {
      candidateByContract.set(candidate.contractId, candidate);
    }
  }

  const rows: OwnerRow[] = [];
  const groupSources = new Map<number, GroupSource>();
  const skippedUnconfirmed: number[] = [];
  const mergedContracts: number[] = [];
  const labelCasing = new Map<string, string>();
  const existingByContract = new Map<number, Set<string>>();
  for (const row of input.existingOwners) {
    const key = existingOwnerKey(row);
    if (key === null) continue;
    const keys = existingByContract.get(row.contract_id) ?? new Set<string>();
    keys.add(key);
    existingByContract.set(row.contract_id, keys);
    if (row.label !== null) {
      labelCasing.set(row.label.trim().toLowerCase(), row.label.trim());
    }
  }
  const sponsorStats = {
    contractsWithSponsors: 0,
    users: 0,
    employees: 0,
    labels: 0,
  };

  for (const contract of input.contracts) {
    const existing = existingByContract.get(contract.id) ?? new Set<string>();
    let added = 0;

    const candidate = candidateByContract.get(contract.id);
    if (
      candidate &&
      !input.confirmedOwnerTabAllocationIds.has(candidate.allocationId)
    ) {
      skippedUnconfirmed.push(contract.id);
      continue;
    }

    let nodeIds: number[] = [];
    let source: GroupSource = 'none';
    if (candidate) {
      nodeIds = candidate.nodeIds;
      source = 'owner-tab';
    } else {
      const writeGroupNames = (aclByContract.get(contract.id) ?? [])
        .filter((acl) => acl.perm === 'write')
        .map((acl) => groupNameById.get(acl.group_id))
        .filter((name): name is string => name !== undefined);
      if (writeGroupNames.length > 0) {
        nodeIds = unique(writeGroupNames.map(nodeFor));
        source = 'write-acl';
      } else if (contract.business_group?.trim()) {
        nodeIds = [nodeFor(contract.business_group)];
        source = 'scalar';
      }
    }
    groupSources.set(contract.id, source);
    for (const orgUnitId of nodeIds) {
      if (existing.has(`group:${orgUnitId}`)) continue;
      rows.push({ contractId: contract.id, role: 'group', orgUnitId });
      added += 1;
    }

    const names = sponsorNamesOf(contract.business_sponsor);
    if (names.length > 0) sponsorStats.contractsWithSponsors += 1;
    const seen = new Set<string>(existing);
    for (const ref of input.matchSponsors(names)) {
      let canonical: OwnerSponsorRef = ref;
      if (ref.kind === 'label') {
        const key = ref.name.trim().toLowerCase();
        if (!key) continue;
        const casing = labelCasing.get(key) ?? ref.name.trim();
        labelCasing.set(key, casing);
        canonical = { kind: 'label', name: casing };
      }
      const identity =
        canonical.kind === 'label'
          ? `label:${canonical.name.toLowerCase()}`
          : `${canonical.kind}:${canonical.id}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      sponsorStats[
        canonical.kind === 'user'
          ? 'users'
          : canonical.kind === 'employee'
            ? 'employees'
            : 'labels'
      ] += 1;
      rows.push({ contractId: contract.id, role: 'sponsor', ref: canonical });
      added += 1;
    }
    if (existing.size > 0 && added > 0) mergedContracts.push(contract.id);
  }

  const census: Record<CensusBucket, number[]> = {
    'write-acl': [],
    scalar: [],
    'read-only': [],
    'folder-only': [],
    unshared: [],
  };
  const backfilledContractIds = unique(
    input.allocations
      .filter((a) => a.created_by === null)
      .map((a) => a.contract_id),
  ).sort((a, b) => a - b);
  const contractById = new Map(input.contracts.map((c) => [c.id, c]));
  for (const contractId of backfilledContractIds) {
    const acl = aclByContract.get(contractId) ?? [];
    const contract = contractById.get(contractId);
    const bucket: CensusBucket = acl.some((a) => a.perm === 'write')
      ? 'write-acl'
      : contract?.business_group?.trim()
        ? 'scalar'
        : acl.length > 0
          ? 'read-only'
          : folderSharedContracts.has(contractId)
            ? 'folder-only'
            : 'unshared';
    census[bucket].push(contractId);
  }

  return {
    createdUnits,
    rows,
    groupSources,
    ownerTabCandidates,
    skippedUnconfirmed,
    mergedContracts,
    census,
    sponsorStats,
  };
}

/**
 * The drift check: an allocation with created_by null is deleted only when
 * the backfill's own oracle, fed today's ACL rows, reproduces its node set
 * exactly. Anything else is kept and reported for a person to decide.
 */
export function planDeletions(
  input: Pick<
    OwnerRunInput,
    | 'groups'
    | 'units'
    | 'contracts'
    | 'contractAclGroups'
    | 'folderContracts'
    | 'folderAclGroups'
    | 'allocations'
    | 'confirmedOwnerTabAllocationIds'
  >,
): DeletePlan {
  let minted = 0;
  const oracle = deriveLegacyGroupBackfill({
    groups: input.groups,
    units: input.units,
    contracts: input.contracts.map(({ id, business_group }) => ({
      id,
      business_group,
    })),
    contractAclGroups: input.contractAclGroups.map(
      ({ contract_id, group_id }) => ({ contract_id, group_id }),
    ),
    folderContracts: input.folderContracts,
    folderAclGroups: input.folderAclGroups,
    allocatedContractIds: new Set(),
    mintUnitId: () => --minted,
  });
  const derivedByContract = new Map(
    oracle.allocations.map((a) => [
      a.contractId,
      sortedIds(a.lines.map((line) => line.orgUnitId)),
    ]),
  );

  const plan: DeletePlan = { deletable: [], drifted: [] };
  for (const allocation of [...input.allocations].sort((a, b) => a.id - b.id)) {
    if (input.confirmedOwnerTabAllocationIds.has(allocation.id)) {
      plan.deletable.push({ allocation, reason: 'owner-tab' });
      continue;
    }
    if (allocation.created_by !== null) continue;
    const storedNodeIds = sortedIds(
      allocation.lines
        .map((line) => line.org_unit_id)
        .filter((id): id is number => id !== null),
    );
    const derivedNodeIds = derivedByContract.get(allocation.contract_id) ?? [];
    const reason: DriftReason | null =
      allocation.updated_by !== null
        ? 'hand-edited'
        : allocation.product_id !== null
          ? 'product-scope'
          : allocation.lines.some((line) => line.org_employee_id !== null)
            ? 'employee-lines'
            : sameIds(storedNodeIds, derivedNodeIds)
              ? null
              : 'nodes-differ';
    if (reason === null) {
      plan.deletable.push({ allocation, reason: 'backfill' });
    } else {
      plan.drifted.push({ allocation, storedNodeIds, derivedNodeIds, reason });
    }
  }
  return plan;
}
