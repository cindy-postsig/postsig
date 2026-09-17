import { createClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import {
  ORG_UNIT_TREE_LEVELS,
  isOrgUnitTreeLevel,
  type OrgUnitLevel,
  type OrgUnitTreeLevel,
} from './levels';
import {
  buildRefinementLookup,
  findRefinementMatch,
  type RefinementMatch,
} from './refinement';

export const HIERARCHY_LEVELS_PREFERENCE_KEY = 'employees.hierarchy_levels';

/** PostgREST caps responses at `max_rows` (1000), so large orgs must paginate. */
const DB_PAGE_SIZE = 1000;
/** Keeps `.in('id', ...)` filters within a sane query-string length. */
const ID_CHUNK_SIZE = 500;

type ServiceClient = ReturnType<typeof createClient>;

interface EmployeeTreeRow {
  id: number;
  entity: string | null;
  division: string | null;
  business_unit: string | null;
  department: string | null;
  team: string | null;
  cost_center: string | null;
  group_id: number | null;
  org_unit_id: number | null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function nodeKey(
  parentId: number | null,
  level: OrgUnitLevel,
  name: string,
): string {
  return `${parentId ?? 'root'}\0${level}\0${name}`;
}

/**
 * Ordered tree levels for an org: the `employees.hierarchy_levels` preference
 * when set, else the canonical order filtered to levels with at least one
 * value among non-deleted employees (any status — inactive and on-leave rows
 * still shape the tree).
 */
export async function getOrgHierarchyLevelOrder(
  organizationId: string,
  client: ServiceClient = createClient(),
): Promise<OrgUnitTreeLevel[]> {
  const { data, error } = await client
    .from('org_preferences')
    .select('preference_value')
    .eq('organization_id', organizationId)
    .eq('preference_key', HIERARCHY_LEVELS_PREFERENCE_KEY)
    .maybeSingle();

  if (error) {
    logger.error(
      { error: sanitizeForLogging(error), organizationId },
      'Failed to read hierarchy levels preference',
    );
    throw error;
  }

  const preferenceValue = data?.preference_value;
  if (Array.isArray(preferenceValue)) {
    // Nothing constrains the stored array; a repeated level would nest a node
    // under its own descendant, and the upsert-only walk never repairs that.
    const preferred = [...new Set(preferenceValue.filter(isOrgUnitTreeLevel))];
    if (preferred.length > 0) return preferred;
  }

  // One probe per level, all in flight together: this runs on every tab load
  // and employee write, and no org stores the preference yet.
  const present = await Promise.all(
    ORG_UNIT_TREE_LEVELS.map((level) =>
      isLevelInUse(organizationId, level, client),
    ),
  );
  return ORG_UNIT_TREE_LEVELS.filter((_, index) => present[index]);
}

async function isLevelInUse(
  organizationId: string,
  level: OrgUnitTreeLevel,
  client: ServiceClient,
): Promise<boolean> {
  const column = level === 'business_group' ? 'group_id' : level;
  const employeeProbe = client
    .from('org_employees')
    .select('id')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .not(column, 'is', null)
    .limit(1)
    .maybeSingle();
  if (level !== 'business_group') {
    const { data, error } = await employeeProbe;
    if (error) {
      logger.error(
        { error: sanitizeForLogging(error), organizationId, level },
        'Failed to derive hierarchy levels',
      );
      throw error;
    }
    return data !== null;
  }

  // No text column: post-cutover membership is a node, so an existing
  // business_group node marks the level in use; the legacy group_id probe
  // covers orgs whose first sync has not yet minted nodes.
  const [node, employee] = await Promise.all([
    client
      .from('org_units')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('level', 'business_group')
      .limit(1)
      .maybeSingle(),
    employeeProbe,
  ]);
  const error = node.error ?? employee.error;
  if (error) {
    logger.error(
      { error: sanitizeForLogging(error), organizationId, level },
      'Failed to derive hierarchy levels',
    );
    throw error;
  }
  return node.data !== null || employee.data !== null;
}

interface IndexedNode {
  id: number;
  level: OrgUnitLevel;
  name: string;
  parent_id: number | null;
}

interface NodeIndex {
  byPath: Map<string, number>;
  byId: Map<number, IndexedNode>;
}

function levelValue(
  employee: EmployeeTreeRow,
  level: OrgUnitTreeLevel,
  businessGroupNameByEmployeeId: Map<number, string | null>,
): string | null {
  if (level === 'business_group') {
    return businessGroupNameByEmployeeId.get(employee.id) ?? null;
  }
  return employee[level];
}

function businessGroupOnPath(
  leafId: number,
  byId: Map<number, IndexedNode>,
): string | null {
  // Visited guard: the parent FK cannot express acyclicity, so a corrupt
  // chain must terminate the walk rather than hang it.
  const visited = new Set<number>();
  let current = byId.get(leafId);
  while (current && !visited.has(current.id)) {
    if (current.level === 'business_group') return current.name;
    visited.add(current.id);
    current =
      current.parent_id === null ? undefined : byId.get(current.parent_id);
  }
  return null;
}

/**
 * Business group has no text column, so its value per employee comes from,
 * in order: the caller's node override (a write that submitted the field),
 * the business-group node already on the employee's current path (a sync
 * with no override — e.g. MCP add-users — must not drop it), and finally the
 * frozen legacy `group_id` for rows never walked before.
 */
function resolveBusinessGroupNames(
  employees: EmployeeTreeRow[],
  byId: Map<number, IndexedNode>,
  groupNamesById: Map<number, string>,
  overrides: ReadonlyMap<number, number | null> | undefined,
): Map<number, string | null> {
  const names = new Map<number, string | null>();
  for (const employee of employees) {
    const override = overrides?.get(employee.id);
    if (override !== undefined) {
      if (override === null) {
        names.set(employee.id, null);
        continue;
      }
      const node = byId.get(override);
      if (!node || node.level !== 'business_group') {
        throw new Error(
          `business group node ${override} not found for employee ${employee.id}`,
        );
      }
      names.set(employee.id, node.name);
      continue;
    }
    if (employee.org_unit_id !== null) {
      names.set(employee.id, businessGroupOnPath(employee.org_unit_id, byId));
      continue;
    }
    names.set(
      employee.id,
      employee.group_id === null
        ? null
        : (groupNamesById.get(employee.group_id) ?? null),
    );
  }
  return names;
}

async function fetchEmployees(
  client: ServiceClient,
  organizationId: string,
  employeeIds: number[],
): Promise<EmployeeTreeRow[]> {
  const rows: EmployeeTreeRow[] = [];
  for (const ids of chunk(employeeIds, ID_CHUNK_SIZE)) {
    const { data, error } = await client
      .from('org_employees')
      .select(
        'id, entity, division, business_unit, department, team, cost_center, group_id, org_unit_id',
      )
      .eq('organization_id', organizationId)
      .in('id', ids);

    if (error) {
      logger.error(
        { error: sanitizeForLogging(error), organizationId },
        'Failed to load employees for org unit sync',
      );
      throw error;
    }
    rows.push(...(data ?? []));
  }
  return rows;
}

async function fetchGroupNames(
  client: ServiceClient,
  organizationId: string,
  groupIds: number[],
): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  for (const ids of chunk(groupIds, ID_CHUNK_SIZE)) {
    const { data, error } = await client
      .from('groups')
      .select('id, name')
      .eq('organization_id', organizationId)
      .in('id', ids);

    if (error) {
      logger.error(
        { error: sanitizeForLogging(error), organizationId },
        'Failed to load groups for org unit sync',
      );
      throw error;
    }
    for (const group of data ?? []) names.set(group.id, group.name);
  }
  return names;
}

async function loadNodeIndex(
  client: ServiceClient,
  organizationId: string,
): Promise<NodeIndex> {
  const index: NodeIndex = { byPath: new Map(), byId: new Map() };
  for (let offset = 0; ; offset += DB_PAGE_SIZE) {
    const { data, error } = await client
      .from('org_units')
      .select('id, level, name, parent_id')
      .eq('organization_id', organizationId)
      .order('id')
      .range(offset, offset + DB_PAGE_SIZE - 1);

    if (error) {
      logger.error(
        { error: sanitizeForLogging(error), organizationId },
        'Failed to load org units',
      );
      throw error;
    }
    for (const node of data ?? []) {
      indexNode(index, node as IndexedNode);
    }
    if (!data || data.length < DB_PAGE_SIZE) break;
  }
  return index;
}

function indexNode(index: NodeIndex, node: IndexedNode): void {
  index.byPath.set(nodeKey(node.parent_id, node.level, node.name), node.id);
  index.byId.set(node.id, node);
}

/**
 * Moves a shallower same-target node under the step's parent (refinement
 * identity): the id — and every allocation and budget pointing at it — is
 * unchanged; only the position gains precision. The step key checked missing
 * before the match, so the destination path is free and the path-identity
 * constraint cannot fire. The node's old path key stays mapped in the index:
 * a later short-path step in this run resolves through it to the same node,
 * which is exactly the refinement outcome.
 */
async function reparentNode(
  client: ServiceClient,
  organizationId: string,
  index: NodeIndex,
  node: IndexedNode,
  parentId: number,
): Promise<void> {
  const { error } = await client
    .from('org_units')
    .update({ parent_id: parentId })
    // The service client bypasses RLS, so scope every write explicitly.
    .eq('organization_id', organizationId)
    .eq('id', node.id);
  if (error) {
    logger.error(
      { error: sanitizeForLogging(error), organizationId, nodeId: node.id },
      'Failed to re-parent org unit',
    );
    throw error;
  }
  indexNode(index, { ...node, parent_id: parentId });
}

/**
 * Upserts against the path-identity constraint so a concurrent sync landing
 * the same node first is absorbed instead of failing; the existing row's id
 * comes back either way.
 */
async function upsertNodes(
  client: ServiceClient,
  organizationId: string,
  index: NodeIndex,
  nodes: { level: OrgUnitLevel; name: string; parent_id: number | null }[],
): Promise<void> {
  for (const batch of chunk(nodes, ID_CHUNK_SIZE)) {
    const { data, error } = await client
      .from('org_units')
      .upsert(
        batch.map((node) => ({ organization_id: organizationId, ...node })),
        { onConflict: 'organization_id,parent_id,level,name' },
      )
      .select('id, level, name, parent_id');

    if (error) {
      logger.error(
        { error: sanitizeForLogging(error), organizationId },
        'Failed to upsert org units',
      );
      throw error;
    }
    for (const node of data ?? []) {
      indexNode(index, node as IndexedNode);
    }
  }
}

/**
 * Walks each employee's non-null tree-level values in the org's level order,
 * resolving a node per step (parent = previous step's node), and points
 * `org_employees.org_unit_id` at the leaf. Paths may be ragged: a missing
 * middle level parents the next value to the last present one.
 *
 * Step resolution follows refinement identity (design doc §Schema): the
 * exact path node, else the unique same-(level, name) node whose path
 * refines or is refined by the step's — a deeper node is used as-is, a
 * shallower one is re-parented under the step's parent (same id, so
 * allocations and budgets follow) — else a new node. Nodes are never
 * deleted or renamed, so weekly re-imports are stable; renames and true
 * restructures still leave their old node behind (see tree.ts). Cost
 * centers are upserted as flat nodes but never assigned as the leaf.
 *
 * `businessGroupNodeIdByEmployeeId` carries the Business Group a write
 * submitted (a node id; null clears it). See resolveBusinessGroupNames for
 * what happens when an employee has no entry.
 */
export async function syncOrgUnitsForEmployees(
  organizationId: string,
  employeeIds: number[],
  client: ServiceClient = createClient(),
  businessGroupNodeIdByEmployeeId?: ReadonlyMap<number, number | null>,
): Promise<void> {
  const uniqueIds = [...new Set(employeeIds)];
  if (uniqueIds.length === 0) return;

  const levelOrder = await getOrgHierarchyLevelOrder(organizationId, client);
  const employees = await fetchEmployees(client, organizationId, uniqueIds);
  if (employees.length === 0) return;

  const groupIds = [
    ...new Set(
      employees
        .map((e) => e.group_id)
        .filter((id): id is number => id !== null),
    ),
  ];
  const groupNamesById =
    groupIds.length > 0
      ? await fetchGroupNames(client, organizationId, groupIds)
      : new Map<number, string>();

  const index = await loadNodeIndex(client, organizationId);
  const businessGroupNameByEmployeeId = resolveBusinessGroupNames(
    employees,
    index.byId,
    groupNamesById,
    businessGroupNodeIdByEmployeeId,
  );

  const paths = employees.map((employee) => ({
    employee,
    // A null override is a deliberate "no business group", and it promotes the
    // next level to a root step. Such a step must keep path identity or the
    // clear would re-attach the employee to the group they were moved out of.
    // Every other root step is just a blank HR column.
    cleared: businessGroupNodeIdByEmployeeId?.get(employee.id) === null,
    steps: levelOrder.flatMap((level) => {
      const name = levelValue(employee, level, businessGroupNameByEmployeeId);
      return name === null ? [] : [{ level, name }];
    }),
    nodeIds: [] as number[],
  }));

  const maxDepth = Math.max(0, ...paths.map((path) => path.steps.length));
  for (let depth = 0; depth < maxDepth; depth++) {
    const missingByKey = new Map<
      string,
      { level: OrgUnitLevel; name: string; parent_id: number | null }
    >();
    const lookup = buildRefinementLookup([...index.byId.values()]);
    const matchByKey = new Map<
      string,
      {
        level: OrgUnitLevel;
        name: string;
        parentId: number | null;
        match: RefinementMatch;
      }
    >();
    // Collect this depth's keys first: several employees can share one, and a
    // key any cleared employee reaches keeps path identity for all of them —
    // the safe direction, since the alternative undoes someone's clear.
    const stepsByKey = new Map<
      string,
      {
        level: OrgUnitLevel;
        name: string;
        parentId: number | null;
        cleared: boolean;
      }
    >();
    for (const path of paths) {
      if (depth >= path.steps.length) continue;
      const { level, name } = path.steps[depth];
      const parentId = depth === 0 ? null : path.nodeIds[depth - 1];
      const key = nodeKey(parentId, level, name);
      if (index.byPath.has(key)) continue;
      const existing = stepsByKey.get(key);
      if (existing) {
        existing.cleared = existing.cleared || path.cleared;
        continue;
      }
      stepsByKey.set(key, { level, name, parentId, cleared: path.cleared });
    }
    for (const [key, step] of stepsByKey) {
      const { level, name, parentId } = step;
      const match = findRefinementMatch(
        lookup,
        parentId,
        level,
        name,
        !step.cleared,
      );
      if (match) matchByKey.set(key, { level, name, parentId, match });
      else missingByKey.set(key, { level, name, parent_id: parentId });
    }

    // The lookup is a snapshot, so one shallow node can match several step
    // keys in the same batch. Attaches may share a node (they never move it),
    // but two branches claiming the same node as their re-parent destination
    // is the ambiguity rule again — neither branch owns it, the node stays
    // put, and each branch gets its own path-identity node.
    const reparentKeyCountByNode = new Map<number, number>();
    for (const { match } of matchByKey.values()) {
      if (match.kind !== 'reparent') continue;
      reparentKeyCountByNode.set(
        match.node.id,
        (reparentKeyCountByNode.get(match.node.id) ?? 0) + 1,
      );
    }
    for (const [key, { level, name, parentId, match }] of matchByKey) {
      if (
        match.kind === 'reparent' &&
        (reparentKeyCountByNode.get(match.node.id) ?? 0) > 1
      ) {
        missingByKey.set(key, { level, name, parent_id: parentId });
        continue;
      }
      // Same target on a different-precision path. The step key stays mapped
      // to the node either way, so later steps and employees in this run
      // resolve to it directly.
      index.byPath.set(key, match.node.id);
      if (match.kind === 'reparent' && parentId !== null) {
        await reparentNode(client, organizationId, index, match.node, parentId);
      }
    }
    if (missingByKey.size > 0) {
      await upsertNodes(client, organizationId, index, [
        ...missingByKey.values(),
      ]);
    }
    for (const path of paths) {
      if (depth >= path.steps.length) continue;
      const { level, name } = path.steps[depth];
      const parentId = depth === 0 ? null : path.nodeIds[depth - 1];
      const id = index.byPath.get(nodeKey(parentId, level, name));
      if (id === undefined) {
        throw new Error(`org unit missing after upsert: ${level} ${name}`);
      }
      path.nodeIds.push(id);
    }
  }

  const costCenters = [
    ...new Set(
      employees
        .map((e) => e.cost_center)
        .filter((name): name is string => name !== null),
    ),
  ];
  const missingCostCenters = costCenters
    .filter((name) => !index.byPath.has(nodeKey(null, 'cost_center', name)))
    .map((name) => ({
      level: 'cost_center' as const,
      name,
      parent_id: null,
    }));
  if (missingCostCenters.length > 0) {
    await upsertNodes(client, organizationId, index, missingCostCenters);
  }

  const employeeIdsByLeaf = new Map<number | null, number[]>();
  for (const path of paths) {
    const leafId = path.nodeIds[path.nodeIds.length - 1] ?? null;
    if (path.employee.org_unit_id === leafId) continue;
    const ids = employeeIdsByLeaf.get(leafId);
    if (ids) ids.push(path.employee.id);
    else employeeIdsByLeaf.set(leafId, [path.employee.id]);
  }

  for (const [leafId, ids] of employeeIdsByLeaf) {
    for (const idChunk of chunk(ids, ID_CHUNK_SIZE)) {
      const { error } = await client
        .from('org_employees')
        .update({ org_unit_id: leafId })
        .in('id', idChunk)
        // The service client bypasses RLS, so scope every write explicitly.
        .eq('organization_id', organizationId);

      if (error) {
        logger.error(
          { error: sanitizeForLogging(error), organizationId, leafId },
          'Failed to assign employees to org unit',
        );
        throw error;
      }
    }
  }
}
