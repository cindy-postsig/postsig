/**
 * ACL -> cost allocation backfill (PSK-1846 phase 3): snapshot today's
 * spend-by-business-group derivation into whole-contract manual allocations,
 * so the monthly report does not change when the engine's group dimension
 * flips to allocations. The derivation is deriveLegacyGroupBackfill — the one
 * the backfill equality gate judges against the legacy output.
 *
 * Idempotent and re-runnable: nodes are created only where no same-named node
 * exists, and contracts that already carry an allocation with lines are
 * skipped. The header and its lines are two requests (no transaction here),
 * so a header left without lines by a failed run is reused on the next run
 * rather than counted as done. ACL rows themselves are untouched — existing
 * shares keep granting access.
 *
 *   npx tsx scripts/backfill-cost-allocation-acl.ts --dry-run
 *   npx tsx scripts/backfill-cost-allocation-acl.ts --org <uuid>
 *   npx tsx scripts/backfill-cost-allocation-acl.ts --env .env.prod
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/database.types';
import { isOrgUnitLevel, type OrgUnitNode } from '@/lib/v2/org-units';
import {
  deriveLegacyGroupBackfill,
  type LegacyGroupBackfillInput,
} from '@/lib/v2/cost-allocation/legacy-backfill';
import {
  clientFromEnv,
  fetchAllRows,
  parseBackfillArgs,
} from './lib/backfill-cli';

type Client = SupabaseClient<Database>;

export interface ExistingAllocationRow {
  id: number;
  contract_id: number;
  /** Any line at all: the embed is only read for presence. */
  contract_cost_allocation_lines: Array<{ id: number }>;
}

/**
 * Contracts holding an allocation with lines are done; a header without
 * lines is a failed earlier write, kept so its id can be reused.
 */
export function classifyExistingAllocations(rows: ExistingAllocationRow[]): {
  allocatedContractIds: Set<number>;
  emptyHeaderIdByContract: Map<number, number>;
} {
  const allocatedContractIds = new Set<number>();
  const emptyHeaderIdByContract = new Map<number, number>();
  for (const row of rows) {
    if (row.contract_cost_allocation_lines.length > 0) {
      allocatedContractIds.add(row.contract_id);
    } else {
      emptyHeaderIdByContract.set(row.contract_id, row.id);
    }
  }
  for (const contractId of allocatedContractIds) {
    emptyHeaderIdByContract.delete(contractId);
  }
  return { allocatedContractIds, emptyHeaderIdByContract };
}

async function loadOrgInput(
  client: Client,
  organizationId: string,
): Promise<
  Omit<LegacyGroupBackfillInput, 'mintUnitId'> & {
    emptyHeaderIdByContract: Map<number, number>;
  }
> {
  const scoped = <T extends { eq: (column: string, value: string) => T }>(
    query: T,
  ) => query.eq('organization_id', organizationId);

  const [
    groups,
    unitRows,
    contracts,
    contractAclGroups,
    folderContracts,
    folderAclGroups,
    allocated,
  ] = await Promise.all([
    fetchAllRows((from, to) =>
      scoped(client.from('groups').select('id, name'))
        .order('id')
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      scoped(client.from('org_units').select('id, level, name, parent_id'))
        .order('id')
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      scoped(client.from('contracts').select('id, business_group'))
        .order('id')
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      scoped(client.from('contract_acl_group').select('contract_id, group_id'))
        .order('contract_id')
        .order('group_id')
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      scoped(client.from('folder_contracts').select('contract_id, folder_id'))
        .order('contract_id')
        .order('folder_id')
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      scoped(client.from('folder_acl_group').select('folder_id, group_id'))
        .order('folder_id')
        .order('group_id')
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      scoped(
        client
          .from('contract_cost_allocations')
          .select('id, contract_id, contract_cost_allocation_lines ( id )'),
      )
        .order('id')
        .range(from, to),
    ),
  ]);

  const units: OrgUnitNode[] = [];
  for (const row of unitRows) {
    if (!isOrgUnitLevel(row.level)) {
      throw new Error(
        `Unknown org unit level "${row.level}" on org unit ${row.id}`,
      );
    }
    units.push({ ...row, level: row.level });
  }

  return {
    groups,
    units,
    contracts,
    contractAclGroups,
    folderContracts,
    folderAclGroups,
    ...classifyExistingAllocations(allocated),
  };
}

async function backfillOrg(
  client: Client,
  organizationId: string,
  dryRun: boolean,
): Promise<void> {
  const { emptyHeaderIdByContract, ...input } = await loadOrgInput(
    client,
    organizationId,
  );
  // Minted ids are placeholders (negative, so they can never collide with a
  // real node); the insert below maps them to the ids Postgres assigns.
  let minted = 0;
  const { createdUnits, allocations } = deriveLegacyGroupBackfill({
    ...input,
    mintUnitId: () => --minted,
  });
  const lineCount = allocations.reduce((sum, a) => sum + a.lines.length, 0);
  const reused = allocations.filter((a) =>
    emptyHeaderIdByContract.has(a.contractId),
  ).length;
  console.log(
    `- ${organizationId}: units +${createdUnits.length}, allocations +${allocations.length} (${lineCount} lines${reused > 0 ? `, ${reused} reusing a line-less header` : ''})${dryRun ? ' (dry run)' : ''}`,
  );
  if (dryRun || (createdUnits.length === 0 && allocations.length === 0)) return;

  const realUnitId = new Map<number, number>();
  if (createdUnits.length > 0) {
    const { data, error } = await client
      .from('org_units')
      .insert(
        createdUnits.map((unit) => ({
          organization_id: organizationId,
          level: unit.level,
          name: unit.name,
          parent_id: null,
        })),
      )
      .select('id, name');
    if (error) throw error;
    // Created names are distinct after normalization, so the name is the key.
    const idByName = new Map((data ?? []).map((row) => [row.name, row.id]));
    for (const unit of createdUnits) {
      const id = idByName.get(unit.name);
      if (id === undefined)
        throw new Error(`org unit missing after insert: ${unit.name}`);
      realUnitId.set(unit.id, id);
    }
  }

  for (const allocation of allocations) {
    let allocationId = emptyHeaderIdByContract.get(allocation.contractId);
    if (allocationId === undefined) {
      const { data, error } = await client
        .from('contract_cost_allocations')
        .insert({
          organization_id: organizationId,
          contract_id: allocation.contractId,
          product_id: null,
          mode: 'manual',
        })
        .select('id')
        .single();
      if (error) throw error;
      allocationId = data.id;
    }
    const { error: lineError } = await client
      .from('contract_cost_allocation_lines')
      .insert(
        allocation.lines.map((line) => ({
          organization_id: organizationId,
          allocation_id: allocationId,
          org_unit_id: realUnitId.get(line.orgUnitId) ?? line.orgUnitId,
          org_employee_id: null,
          percent: line.percent,
        })),
      );
    if (lineError) throw lineError;
  }
}

async function main() {
  const { org, envPath, dryRun } = parseBackfillArgs(process.argv.slice(2));
  const client = clientFromEnv(envPath);

  const orgIds = org
    ? [org]
    : (
        await fetchAllRows((from, to) =>
          client.from('organizations').select('id').order('id').range(from, to),
        )
      ).map((row) => row.id);

  for (const organizationId of orgIds) {
    await backfillOrg(client, organizationId, dryRun);
  }
  console.log(`Done.${dryRun ? ' (dry run: nothing written)' : ''}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
