/**
 * Reorders an exporter's column keys to honor a CPM list view's saved layout
 * while keeping the export's remaining "rich" fields.
 */
export function orderExportColumns(params: {
  visibleIds: string[];
  idToKey: Record<string, string>;
  allKeys: string[];
  leadingKeys?: string[];
}): string[] {
  const { visibleIds, idToKey, allKeys, leadingKeys = [] } = params;

  const allKeySet = new Set(allKeys);
  const leading = leadingKeys.filter((key) => allKeySet.has(key));
  const leadingSet = new Set(leading);
  const configurableKeys = new Set(Object.values(idToKey));

  const front: string[] = [];
  const placed = new Set(leading);
  for (const id of visibleIds) {
    const key = idToKey[id];
    if (key && allKeySet.has(key) && !placed.has(key)) {
      front.push(key);
      placed.add(key);
    }
  }

  const rest = allKeys.filter(
    (key) =>
      !leadingSet.has(key) && !configurableKeys.has(key) && !placed.has(key),
  );

  return [...leading, ...front, ...rest];
}
