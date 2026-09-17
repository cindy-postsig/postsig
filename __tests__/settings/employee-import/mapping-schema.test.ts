import {
  EmployeeImportMappingSchema,
  type EmployeeImportMapping,
} from '@/lib/v2/employee-import/types';

const valid: EmployeeImportMapping = {
  version: 1,
  hasHeaderRow: false,
  sheetName: 'Tabelle1',
  fields: {
    employee_id: { sources: [{ index: 0 }] },
    cost_center: { sources: [{ index: 6 }, { index: 7 }], separator: ' - ' },
    department: {
      sources: [{ index: 26, required: true }, { index: 27 }],
    },
    country: {
      sources: [],
      deriveFrom: 'region',
      valueMap: { london: 'GBR' },
    },
  },
};

describe('EmployeeImportMappingSchema', () => {
  it('accepts a mapping that has survived a JSON round trip', () => {
    const parsed = EmployeeImportMappingSchema.parse(
      JSON.parse(JSON.stringify(valid)),
    );
    expect(parsed).toEqual(valid);
  });

  it('accepts a mapping with no fields configured yet', () => {
    expect(() =>
      EmployeeImportMappingSchema.parse({
        version: 1,
        hasHeaderRow: true,
        fields: {},
      }),
    ).not.toThrow();
  });

  // Mappings stored before these fields were retired must keep parsing:
  // getSavedImportMapping treats a parse failure as "no saved mapping", so a
  // strict schema would silently drop every mapping an org had saved.
  it('still parses a mapping stored with retired fields', () => {
    const parsed = EmployeeImportMappingSchema.parse({
      version: 1,
      hasHeaderRow: true,
      autoCreateBusinessGroups: true,
      newBusinessGroups: ['Bank Management'],
      fields: { email: { sources: [{ index: 3 }] } },
    });
    expect(parsed).not.toHaveProperty('autoCreateBusinessGroups');
    expect(parsed).not.toHaveProperty('newBusinessGroups');
    expect(parsed.fields.email).toEqual({ sources: [{ index: 3 }] });
  });

  it('rejects an unknown target field', () => {
    expect(() =>
      EmployeeImportMappingSchema.parse({
        ...valid,
        fields: { nickname: { sources: [{ index: 0 }] } },
      }),
    ).toThrow();
  });

  it('rejects a field that neither reads columns nor derives', () => {
    expect(() =>
      EmployeeImportMappingSchema.parse({
        ...valid,
        fields: { email: { sources: [] } },
      }),
    ).toThrow();
  });

  it('accepts a derived field with no sources', () => {
    expect(() =>
      EmployeeImportMappingSchema.parse({
        ...valid,
        fields: { business_group: { sources: [], deriveFrom: 'division' } },
      }),
    ).not.toThrow();
  });

  it('rejects a negative column index', () => {
    expect(() =>
      EmployeeImportMappingSchema.parse({
        ...valid,
        fields: { email: { sources: [{ index: -1 }] } },
      }),
    ).toThrow();
  });

  it('rejects an unrecognized version', () => {
    expect(() =>
      EmployeeImportMappingSchema.parse({ ...valid, version: 2 }),
    ).toThrow();
  });

  it('rejects an unknown deriveFrom field', () => {
    expect(() =>
      EmployeeImportMappingSchema.parse({
        ...valid,
        fields: { country: { sources: [], deriveFrom: 'nickname' } },
      }),
    ).toThrow();
  });
});
