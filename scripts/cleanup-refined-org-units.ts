/**
 * Refinement-identity cleanup (PSK-1846): nodes forked before the sync walk
 * learned refinement identity — a shallower "Research under Markets" beside
 * the real "Research under Markets → Equities" — are duplicates of the same
 * target. This deletes the inert ones and only REPORTS anything heavier:
 * a ghost carrying allocation lines, budgets, or children is left untouched
 * and printed, so merge machinery is built only if such a ghost ever shows
 * up (none is expected — allocations have not launched past staging).
 *
 * Employees still pointing at a ghost leaf are re-pointed to the survivor
 * first: that is exactly what the next roster sync would do, and it makes
 * the ghost deletable now instead of after the next weekly upload.
 *
 * --include-root-ghosts also folds in parentless duplicates: an org whose HR
 * file fills Entity for some people and not others forked one business group
 * per import order before the walk taught the walk to match a root step. It is
 * opt-in because a parentless node can also be a deliberate clear, and nothing
 * stored tells the two apart — read the dry run before passing it.
 *
 *   npx tsx scripts/cleanup-refined-org-units.ts --dry-run
 *   npx tsx scripts/cleanup-refined-org-units.ts --org <uuid>
 *   npx tsx scripts/cleanup-refined-org-units.ts --env .env.prod
 *   npx tsx scripts/cleanup-refined-org-units.ts --dry-run --include-root-ghosts
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/database.types';
import { isOrgUnitLevel } from '@/lib/v2/org-units';
import {
  deriveRefinedNodeMerges,
  type RefinementNode,
} from '@/lib/v2/org-units/refinement';
import {
  clientFromEnv,
  fetchAllRows,
  parseBackfillArgs,
} from './lib/backfill-cli';

type Client = SupabaseClient<Database>;

export interface GhostUsage {
  employees: number;
  allocationLines: number;
  budgets: number;
  children: number;
}

/**
 * Employees never block deletion (they are re-pointed, the sync's own
 * semantics); anything financial or structural does.
 */
export function isDeletableGhost(usage: GhostUsage): boolean {
  return (
    usage.allocationLines === 0 && usage.budgets === 0 && usage.children === 0
  );
}

async function countByUnit(
  client: Client,
  table: 'contract_cost_allocation_lines' | 'cost_allocation_budgets',
  organizationId: string,
  unitIds: number[],
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  const rows = await fetchAllRows((from, to) =>
    client
      .from(table)
      .select('org_unit_id')
      .eq('organization_id', organizationId)
      .in('org_unit_id', unitIds)
      .range(from, to),
  );
  for (const row of rows) {
    if (row.org_unit_id === null) continue;
    counts.set(row.org_unit_id, (counts.get(row.org_unit_id) ?? 0) + 1);
  }
  return counts;
}

async function cleanupOrg(
  client: Client,
  organizationId: string,
  dryRun: boolean,
  includeRootGhosts: boolean,
): Promise<void> {
  const unitRows = await fetchAllRows((from, to) =>
    client
      .from('org_units')
      .select('id, level, name, parent_id')
      .eq('organization_id', organizationId)
      .order('id')
      .range(from, to),
  );
  const units: RefinementNode[] = unitRows.map((row) => {
    if (!isOrgUnitLevel(row.level)) {
      throw new Error(`Unknown org unit level "${row.level}" on ${row.id}`);
    }
    return {
      id: row.id,
      level: row.level,
      name: row.name,
      parent_id: row.parent_id,
    };
  });

  const merges = deriveRefinedNodeMerges(units, includeRootGhosts);
  if (merges.length === 0) return;

  const ghostIds = merges.map((merge) => merge.ghostId);
  const [lineCounts, budgetCounts, employeeRows] = await Promise.all([
    countByUnit(
      client,
      'contract_cost_allocation_lines',
      organizationId,
      ghostIds,
    ),
    countByUnit(client, 'cost_allocation_budgets', organizationId, ghostIds),
    fetchAllRows((from, to) =>
      client
        .from('org_employees')
        .select('id, org_unit_id')
        .eq('organization_id', organizationId)
        .in('org_unit_id', ghostIds)
        .range(from, to),
    ),
  ]);
  const employeeCounts = new Map<number, number>();
  for (const row of employeeRows) {
    if (row.org_unit_id === null) continue;
    employeeCounts.set(
      row.org_unit_id,
      (employeeCounts.get(row.org_unit_id) ?? 0) + 1,
    );
  }
  const childCounts = new Map<number, number>();
  for (const unit of units) {
    if (unit.parent_id === null) continue;
    childCounts.set(unit.parent_id, (childCounts.get(unit.parent_id) ?? 0) + 1);
  }

  const nameOf = (id: number) => {
    const unit = units.find((candidate) => candidate.id === id);
    return unit ? `${unit.level} "${unit.name}" (${id})` : `${id}`;
  };

  for (const { ghostId, survivorId } of merges) {
    const usage: GhostUsage = {
      employees: employeeCounts.get(ghostId) ?? 0,
      allocationLines: lineCounts.get(ghostId) ?? 0,
      budgets: budgetCounts.get(ghostId) ?? 0,
      children: childCounts.get(ghostId) ?? 0,
    };
    if (!isDeletableGhost(usage)) {
      console.log(
        `- ${organizationId}: KEPT ${nameOf(ghostId)} → ${nameOf(survivorId)}: ` +
          `${usage.allocationLines} allocation lines, ${usage.budgets} budgets, ` +
          `${usage.children} children — needs a decision, not this script`,
      );
      continue;
    }
    console.log(
      `- ${organizationId}: delete ${nameOf(ghostId)} → ${nameOf(survivorId)}` +
        `${usage.employees > 0 ? ` (re-pointing ${usage.employees} employees)` : ''}` +
        `${dryRun ? ' (dry run)' : ''}`,
    );
    if (dryRun) continue;

    // The snapshot above is not transactional (this codebase has no
    // transaction primitive; PostgREST requests are independent). The FKs
    // already hard-block a stale delete that would touch data: allocation
    // lines and budgets are RESTRICT, employees NO ACTION. The one cascade
    // risk is a child created since the snapshot (parent_id is ON DELETE
    // CASCADE), so re-check right before acting to shrink that window to
    // the single delete request.
    const [lineRecheck, budgetRecheck, childRecheck] = await Promise.all([
      countByUnit(client, 'contract_cost_allocation_lines', organizationId, [
        ghostId,
      ]),
      countByUnit(client, 'cost_allocation_budgets', organizationId, [ghostId]),
      fetchAllRows((from, to) =>
        client
          .from('org_units')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('parent_id', ghostId)
          .range(from, to),
      ),
    ]);
    if (
      (lineRecheck.get(ghostId) ?? 0) > 0 ||
      (budgetRecheck.get(ghostId) ?? 0) > 0 ||
      childRecheck.length > 0
    ) {
      console.log(
        `- ${organizationId}: KEPT ${nameOf(ghostId)} — usage appeared since the snapshot; re-run to reassess`,
      );
      continue;
    }

    if (usage.employees > 0) {
      const { error } = await client
        .from('org_employees')
        .update({ org_unit_id: survivorId })
        .eq('organization_id', organizationId)
        .eq('org_unit_id', ghostId);
      if (error) throw error;
    }
    const { error } = await client
      .from('org_units')
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', ghostId);
    if (error) throw error;
  }
}

async function main(): Promise<void> {
  // Stripped before delegating: the shared parser rejects flags it does not
  // know, and it is shared with a script that has no use for this one.
  const argv = process.argv.slice(2);
  const includeRootGhosts = argv.includes('--include-root-ghosts');
  const { org, envPath, dryRun } = parseBackfillArgs(
    argv.filter((flag) => flag !== '--include-root-ghosts'),
  );
  const client = clientFromEnv(envPath);
  const organizationIds = org
    ? [org]
    : (
        await fetchAllRows((from, to) =>
          client.from('organizations').select('id').order('id').range(from, to),
        )
      ).map((row) => row.id);
  for (const organizationId of organizationIds) {
    await cleanupOrg(client, organizationId, dryRun, includeRootGhosts);
  }
  console.log(`Done.${dryRun ? ' (dry run: nothing written)' : ''}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
