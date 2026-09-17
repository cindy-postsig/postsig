import { describe, expect, it } from '@jest/globals';
import {
  groupKpisByCategory,
  setAllHidden,
  toggleHidden,
} from '@/app/(app)/(investor)/investor/settings/kpis/kpi-settings-logic';
import { NARRATIVE_CATEGORY } from '@/lib/v2/kpis/types';
import type { KpiDefinition } from '@/lib/v2/kpis/types';

let nextId = 1;

const kpi = (
  category: string,
  overrides: Partial<KpiDefinition> = {},
): KpiDefinition => {
  const id = nextId++;
  return {
    id,
    publicId: `pub-${id}`,
    code: `code-${id}`,
    label: `KPI ${id}`,
    category,
    valueType: 'number',
    unit: null,
    description: null,
    placeholder: null,
    sortOrder: id,
    isFlow: false,
    isCustom: false,
    ...overrides,
  };
};

describe('groupKpisByCategory', () => {
  it('preserves first-seen category order for standard categories', () => {
    const groups = groupKpisByCategory([
      kpi('Unit Economics'),
      kpi('Growth'),
      kpi('Unit Economics'),
    ]);
    expect(groups.map(([category]) => category)).toEqual([
      'Unit Economics',
      'Growth',
    ]);
    expect(groups[0][1]).toHaveLength(2);
  });

  it('sinks custom-only categories below standard categories', () => {
    const groups = groupKpisByCategory([
      kpi('Custom Group', { isCustom: true }),
      kpi('Growth'),
    ]);
    expect(groups.map(([category]) => category)).toEqual([
      'Growth',
      'Custom Group',
    ]);
  });

  it('keeps a category standard when it mixes custom and coded KPIs', () => {
    const groups = groupKpisByCategory([
      kpi('Mixed', { isCustom: true }),
      kpi('Mixed'),
      kpi('Growth'),
    ]);
    expect(groups.map(([category]) => category)).toEqual(['Mixed', 'Growth']);
  });

  it('excludes the narrative category', () => {
    const groups = groupKpisByCategory([
      kpi(NARRATIVE_CATEGORY),
      kpi('Growth'),
    ]);
    expect(groups.map(([category]) => category)).toEqual(['Growth']);
  });

  it('drops custom KPIs filed under the narrative category', () => {
    const groups = groupKpisByCategory([
      kpi('Growth'),
      kpi(NARRATIVE_CATEGORY, { isCustom: true }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0][1]).toHaveLength(1);
  });
});

describe('toggleHidden', () => {
  it('adds a publicId when disabling a KPI', () => {
    const next = toggleHidden(new Set<string>(), 'pub-1', false);
    expect(Array.from(next)).toEqual(['pub-1']);
  });

  it('removes a publicId when enabling a KPI', () => {
    const next = toggleHidden(new Set(['pub-1', 'pub-2']), 'pub-1', true);
    expect(Array.from(next)).toEqual(['pub-2']);
  });

  it('does not mutate the input set', () => {
    const hidden = new Set(['pub-1']);
    toggleHidden(hidden, 'pub-2', false);
    expect(Array.from(hidden)).toEqual(['pub-1']);
  });
});

describe('setAllHidden', () => {
  it('hides every given publicId when disabling', () => {
    const next = setAllHidden(new Set(['pub-1']), ['pub-1', 'pub-2'], false);
    expect(Array.from(next).sort()).toEqual(['pub-1', 'pub-2']);
  });

  it('unhides every given publicId when enabling, leaving others hidden', () => {
    const next = setAllHidden(
      new Set(['pub-1', 'pub-2', 'pub-3']),
      ['pub-1', 'pub-2'],
      true,
    );
    expect(Array.from(next)).toEqual(['pub-3']);
  });

  it('does not mutate the input set', () => {
    const hidden = new Set(['pub-1']);
    setAllHidden(hidden, ['pub-2'], false);
    expect(Array.from(hidden)).toEqual(['pub-1']);
  });
});
