import { tool } from 'ai';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { getContractsListForLineageAI } from '@/lib/v2/contracts/service';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import {
  contractOwners,
  ownerGroupNames,
  ownerSponsorNames,
} from '@/lib/v2/owners/embed';
import type {
  ResolvedEntity,
  ResolveEntityResult,
  ResolveEntityToolOutput,
  EntityType,
  ToolError,
} from '@/lib/v2/chat/types';
import { buildResolveEntityToolDescription } from '@/lib/v2/chat/guidance/resolve-entity-guidance';

type ContractsListItem = Awaited<
  ReturnType<typeof getContractsListForLineageAI>
>['contracts'][number];

interface ContractTag {
  id: number;
  tag_id: number;
  user_tags?: { id: number; name?: string } | null;
}

const INPUT_SCHEMA = z.object({
  name: z
    .string()
    .describe(
      'The entity name to resolve. Searched across vendors, products, tags, business groups, and sponsors.',
    ),
});

interface EntityMatch {
  name: string;
  contractIds: Set<number>;
}

type EntityIndex = Map<string, EntityMatch>;

function addToIndex(
  index: EntityIndex,
  name: string,
  contractId: number,
): void {
  const key = name.toLowerCase();
  const existing = index.get(key);
  if (existing) {
    existing.contractIds.add(contractId);
  } else {
    index.set(key, { name, contractIds: new Set([contractId]) });
  }
}

function indexVendor(item: ContractsListItem, index: EntityIndex): void {
  const name = item.contract.vendors?.name;
  if (name) addToIndex(index, name, item.contract.id);
}

function indexProducts(item: ContractsListItem, index: EntityIndex): void {
  const details = item.contract.vendor_products_details;
  if (!Array.isArray(details)) return;
  for (const p of details) {
    const name = (p as { vendor_products?: { name?: string } }).vendor_products
      ?.name;
    if (name) addToIndex(index, name, item.contract.id);
  }
}

function indexTags(item: ContractsListItem, index: EntityIndex): void {
  const contractTags = item.contract.contract_tags as ContractTag[] | undefined;
  if (!contractTags) return;
  for (const t of contractTags) {
    const name = t.user_tags?.name;
    if (name) addToIndex(index, name, item.contract.id);
  }
}

function indexBusinessGroups(
  item: ContractsListItem,
  index: EntityIndex,
): void {
  for (const name of ownerGroupNames(contractOwners(item.contract))) {
    addToIndex(index, name, item.contract.id);
  }
}

function indexSponsors(item: ContractsListItem, index: EntityIndex): void {
  for (const name of ownerSponsorNames(contractOwners(item.contract))) {
    addToIndex(index, name, item.contract.id);
  }
}

export function buildEntityIndexes(contracts: ContractsListItem[]): {
  vendors: EntityIndex;
  products: EntityIndex;
  tags: EntityIndex;
  businessGroups: EntityIndex;
  sponsors: EntityIndex;
} {
  const vendors: EntityIndex = new Map();
  const products: EntityIndex = new Map();
  const tags: EntityIndex = new Map();
  const businessGroups: EntityIndex = new Map();
  const sponsors: EntityIndex = new Map();

  for (const item of contracts) {
    indexVendor(item, vendors);
    indexProducts(item, products);
    indexTags(item, tags);
    indexBusinessGroups(item, businessGroups);
    indexSponsors(item, sponsors);
  }

  return { vendors, products, tags, businessGroups, sponsors };
}

function searchIndex(
  index: EntityIndex,
  search: string,
  type: EntityType,
): ResolvedEntity[] {
  const results: ResolvedEntity[] = [];
  for (const entry of index.values()) {
    if (!entry.name.toLowerCase().includes(search)) continue;
    results.push({
      type,
      name: entry.name,
      contractCount: entry.contractIds.size,
    });
  }
  return results;
}

export function resolveEntity(
  contracts: ContractsListItem[],
  name: string,
): ResolveEntityResult {
  const search = name.toLowerCase();
  const indexes = buildEntityIndexes(contracts);

  const matches: ResolvedEntity[] = [
    ...searchIndex(indexes.vendors, search, 'vendor'),
    ...searchIndex(indexes.products, search, 'product'),
    ...searchIndex(indexes.tags, search, 'tag'),
    ...searchIndex(indexes.businessGroups, search, 'businessGroup'),
    ...searchIndex(indexes.sponsors, search, 'sponsor'),
  ];

  matches.sort((a, b) => b.contractCount - a.contractCount);

  return { query: name, matches };
}

function buildNoMatchesError(name: string): ToolError {
  return {
    error: '_NO_RESULTS_',
    noResults: true,
    searchedBy: 'name',
    searchTerm: name,
    suggestion: `No vendors, products, tags, business groups, or sponsors found matching "${name}". Try a different spelling or partial name.`,
  };
}

async function fetchContracts(
  user: UserMetadata | null,
  cache: ChatToolCache,
): Promise<ContractsListItem[] | ToolError> {
  if (!user) {
    logger.warn('No user context available for resolve_entity tool.');
    return { error: 'User context not available' };
  }
  try {
    const cacheKey = ChatToolCache.buildKey('getContractsListForLineageAI');
    const result = await cache.getOrFetch(cacheKey, () =>
      getContractsListForLineageAI({}),
    );
    return result.contracts;
  } catch (error) {
    logger.error({ error }, 'Failed to resolve entity');
    return { error: 'Failed to resolve entity' };
  }
}

async function executeResolveEntity(
  input: z.infer<typeof INPUT_SCHEMA>,
  user: UserMetadata | null,
  cache: ChatToolCache,
): Promise<ResolveEntityToolOutput> {
  const contractsOrError = await fetchContracts(user, cache);
  if (!Array.isArray(contractsOrError)) return contractsOrError;

  const result = resolveEntity(contractsOrError, input.name);
  if (result.matches.length === 0) return buildNoMatchesError(input.name);

  return result;
}

export function createResolveEntityTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description: buildResolveEntityToolDescription(),
    inputSchema: INPUT_SCHEMA,
    execute: (input) => executeResolveEntity(input, user, cache),
  });
}
