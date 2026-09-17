/**
 * PSK-1975 data run: populate contract_owners from the ownership statements
 * that exist today, then (separately, with a person's sign-off) remove the
 * cost allocations the ACL backfill invented from read shares and folder
 * shares. Rules and provenance: docs/psk-1975-facts.md; the pure planner is
 * scripts/lib/psk-1975-owners.ts.
 *
 * Idempotent: a contract that already carries an owner row is skipped, and a
 * second --delete run deletes nothing. Never a migration.
 *
 *   npx tsx scripts/psk-1975-populate-owners.ts --env .env.dev --org <uuid> --dry-run
 *   npx tsx scripts/psk-1975-populate-owners.ts --env .env.dev --org <uuid>
 *   npx tsx scripts/psk-1975-populate-owners.ts --env .env.dev --org <uuid> --confirm-owner-tab 123,456
 *   npx tsx scripts/psk-1975-populate-owners.ts --env .env.dev --org <uuid> --delete --dry-run
 *   npx tsx scripts/psk-1975-populate-owners.ts --env .env.dev --org <uuid> --delete
 *
 * --confirm-owner-tab lists allocation ids the dry run reported as Owner-tab
 * saves made after #2145; only listed ids are converted to owner rows (and
 * deleted in the --delete phase). Without --org every organization is run.
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import Redis from 'ioredis';
import { config } from 'dotenv';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/database.types';
import { isOrgUnitLevel, type OrgUnitNode } from '@/lib/v2/org-units';
import { matchSponsorNames } from '@/lib/v2/owners/match';
import { clientFromEnv, fetchAllRows } from './lib/backfill-cli';
import {
  OWNER_TAB_WINDOW_START,
  planDeletions,
  planOwnerRun,
  type AllocationRow,
  type OwnerRunInput,
  type OwnerRunPlan,
} from './lib/psk-1975-owners';

type Client = SupabaseClient<Database>;

const PROVENANCE_DIR = path.join('docs', 'archive', 'psk-1975-provenance');
const INSERT_BATCH = 500;

interface Args {
  org: string | null;
  envPath: string;
  dryRun: boolean;
  deletePhase: boolean;
  confirmedOwnerTab: Set<number>;
}

export function parseArgs(args: string[]): Args {
  const parsed: Args = {
    org: null,
    envPath: '.env.local',
    dryRun: false,
    deletePhase: false,
    confirmedOwnerTab: new Set(),
  };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (flag === '--delete') {
      parsed.deletePhase = true;
      continue;
    }
    if (
      flag !== '--org' &&
      flag !== '--env' &&
      flag !== '--confirm-owner-tab'
    ) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    const value = args[++i];
    if (!value || value.startsWith('--')) {
      throw new Error(`${flag} requires a value`);
    }
    if (flag === '--org') parsed.org = value;
    else if (flag === '--env') parsed.envPath = value;
    else {
      for (const id of value.split(',')) {
        const parsedId = Number(id.trim());
        if (!Number.isInteger(parsedId) || parsedId <= 0) {
          throw new Error(`--confirm-owner-tab: not an allocation id: ${id}`);
        }
        parsed.confirmedOwnerTab.add(parsedId);
      }
    }
  }
  return parsed;
}

async function loadOrgInput(
  client: Client,
  organizationId: string,
  confirmedOwnerTab: Set<number>,
): Promise<Omit<OwnerRunInput, 'mintUnitId'>> {
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
    owned,
    allocationRows,
    updates,
    users,
    employees,
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
      scoped(
        client.from('contracts').select('id, business_group, business_sponsor'),
      )
        .order('id')
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      scoped(
        client.from('contract_acl_group').select('contract_id, group_id, perm'),
      )
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
          .from('contract_owners')
          .select(
            'contract_id, role, user_id, org_employee_id, label, org_unit_id',
          ),
      )
        .order('id')
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      scoped(
        client
          .from('contract_cost_allocations')
          .select(
            'id, contract_id, product_id, mode, created_by, updated_by, updated_at, created_at, contract_cost_allocation_lines ( org_unit_id, org_employee_id, percent )',
          ),
      )
        .order('id')
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      scoped(client.from('audit_log').select('resource_id, timestamp'))
        .eq('resource_type', 'contracts')
        .eq('action', 'UPDATE')
        .gte('timestamp', OWNER_TAB_WINDOW_START)
        .order('id')
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      scoped(client.from('users').select('id, name, email'))
        .order('id')
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      scoped(
        client.from('org_employees').select('id, first_name, last_name, email'),
      )
        .is('deleted_at', null)
        .order('id')
        .range(from, to),
    ),
  ]);

  const units: OrgUnitNode[] = unitRows.map((row) => {
    if (!isOrgUnitLevel(row.level)) {
      throw new Error(
        `Unknown org unit level "${row.level}" on org unit ${row.id}`,
      );
    }
    return { ...row, level: row.level };
  });
  const allocations: AllocationRow[] = allocationRows.map(
    ({ contract_cost_allocation_lines, ...allocation }) => ({
      ...allocation,
      lines: contract_cost_allocation_lines,
    }),
  );
  const catalog = {
    users,
    employees: employees.map((e) => ({
      id: e.id,
      firstName: e.first_name,
      lastName: e.last_name,
      email: e.email,
    })),
  };

  return {
    groups,
    units,
    contracts,
    contractAclGroups,
    folderContracts,
    folderAclGroups,
    existingOwners: owned,
    allocations,
    contractUpdates: updates.flatMap((row) => {
      const contractId = Number(row.resource_id);
      return Number.isInteger(contractId)
        ? [{ contractId, timestamp: row.timestamp }]
        : [];
    }),
    confirmedOwnerTabAllocationIds: confirmedOwnerTab,
    matchSponsors: (names) => matchSponsorNames(names, catalog),
  };
}

function printPlan(organizationId: string, plan: OwnerRunPlan): void {
  const groupRows = plan.rows.filter((r) => r.role === 'group').length;
  const sponsorRows = plan.rows.filter((r) => r.role === 'sponsor').length;
  console.log(
    `- ${organizationId}: units +${plan.createdUnits.length}, owner rows +${plan.rows.length} (${groupRows} group, ${sponsorRows} sponsor)`,
  );
  const bySource = new Map<string, number>();
  for (const source of plan.groupSources.values()) {
    bySource.set(source, (bySource.get(source) ?? 0) + 1);
  }
  console.log(
    `  group source: ${[...bySource].map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`,
  );
  const s = plan.sponsorStats;
  console.log(
    `  sponsors: ${s.contractsWithSponsors} contracts → users ${s.users}, employees ${s.employees}, labels ${s.labels}`,
  );
  console.log(
    `  census of backfilled contracts: ${(
      Object.keys(plan.census) as Array<keyof typeof plan.census>
    )
      .map((bucket) => `${bucket} ${plan.census[bucket].length}`)
      .join(', ')}`,
  );
  for (const bucket of ['read-only', 'folder-only', 'unshared'] as const) {
    if (plan.census[bucket].length > 0) {
      console.log(
        `    ${bucket} → Unassigned: contracts ${plan.census[bucket].join(', ')}`,
      );
    }
  }
  for (const candidate of plan.ownerTabCandidates) {
    console.log(
      `  Owner-tab candidate: allocation ${candidate.allocationId} (contract ${candidate.contractId}, nodes ${candidate.nodeIds.join('+')}, created ${candidate.createdAt}) → ${candidate.verdict}${candidate.pairedUpdateAt ? ` (contracts UPDATE at ${candidate.pairedUpdateAt})` : ''}`,
    );
  }
  if (plan.mergedContracts.length > 0) {
    console.log(
      `  merged onto existing owner rows (saved since deploy): contracts ${plan.mergedContracts.join(', ')}`,
    );
  }
  if (plan.skippedUnconfirmed.length > 0) {
    console.log(
      `  SKIPPED (Owner-tab candidate not in --confirm-owner-tab): contracts ${plan.skippedUnconfirmed.join(', ')}`,
    );
  }
}

async function writePlan(
  client: Client,
  organizationId: string,
  plan: OwnerRunPlan,
): Promise<void> {
  const realUnitId = new Map<number, number>();
  if (plan.createdUnits.length > 0) {
    const { data, error } = await client
      .from('org_units')
      .insert(
        plan.createdUnits.map((unit) => ({
          organization_id: organizationId,
          level: unit.level,
          name: unit.name,
          parent_id: null,
        })),
      )
      .select('id, name');
    if (error) throw error;
    const idByName = new Map((data ?? []).map((row) => [row.name, row.id]));
    for (const unit of plan.createdUnits) {
      const id = idByName.get(unit.name);
      if (id === undefined) {
        throw new Error(`org unit missing after insert: ${unit.name}`);
      }
      realUnitId.set(unit.id, id);
    }
  }

  const inserts = plan.rows.map((row) => ({
    organization_id: organizationId,
    contract_id: row.contractId,
    role: row.role,
    user_id:
      row.role === 'sponsor' && row.ref.kind === 'user' ? row.ref.id : null,
    org_employee_id:
      row.role === 'sponsor' && row.ref.kind === 'employee' ? row.ref.id : null,
    label:
      row.role === 'sponsor' && row.ref.kind === 'label' ? row.ref.name : null,
    org_unit_id:
      row.role === 'group'
        ? (realUnitId.get(row.orgUnitId) ?? row.orgUnitId)
        : null,
  }));
  for (let i = 0; i < inserts.length; i += INSERT_BATCH) {
    const { error } = await client
      .from('contract_owners')
      .insert(inserts.slice(i, i + INSERT_BATCH));
    if (error) throw error;
  }
}

async function deleteAllocations(
  client: Client,
  organizationId: string,
  input: Omit<OwnerRunInput, 'mintUnitId'>,
  dryRun: boolean,
): Promise<void> {
  const plan = planDeletions(input);
  console.log(
    `- ${organizationId}: delete ${plan.deletable.length} allocation(s) (${plan.deletable.filter((d) => d.reason === 'backfill').length} backfill, ${plan.deletable.filter((d) => d.reason === 'owner-tab').length} confirmed Owner-tab), keep ${plan.drifted.length} drifted${dryRun ? ' (dry run)' : ''}`,
  );
  for (const {
    allocation,
    storedNodeIds,
    derivedNodeIds,
    reason,
  } of plan.drifted) {
    const detail =
      reason === 'hand-edited'
        ? `edited in the Cost Allocation tab by ${allocation.updated_by} at ${allocation.updated_at}`
        : reason === 'nodes-differ'
          ? `stored nodes ${storedNodeIds.join('+') || 'none'} vs backfill-from-today ${derivedNodeIds.join('+') || 'none'}`
          : reason === 'product-scope'
            ? `product-scoped (product ${allocation.product_id}), not a backfill shape`
            : 'has employee lines, not a backfill shape';
    console.log(
      `  KEEP allocation ${allocation.id} (contract ${allocation.contract_id}): ${detail} — a person decides`,
    );
  }
  const folderOnly = new Set(
    planOwnerRun({ ...input, mintUnitId: () => -1 }).census['folder-only'],
  );
  for (const { allocation, reason } of plan.deletable) {
    const note = folderOnly.has(allocation.contract_id)
      ? ' (folder-only: allocation removed, no owner)'
      : '';
    console.log(
      `  delete allocation ${allocation.id} (contract ${allocation.contract_id}, ${reason}, nodes ${allocation.lines.map((l) => l.org_unit_id).join('+')})${note}`,
    );
  }
  if (dryRun || plan.deletable.length === 0) return;

  mkdirSync(PROVENANCE_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dumpPath = path.join(
    PROVENANCE_DIR,
    `deleted-allocations-${organizationId}-${stamp}.json`,
  );
  writeFileSync(
    dumpPath,
    JSON.stringify(
      {
        organizationId,
        deletedAt: new Date().toISOString(),
        allocations: plan.deletable.map(({ allocation, reason }) => ({
          reason,
          ...allocation,
        })),
        keptDrifted: plan.drifted,
      },
      null,
      2,
    ),
  );
  console.log(`  dumped ${plan.deletable.length} row(s) to ${dumpPath}`);

  const { error } = await client
    .from('contract_cost_allocations')
    .delete()
    .eq('organization_id', organizationId)
    .in(
      'id',
      plan.deletable.map(({ allocation }) => allocation.id),
    );
  if (error) throw error;
}

/**
 * The contract set is cached for an hour per user; owners ride inside it, so
 * a populated org would read blank until then. Same key pattern as
 * RedisService.clearOrganizationCache.
 */
async function clearOrgCache(envPath: string, organizationId: string) {
  const env: Record<string, string> = {};
  config({ path: envPath, processEnv: env });
  const url = env.ELASTICACHE_REDIS_URL;
  if (!url) {
    console.log(
      `  ! no ELASTICACHE_REDIS_URL in ${envPath}: clear the org's contract cache by hand or wait out the TTL`,
    );
    return;
  }
  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    tls:
      env.ENV && env.ENV !== 'local'
        ? { rejectUnauthorized: false }
        : undefined,
  });
  try {
    await redis.connect();
    let cleared = 0;
    const stream = redis.scanStream({
      match: `*org:${organizationId}:*`,
      count: 500,
    });
    for await (const batch of stream as AsyncIterable<string[]>) {
      if (batch.length === 0) continue;
      cleared += await redis.del(...batch);
    }
    console.log(`  cache: cleared ${cleared} key(s)`);
  } catch (error) {
    console.log(
      `  ! cache clear failed (${error instanceof Error ? error.message : String(error)}): clear the org's contract cache by hand or wait out the TTL`,
    );
  } finally {
    redis.disconnect();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = clientFromEnv(args.envPath);
  const orgIds = args.org
    ? [args.org]
    : (
        await fetchAllRows((from, to) =>
          client.from('organizations').select('id').order('id').range(from, to),
        )
      ).map((row) => row.id);

  for (const organizationId of orgIds) {
    const input = await loadOrgInput(
      client,
      organizationId,
      args.confirmedOwnerTab,
    );
    if (args.deletePhase) {
      await deleteAllocations(client, organizationId, input, args.dryRun);
      continue;
    }
    let minted = 0;
    const plan = planOwnerRun({ ...input, mintUnitId: () => --minted });
    printPlan(organizationId, plan);
    if (args.dryRun || plan.rows.length === 0) continue;
    await writePlan(client, organizationId, plan);
    await clearOrgCache(args.envPath, organizationId);
  }
  console.log(`Done.${args.dryRun ? ' (dry run: nothing written)' : ''}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
