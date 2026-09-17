import { NARRATIVE_CATEGORY } from '@/lib/v2/kpis/types';
import type { KpiDefinition } from '@/lib/v2/kpis/types';

// Category order follows the catalog's first-seen order (getKpis returns rows
// sorted by sort_order); a category whose KPIs are all custom sinks below the
// standard categories. Narrative KPIs are dropped here to match every other
// surface (requests, performance tab, pivots), which hides them today.
export function groupKpisByCategory(
  kpis: KpiDefinition[],
): [string, KpiDefinition[]][] {
  const map = new Map<string, KpiDefinition[]>();
  for (const kpi of kpis) {
    if (kpi.category === NARRATIVE_CATEGORY) continue;
    const arr = map.get(kpi.category) ?? [];
    arr.push(kpi);
    map.set(kpi.category, arr);
  }
  return Array.from(map.entries()).sort(
    ([, a], [, b]) =>
      Number(a.every((k) => k.isCustom)) - Number(b.every((k) => k.isCustom)),
  );
}

// A KPI is tracked when its publicId is absent from the hidden set, so enabling
// removes it and disabling adds it.
export function toggleHidden(
  hidden: Set<string>,
  publicId: string,
  enabled: boolean,
): Set<string> {
  const next = new Set(hidden);
  if (enabled) next.delete(publicId);
  else next.add(publicId);
  return next;
}

export function setAllHidden(
  hidden: Set<string>,
  publicIds: string[],
  enabled: boolean,
): Set<string> {
  const next = new Set(hidden);
  for (const id of publicIds) {
    if (enabled) next.delete(id);
    else next.add(id);
  }
  return next;
}
