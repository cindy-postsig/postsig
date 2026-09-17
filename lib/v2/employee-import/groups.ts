import {
  getBusinessGroupNodes,
  normalizeBusinessGroupName,
} from '@/lib/v2/org-units';

/** A business_group org-unit node. */
export type MatchedGroup = { id: number; name: string };

export type GroupMatchPair = {
  source: string;
  group: string;
};

export type GroupMatch = {
  byName: Map<string, MatchedGroup>;
  matched: GroupMatchPair[];
  unmatched: string[];
};

export const normalizeGroupName = normalizeBusinessGroupName;

async function loadGroups(
  organizationId: string,
): Promise<Map<string, MatchedGroup>> {
  const byName = new Map<string, MatchedGroup>();
  for (const node of await getBusinessGroupNodes(organizationId)) {
    byName.set(normalizeGroupName(node.name), node);
  }
  return byName;
}

function distinctByNormalizedName(names: string[]): Map<string, string> {
  const wanted = new Map<string, string>();
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed === '') continue;
    const key = normalizeGroupName(trimmed);
    if (!wanted.has(key)) wanted.set(key, trimmed);
  }
  return wanted;
}

/**
 * Matches Business Group names from an import onto `business_group` org-unit
 * nodes. Read-only, so it is safe to call on every debounced preview.
 */
export async function matchBusinessGroups(
  organizationId: string,
  names: string[],
): Promise<GroupMatch> {
  const wanted = distinctByNormalizedName(names);
  if (wanted.size === 0) {
    return { byName: new Map(), matched: [], unmatched: [] };
  }

  const byName = await loadGroups(organizationId);
  return { byName, ...partition(wanted, byName) };
}

function partition(
  wanted: Map<string, string>,
  byName: Map<string, MatchedGroup>,
): { matched: GroupMatchPair[]; unmatched: string[] } {
  const matched: GroupMatchPair[] = [];
  const unmatched: string[] = [];

  for (const [key, source] of wanted) {
    const group = byName.get(key);
    if (group) matched.push({ source, group: group.name });
    else unmatched.push(source);
  }

  return { matched, unmatched };
}
