import { buildAllocationContext } from '@/lib/v2/cost-allocation/context';
import { resolveAllocations } from '@/lib/v2/cost-allocation/resolver';
import type {
  AllocationLineRow,
  AllocationRow,
} from '@/lib/v2/cost-allocation/types';
import { deriveLegacyGroupBackfill } from '@/lib/v2/cost-allocation/legacy-backfill';
import type { SpendAllocationInput } from '@/lib/v2/spend';

interface RawAclGroup {
  groups?: { id: number; name: string } | null;
}

/** The legacy group surface of a fixture contract row, as the base select shaped it. */
export interface LegacyRawContract {
  id: number;
  business_group?: string | null;
  contract_acl_group?: RawAclGroup[] | null;
  folder_contracts?: Array<{
    folders?: { folder_acl_group?: RawAclGroup[] | null } | null;
  }> | null;
}

/**
 * Feeds fixture contracts through the SAME backfill derivation the migration
 * runs (deriveLegacyGroupBackfill — the shared TS mirror of the SQL), then
 * through the real resolver, producing the allocation input the engine and
 * the monthly-report transform take. The golden harness and the backfill
 * equality gates both build their allocations here, so the goldens pin the
 * derivation the migration will apply.
 */
export function allocationsFromLegacyFixture(
  rawContracts: LegacyRawContract[],
): SpendAllocationInput {
  const groupsById = new Map<number, { id: number; name: string }>();
  const contractAclGroups: Array<{ contract_id: number; group_id: number }> =
    [];
  const folderContracts: Array<{ contract_id: number; folder_id: number }> = [];
  const folderAclGroups: Array<{ folder_id: number; group_id: number }> = [];

  let folderSeq = 1;
  for (const contract of rawContracts) {
    for (const acl of contract.contract_acl_group ?? []) {
      if (!acl.groups) continue;
      groupsById.set(acl.groups.id, acl.groups);
      contractAclGroups.push({
        contract_id: contract.id,
        group_id: acl.groups.id,
      });
    }
    for (const link of contract.folder_contracts ?? []) {
      const folderId = folderSeq++;
      folderContracts.push({ contract_id: contract.id, folder_id: folderId });
      for (const acl of link.folders?.folder_acl_group ?? []) {
        if (!acl.groups) continue;
        groupsById.set(acl.groups.id, acl.groups);
        folderAclGroups.push({ folder_id: folderId, group_id: acl.groups.id });
      }
    }
  }

  let unitSeq = 1;
  const derived = deriveLegacyGroupBackfill({
    groups: [...groupsById.values()],
    units: [],
    contracts: rawContracts.map((contract) => ({
      id: contract.id,
      business_group: contract.business_group ?? null,
    })),
    contractAclGroups,
    folderContracts,
    folderAclGroups,
    allocatedContractIds: new Set(),
    mintUnitId: () => unitSeq++,
  });

  let allocationSeq = 1;
  let lineSeq = 1;
  const allocations: AllocationRow[] = [];
  const lines: AllocationLineRow[] = [];
  for (const allocation of derived.allocations) {
    const id = allocationSeq++;
    allocations.push({
      id,
      contract_id: allocation.contractId,
      product_id: null,
      mode: 'manual',
    });
    for (const line of allocation.lines) {
      lines.push({
        id: lineSeq++,
        allocation_id: id,
        org_unit_id: line.orgUnitId,
        org_employee_id: null,
        percent: line.percent,
      });
    }
  }

  const ctx = buildAllocationContext({
    allocations,
    lines,
    units: derived.createdUnits,
    employees: [],
    seats: [],
    relationships: [],
  });
  return {
    resolved: resolveAllocations(rawContracts, ctx),
    unitsById: ctx.unitsById,
  };
}
