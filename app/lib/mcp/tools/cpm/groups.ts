import { z } from 'zod';
import logger from '@/utils/pino';
import { requireMcpContext } from '@/app/lib/mcp/context';
import {
  getOrgBusinessGroups,
  getGroupsWithContracts,
  getContractIdsForGroup,
  getContractBusinessGroups,
} from '@/lib/v2/groups/service';
import { getContractsList } from '@/lib/v2/contracts/service';
import { filterExcludeInvoices } from '@/lib/v2/core/filters';
import { reverseContractTypeMap, contractTypes } from '@/app/lib/constants';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import type {
  GroupsToolOutput,
  GroupContractInfo,
  GroupResult,
  OrgGroupsResult,
  VendorGroupsResult,
} from '@/lib/v2/chat/types';
import type { McpToolDef } from '@/app/lib/mcp/tools/types';

const input = z.object({
  groupName: z
    .string()
    .optional()
    .describe('Name of the group/team to query (e.g., "Sales", "Compliance")'),
  vendorName: z
    .string()
    .optional()
    .describe('Vendor name to find groups with access to their contracts'),
  listAll: z
    .boolean()
    .optional()
    .describe('Set to true to list all groups in the organization'),
});

async function getGroupMemberCount(groupId: number): Promise<number> {
  const { createClient } = await import('@/utils/supabase/server');
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('group_members')
    .select('*', { count: 'exact', head: true })
    .eq('group_id', groupId);

  if (error) {
    logger.warn({ error, groupId }, 'Failed to get group member count');
    return 0;
  }

  return count ?? 0;
}

async function getGroups(
  payload: z.infer<typeof input>,
): Promise<GroupsToolOutput> {
  const ctx = requireMcpContext();
  const organizationId = ctx.userMetadata.organizationId;
  const cache = ctx.cache;
  const { groupName, vendorName, listAll } = payload;

  if (listAll) {
    const [allGroups, groupsWithContracts] = await Promise.all([
      getOrgBusinessGroups(organizationId),
      getGroupsWithContracts(),
    ]);

    const contractCountMap = new Map<number, number>();
    await Promise.all(
      groupsWithContracts.map(async (group) => {
        const contractIds = await getContractIdsForGroup(group.id);
        contractCountMap.set(group.id, contractIds.length);
      }),
    );

    const result: OrgGroupsResult = {
      type: 'org_groups',
      groups: await Promise.all(
        allGroups.map(async (g) => ({
          id: g.id,
          name: g.name,
          memberCount: await getGroupMemberCount(g.id),
          contractCount: contractCountMap.get(g.id) ?? 0,
        })),
      ),
    };

    return result;
  }

  if (groupName) {
    const allGroups = await getOrgBusinessGroups(organizationId);
    const searchName = groupName.toLowerCase();
    const matchingGroup = allGroups.find((g) =>
      g.name.toLowerCase().includes(searchName),
    );

    if (!matchingGroup) {
      return {
        error: '_NO_RESULTS_',
        noResults: true,
        searchedBy: 'groupName',
        searchTerm: groupName,
        suggestion: 'Try get_groups(listAll=true) to see available groups',
      };
    }

    let contractIds: number[];
    let contracts: Awaited<ReturnType<typeof getContractsList>>['contracts'];
    let memberCount: number;
    try {
      const [ids, result, count] = await Promise.all([
        getContractIdsForGroup(matchingGroup.id),
        cache.getOrFetch(ChatToolCache.buildKey('getContractsList'), () =>
          getContractsList(),
        ),
        getGroupMemberCount(matchingGroup.id),
      ]);
      contractIds = ids;
      contracts = result.contracts;
      memberCount = count;
    } catch (err) {
      logger.error({ err }, 'Failed to fetch data for get_groups tool');
      return { error: 'Failed to retrieve group data' };
    }

    const groupContracts: GroupContractInfo[] = filterExcludeInvoices(contracts)
      .filter((c) => contractIds.includes(c.contract.id))
      .map((c) => ({
        contractId: c.contract.id,
        vendorName: c.contract.vendors?.name,
        contractType:
          reverseContractTypeMap[
            c.contract.type_id as keyof typeof contractTypes
          ],
        permission: 'write' as const,
      }));

    const result: GroupResult = {
      type: 'group_contracts',
      groupId: matchingGroup.id,
      groupName: matchingGroup.name,
      memberCount,
      contractCount: groupContracts.length,
      contracts: groupContracts,
    };

    return result;
  }

  if (vendorName) {
    let contracts: Awaited<ReturnType<typeof getContractsList>>['contracts'];
    try {
      const result = await cache.getOrFetch(
        ChatToolCache.buildKey('getContractsList'),
        () => getContractsList(),
      );
      contracts = result.contracts;
    } catch (err) {
      logger.error({ err }, 'Failed to fetch contracts for get_groups tool');
      return { error: 'Failed to retrieve contracts' };
    }

    const searchName = vendorName.toLowerCase();
    const vendorContracts = filterExcludeInvoices(contracts).filter((c) =>
      c.contract.vendors?.name?.toLowerCase().includes(searchName),
    );

    if (vendorContracts.length === 0) {
      return {
        error: '_NO_RESULTS_',
        noResults: true,
        searchedBy: 'vendorName',
        searchTerm: vendorName,
        suggestion: 'Try a different vendor name or check spelling',
      };
    }

    const groupsMap = new Map<
      number,
      { name: string; permission: 'read' | 'write' | 'admin' }
    >();

    const allContractGroups = await Promise.all(
      vendorContracts.map((contract) =>
        getContractBusinessGroups(contract.contract.id),
      ),
    );

    for (const contractGroups of allContractGroups) {
      for (const group of contractGroups) {
        if (!groupsMap.has(group.id)) {
          groupsMap.set(group.id, { name: group.name, permission: 'write' });
        }
      }
    }

    const result: VendorGroupsResult = {
      type: 'vendor_groups',
      vendorName: vendorContracts[0]?.contract.vendors?.name || vendorName,
      groups: Array.from(groupsMap.entries()).map(([id, info]) => ({
        id,
        name: info.name,
        permission: info.permission,
      })),
    };

    return result;
  }

  return {
    error: 'Please provide a groupName, vendorName, or set listAll to true',
  };
}

export const groupsTools: McpToolDef[] = [
  {
    name: 'get_groups',
    description:
      "Query groups/teams and their contract access. Use when the user asks which groups can access specific contracts or vendors, what contracts a specific group can access, or to list all groups in the organization. Returns group information with contract counts and access permissions. Branches: pass `listAll: true` to list every group; pass `groupName` to look up one group by name (substring match); pass `vendorName` to find groups with access to that vendor's contracts.",
    inputSchema: input,
    annotations: {
      title: 'Query groups',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getGroups as McpToolDef['handler'],
  },
];
