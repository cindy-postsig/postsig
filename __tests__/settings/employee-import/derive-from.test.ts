import { resolveRows } from '@/lib/v2/employee-import/resolve-rows';
import {
  DERIVED_FIELD_SOURCES,
  IMPORT_TARGET_FIELDS,
  type EmployeeImportMapping,
  type SheetRow,
} from '@/lib/v2/employee-import/types';

const TODAY = '2026-08-17';

function mapping(
  fields: EmployeeImportMapping['fields'],
): EmployeeImportMapping {
  return {
    version: 1,
    hasHeaderRow: false,
    fields,
  };
}

/** [first, last, region, division] */
function row(region: string, division = ''): SheetRow {
  return ['User', 'Name', region, division];
}

const BASE = {
  first_name: { sources: [{ index: 0 }] },
  last_name: { sources: [{ index: 1 }] },
  region: { sources: [{ index: 2 }] },
  division: { sources: [{ index: 3 }] },
} satisfies EmployeeImportMapping['fields'];

describe('field ordering', () => {
  // A single resolve pass walks IMPORT_TARGET_FIELDS in order, so each derived
  // field must appear after the field it derives from.
  it.each(Object.entries(DERIVED_FIELD_SOURCES))(
    '%s comes after its source field %s',
    (field, source) => {
      const fieldIdx = IMPORT_TARGET_FIELDS.indexOf(
        field as (typeof IMPORT_TARGET_FIELDS)[number],
      );
      const sourceIdx = IMPORT_TARGET_FIELDS.indexOf(source);
      expect(sourceIdx).toBeGreaterThanOrEqual(0);
      expect(fieldIdx).toBeGreaterThan(sourceIdx);
    },
  );
});

describe('deriveFrom precedence', () => {
  // resolveRows reads deriveFrom before it reads sources, so a rule holding
  // both silently ignores its columns. The mapping UI must therefore drop
  // deriveFrom when a column is picked, or the field would keep deriving while
  // appearing column-mapped.
  it('takes the derived path when a rule holds both sources and deriveFrom', () => {
    const { rows } = resolveRows(
      [row('London', 'Tax')],
      mapping({
        ...BASE,
        country: { sources: [{ index: 3 }], deriveFrom: 'region' },
      }),
      { today: TODAY },
    );

    // Derived from Region ("London"), not read from column index 3 ("Tax").
    expect(rows[0].country).toBe('GBR');
  });
});

describe('country derived from region', () => {
  const withCountry = mapping({
    ...BASE,
    country: { sources: [], deriveFrom: 'region' },
  });

  it('resolves through the built-in location lookup', () => {
    const { rows } = resolveRows(
      [row('London'), row('Hamburg'), row('New York')],
      withCountry,
      { today: TODAY },
    );
    expect(rows.map((r) => r.country)).toEqual(['GBR', 'DEU', 'USA']);
  });

  it('leaves Region untouched', () => {
    const { rows } = resolveRows([row('London')], withCountry, {
      today: TODAY,
    });
    expect(rows[0].region).toBe('London');
  });

  it('lets an explicit override beat the lookup', () => {
    const { rows } = resolveRows(
      [row('London')],
      mapping({
        ...BASE,
        country: {
          sources: [],
          deriveFrom: 'region',
          valueMap: { london: 'IRL' },
        },
      }),
      { today: TODAY },
    );
    expect(rows[0].country).toBe('IRL');
  });

  it('blanks an unknown location and reports it for override', () => {
    const { rows, unmappedValues, sourceValues } = resolveRows(
      [row('Atlantis'), row('London')],
      withCountry,
      { today: TODAY },
    );

    expect(rows[0].country).toBe('');
    expect(rows[1].country).toBe('GBR');
    // Only the miss needs the user's attention...
    expect(unmappedValues.country).toEqual(['Atlantis']);
    // ...though every input is still available to the editor.
    expect(sourceValues.country).toEqual(['Atlantis', 'London']);
  });

  it('resolves nothing when Region is not mapped', () => {
    const { rows } = resolveRows(
      [row('London')],
      mapping({
        first_name: { sources: [{ index: 0 }] },
        last_name: { sources: [{ index: 1 }] },
        country: { sources: [], deriveFrom: 'region' },
      }),
      { today: TODAY },
    );
    expect(rows[0].country).toBe('');
  });
});

describe('business group derived from division', () => {
  const withGroup = mapping({
    ...BASE,
    business_group: {
      sources: [],
      deriveFrom: 'division',
      valueMap: { tax: 'Bank Management' },
    },
  });

  it('maps a division onto its group', () => {
    const { rows } = resolveRows([row('London', 'Tax')], withGroup, {
      today: TODAY,
    });
    expect(rows[0].division).toBe('Tax');
    expect(rows[0].business_group).toBe('Bank Management');
  });

  // The name passes through so matchBusinessGroups can match it against the
  // org's groups by normalized name; only names that match nothing there are
  // reported back to the preview. Blanking it here would make every value need
  // a hand-built map entry, even ones that already name a real group.
  it('passes an unmapped division through for server-side matching', () => {
    const { rows, unmappedValues } = resolveRows(
      [row('London', 'Works Council')],
      withGroup,
      { today: TODAY },
    );
    expect(rows[0].business_group).toBe('Works Council');
    expect(unmappedValues.business_group).toBeUndefined();
  });

  // Matching is case- and whitespace-insensitive, so variants of one division
  // collapse to a single entry that needs mapping only once. This is why the
  // editor must not also warn about them.
  it('treats case and spacing variants as one value', () => {
    const { rows, sourceValues, unmappedValues } = resolveRows(
      [
        row('London', 'Zentralbereich Investment Bank'),
        row('London', 'zentralbereich investment bank'),
        row('London', '  ZENTRALBEREICH INVESTMENT BANK  '),
      ],
      mapping({
        ...BASE,
        business_group: {
          sources: [],
          deriveFrom: 'division',
          valueMap: { 'zentralbereich investment bank': 'Investment Banking' },
        },
      }),
      { today: TODAY },
    );

    // One map entry covers all three spellings.
    expect(rows.map((r) => r.business_group)).toEqual([
      'Investment Banking',
      'Investment Banking',
      'Investment Banking',
    ]);
    expect(unmappedValues.business_group).toBeUndefined();
    // Each distinct spelling is still reported as seen, so the editor can show
    // the file's own casing — it dedupes by normalized key when it renders.
    expect(sourceValues.business_group).toHaveLength(3);
  });

  // The blocking bug: with no map yet nothing was collected, so the editor had
  // nothing to list and the first map could never be built.
  it('lists every division even with no value map configured', () => {
    const { sourceValues } = resolveRows(
      [row('London', 'Tax'), row('London', 'Legal'), row('London', 'Tax')],
      mapping({
        ...BASE,
        business_group: { sources: [], deriveFrom: 'division' },
      }),
      { today: TODAY },
    );
    expect(sourceValues.business_group).toEqual(['Tax', 'Legal']);
  });
});
