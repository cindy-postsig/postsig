/**
 * Chat Tools - Tags Tool
 *
 * Tool for querying contracts by tags or listing available tags.
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { getContractsListForLineageAI } from '@/lib/v2/contracts/service';
import { reverseContractTypeMap, contractTypes } from '@/app/lib/constants';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import { QUERY_RESULT_LIMIT } from '@/lib/v2/chat/constants';
import type {
  TagsToolOutput,
  TagsByContractResult,
  OrgTagsResult,
  ContractsByTagResult,
  UntaggedContractsResult,
  ContractWithTags,
} from '@/lib/v2/chat/types';

interface ContractTag {
  id: number;
  tag_id: number;
  user_tags?: {
    id: number;
    name?: string;
  } | null;
}

/**
 * Create the query_tags tool
 * Queries contracts by tags or lists available tags
 */
export function createQueryTagsTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description: `Query contracts by tags or list available tags. No financial, spend or budget data is returned.
      Use this tool when users ask about:
      - Contracts with specific tags
      - Tags assigned to a contract or vendor
      - All available tags in the organization
      - Untagged contracts

      Returns tag information with contract associations.`,
    inputSchema: z.object({
      queryType: z
        .enum(['by_tag', 'contract_tags', 'list_all', 'untagged'])
        .describe('Type of tag query'),
      tagName: z
        .string()
        .optional()
        .describe('Tag name to filter by (for by_tag query)'),
      vendorName: z
        .string()
        .optional()
        .describe('Vendor name to get tags for (for contract_tags query)'),
      contractId: z
        .number()
        .optional()
        .describe('Contract ID to get tags for (for contract_tags query)'),
    }),
    execute: async ({
      queryType,
      tagName,
      vendorName,
      contractId,
    }): Promise<TagsToolOutput> => {
      if (!user) {
        logger.warn('No user context available for query_tags tool.');
        return { error: 'User context not available' };
      }

      let contracts: Awaited<
        ReturnType<typeof getContractsListForLineageAI>
      >['contracts'];
      try {
        const cacheKey = ChatToolCache.buildKey('getContractsListForLineageAI');
        ({ contracts } = await cache.getOrFetch(cacheKey, () =>
          getContractsListForLineageAI(),
        ));
      } catch (error) {
        logger.error({ error }, 'query_tags tool: failed to fetch contracts');
        return { error: 'Failed to fetch contracts' };
      }

      switch (queryType) {
        case 'by_tag': {
          if (!tagName) {
            return { error: 'Tag name is required for by_tag query' };
          }

          const searchName = tagName.toLowerCase();
          const filtered = contracts.filter((c) => {
            const contractTags = c.contract.contract_tags as
              | ContractTag[]
              | undefined;
            return contractTags?.some(
              (t) => t.user_tags?.name?.toLowerCase() === searchName,
            );
          });

          const result: ContractsByTagResult = {
            type: 'contracts_by_tag',
            tagName,
            contracts: filtered.slice(0, QUERY_RESULT_LIMIT).map((c) => ({
              contractId: c.contract.id,
              vendorName: c.contract.vendors?.name,
              contractType:
                reverseContractTypeMap[
                  c.contract.type_id as keyof typeof contractTypes
                ],
              summary: c.contract.summary,
            })),
          };

          return result;
        }

        case 'contract_tags': {
          let filtered = contracts;

          if (vendorName) {
            const searchName = vendorName.toLowerCase();
            filtered = filtered.filter((c) =>
              c.contract.vendors?.name?.toLowerCase().includes(searchName),
            );
          }

          if (contractId) {
            filtered = filtered.filter((c) => c.contract.id === contractId);
          }

          if (!vendorName && !contractId) {
            return {
              error:
                'Please provide a vendorName or contractId for contract_tags query',
            };
          }

          const result: TagsByContractResult = {
            type: 'contract_tags',
            contracts: filtered.slice(0, QUERY_RESULT_LIMIT).map((c) => {
              const contractTags = c.contract.contract_tags as
                | ContractTag[]
                | undefined;
              const tags: ContractWithTags['tags'] = (contractTags || [])
                .map((t) => ({
                  id: t.tag_id,
                  name: t.user_tags?.name || '',
                }))
                .filter((t) => t.name);

              return {
                contractId: c.contract.id,
                vendorName: c.contract.vendors?.name,
                contractType:
                  reverseContractTypeMap[
                    c.contract.type_id as keyof typeof contractTypes
                  ],
                tags,
              };
            }),
          };

          return result;
        }

        case 'list_all': {
          const tagCounts = new Map<
            string,
            { id: number; name: string; count: number }
          >();

          contracts.forEach((c) => {
            const contractTags = c.contract.contract_tags as
              | ContractTag[]
              | undefined;
            (contractTags || []).forEach((t) => {
              if (t.user_tags?.name) {
                const key = t.user_tags.name.toLowerCase();
                const existing = tagCounts.get(key);
                if (existing) {
                  existing.count++;
                } else {
                  tagCounts.set(key, {
                    id: t.tag_id,
                    name: t.user_tags.name,
                    count: 1,
                  });
                }
              }
            });
          });

          const result: OrgTagsResult = {
            type: 'org_tags',
            tags: Array.from(tagCounts.values())
              .sort((a, b) => b.count - a.count)
              .map((t) => ({
                id: t.id,
                name: t.name,
                contractCount: t.count,
              })),
            totalContracts: contracts.length,
          };

          return result;
        }

        case 'untagged': {
          const untagged = contracts.filter((c) => {
            const contractTags = c.contract.contract_tags as
              | ContractTag[]
              | undefined;
            return !contractTags || contractTags.length === 0;
          });

          const result: UntaggedContractsResult = {
            type: 'untagged_contracts',
            count: untagged.length,
            contracts: untagged.slice(0, QUERY_RESULT_LIMIT).map((c) => ({
              contractId: c.contract.id,
              vendorName: c.contract.vendors?.name,
              contractType:
                reverseContractTypeMap[
                  c.contract.type_id as keyof typeof contractTypes
                ],
            })),
          };

          return result;
        }

        default:
          return { error: 'Invalid query type' };
      }
    },
  });
}
