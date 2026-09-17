import { createClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import { mapNodeToBusinessGroup, type OrgUnitNode } from './tree';

/** PostgREST caps responses at `max_rows` (1000), so read every page. */
const DB_PAGE_SIZE = 1000;

type ServiceClient = ReturnType<typeof createClient>;

export interface BusinessGroupNode {
  id: number;
  name: string;
}

export function normalizeBusinessGroupName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * All `business_group` nodes, not just roots and not deduped by name: the
 * pickers pre-select an employee's current node by id, and path identity means
 * that node can sit under an entity rather than at the root.
 */
export async function getBusinessGroupNodes(
  organizationId: string,
  client: ServiceClient = createClient(),
): Promise<BusinessGroupNode[]> {
  const nodes: BusinessGroupNode[] = [];
  for (let offset = 0; ; offset += DB_PAGE_SIZE) {
    const { data, error } = await client
      .from('org_units')
      .select('id, name')
      .eq('organization_id', organizationId)
      .eq('level', 'business_group')
      .order('name')
      .order('id')
      .range(offset, offset + DB_PAGE_SIZE - 1);

    if (error) {
      logger.error(
        { error: sanitizeForLogging(error), organizationId },
        'Failed to load business group nodes',
      );
      throw error;
    }
    nodes.push(...(data ?? []));
    if (!data || data.length < DB_PAGE_SIZE) break;
  }
  return nodes;
}

/**
 * Name registration, not placement: the returned node exists so matching by
 * name succeeds, while the upsert walk still decides where the level sits in
 * each employee's path. Matches an existing node by normalized name first so
 * repeated creates converge instead of erroring.
 */
export async function createBusinessGroupNode(
  organizationId: string,
  name: string,
  client: ServiceClient = createClient(),
): Promise<BusinessGroupNode> {
  const trimmed = name.trim();
  if (trimmed === '') {
    throw new Error('Business group name is required');
  }

  const wanted = normalizeBusinessGroupName(trimmed);
  const existing = (await getBusinessGroupNodes(organizationId, client)).find(
    (node) => normalizeBusinessGroupName(node.name) === wanted,
  );
  if (existing) return existing;

  const { data, error } = await client
    .from('org_units')
    .upsert(
      {
        organization_id: organizationId,
        level: 'business_group',
        name: trimmed,
        parent_id: null,
      },
      // Path-identity conflict target absorbs a concurrent create of the same
      // root node; the existing row's id comes back either way.
      { onConflict: 'organization_id,parent_id,level,name' },
    )
    .select('id, name')
    .single();

  if (error) {
    logger.error(
      { error: sanitizeForLogging(error), organizationId },
      'Failed to create business group node',
    );
    throw error;
  }
  return data;
}

/**
 * Leaf node id → the business-group node on its path (itself or the nearest
 * ancestor). This is how readers get an employee's business group now that
 * membership is carried by `org_employees.org_unit_id` alone.
 */
export async function getBusinessGroupsByLeaf(
  organizationId: string,
  client: ServiceClient = createClient(),
): Promise<Map<number, BusinessGroupNode>> {
  const nodes: OrgUnitNode[] = [];
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
        'Failed to load org units for business group resolution',
      );
      throw error;
    }
    nodes.push(...((data ?? []) as OrgUnitNode[]));
    if (!data || data.length < DB_PAGE_SIZE) break;
  }
  return mapNodeToBusinessGroup(nodes);
}
