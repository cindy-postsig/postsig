jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('@/lib/v2/employee-import/mapping-store', () => ({
  getSavedImportMapping: jest.fn(async () => null),
}));

/** business_group org-unit nodes the import matches against */
type GroupRow = { id: number; name: string };
let groupRows: GroupRow[] = [];
const insertedGroups: string[] = [];
let nextId = 100;

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        order: () => builder,
        range: (from: number, to: number) =>
          Promise.resolve({ data: groupRows.slice(from, to + 1), error: null }),
        insert: (rows: Record<string, unknown>[]) => {
          for (const row of rows) {
            insertedGroups.push(String(row.name));
            groupRows.push({ id: nextId++, name: String(row.name) });
          }
          return Promise.resolve({ error: null });
        },
      });
      return builder;
    },
  }),
}));

/** Only the fields these tests assert on; the service sends the whole row. */
type ImportedRow = {
  last_name: string;
  business_group_node_id?: number;
  [key: string]: unknown;
};

const parseImportFile = jest.fn(
  async (_file: File, _sheetName?: string): Promise<ParsedSheet> => EMPTY_SHEET,
);
jest.mock('@/lib/v2/employee-import/parse-file', () => ({
  parseImportFile: (file: File, sheetName?: string) =>
    parseImportFile(file, sheetName),
}));

const addOrgEmployees = jest.fn(async (_rows: ImportedRow[]) => ({
  inserted: 0,
  updated: 0,
  skippedDuplicates: 0,
  errors: [],
}));
jest.mock('@/data/superuser/org-employees', () => ({
  addOrgEmployees: (rows: ImportedRow[]) => addOrgEmployees(rows),
}));

import { commitImport, previewImport } from '@/lib/v2/employee-import/service';
import type {
  EmployeeImportMapping,
  ParsedSheet,
} from '@/lib/v2/employee-import/types';

const ORG = 'org-1';
const FILE = new File([''], 'hr.csv');
const EMPTY_SHEET: ParsedSheet = {
  sheetNames: ['Sheet1'],
  sheetName: 'Sheet1',
  rows: [],
  columnCount: 0,
};

/** first, last, business group */
const ROWS = [
  ['Ada', 'Lovelace', 'Sales'],
  ['Bo', 'Chen', 'sales '],
  ['Cy', 'Diaz', 'EMEA Sales'],
  ['Di', 'Eze', 'Works Council'],
  ['El', 'Fox', ''],
];

function mapping(valueMap?: Record<string, string>): EmployeeImportMapping {
  return {
    version: 1,
    hasHeaderRow: false,
    fields: {
      first_name: { sources: [{ index: 0 }] },
      last_name: { sources: [{ index: 1 }] },
      business_group: { sources: [{ index: 2 }], valueMap },
    },
  };
}

function importedRows(): ImportedRow[] {
  return addOrgEmployees.mock.calls[0][0];
}

/** business_group_node_id per source row, keyed by last name. */
function groupIdsByEmployee(): Record<string, number | undefined> {
  return Object.fromEntries(
    importedRows().map((row) => [row.last_name, row.business_group_node_id]),
  );
}

beforeEach(() => {
  groupRows = [
    { id: 10, name: 'Sales' },
    { id: 11, name: 'Operations' },
  ];
  insertedGroups.length = 0;
  nextId = 100;
  addOrgEmployees.mockClear();
  parseImportFile.mockReset();
  parseImportFile.mockResolvedValue({
    sheetNames: ['Sheet1'],
    sheetName: 'Sheet1',
    rows: ROWS,
    columnCount: 3,
  });
});

describe('commitImport business groups', () => {
  it('links case and whitespace variants to the same existing node', async () => {
    await commitImport(ORG, FILE, mapping());

    const ids = groupIdsByEmployee();
    expect(ids.Lovelace).toBe(10);
    expect(ids.Chen).toBe(10);
  });

  // Nodes are created up front from the Business Group value map, so importing
  // must never create one — a name with no node simply imports without one.
  it('never creates a node, and imports unmatched names with none', async () => {
    await commitImport(ORG, FILE, mapping());

    expect(insertedGroups).toEqual([]);
    const ids = groupIdsByEmployee();
    expect(ids.Diaz).toBeUndefined();
    expect(ids.Eze).toBeUndefined();
  });

  it('imports a blank business group with no group and no error', async () => {
    await commitImport(ORG, FILE, mapping());

    // The row is present, so nothing was rejected for the blank cell.
    expect(importedRows().map((row) => row.last_name)).toContain('Fox');
    expect(groupIdsByEmployee().Fox).toBeUndefined();
  });

  it('links through a value map onto an existing group', async () => {
    await commitImport(ORG, FILE, mapping({ 'works council': 'Operations' }));

    expect(insertedGroups).toEqual([]);
    expect(groupIdsByEmployee().Eze).toBe(11);
  });
});

describe('previewImport business groups', () => {
  it("reports only names that match no group, in the file's spelling", async () => {
    const response = await previewImport(ORG, FILE, mapping());

    expect(response.preview?.unresolvedBusinessGroups).toEqual([
      'EMEA Sales',
      'Works Council',
    ]);
    // Matched variants must not be listed, or the admin is asked to hand-map
    // names that already resolve.
    expect(response.preview?.unresolvedBusinessGroups).not.toContain('Sales');
  });

  it('never creates a group while previewing', async () => {
    await previewImport(ORG, FILE, mapping());
    expect(insertedGroups).toEqual([]);
  });

  it('drops a name once it is mapped onto an existing group', async () => {
    const response = await previewImport(
      ORG,
      FILE,
      mapping({ 'works council': 'Operations' }),
    );
    expect(response.preview?.unresolvedBusinessGroups).toEqual(['EMEA Sales']);
  });

  // The whole point of saving the mapping: a value map built once keeps
  // resolving on later imports with no further confirmation step.
  it('reuses a saved value map on a later import with nothing to confirm', async () => {
    const saved = mapping({ 'works council': 'Operations' });

    const response = await previewImport(ORG, FILE, saved);
    expect(response.preview?.unresolvedBusinessGroups).toEqual(['EMEA Sales']);

    await commitImport(ORG, FILE, saved);
    expect(groupIdsByEmployee().Eze).toBe(11);
    expect(insertedGroups).toEqual([]);
  });

  it('does not report business groups as unmapped values', async () => {
    const response = await previewImport(ORG, FILE, mapping());
    expect(response.preview?.unmappedValues.business_group).toBeUndefined();
  });
});

// Reported from manual testing: an existing group "BG1" and a CSV cell "bg1".
describe('differently-cased existing group', () => {
  beforeEach(() => {
    groupRows = [{ id: 42, name: 'BG1' }];
    parseImportFile.mockResolvedValue({
      sheetNames: ['Sheet1'],
      sheetName: 'Sheet1',
      rows: [['Ada', 'Lovelace', 'bg1']],
      columnCount: 3,
    });
  });

  it('is not reported as unmatched in the preview', async () => {
    const response = await previewImport(ORG, FILE, mapping());
    expect(response.preview?.unresolvedBusinessGroups).toEqual([]);
  });

  // Without this the preview showed "bg1" and said nothing, which is
  // indistinguishable from the column having been dropped.
  it('reports the match so the preview can show bg1 → BG1', async () => {
    const response = await previewImport(ORG, FILE, mapping());
    expect(response.preview?.matchedBusinessGroups).toEqual([
      { source: 'bg1', group: 'BG1' },
    ]);
  });

  it('links the employee to the existing group without creating one', async () => {
    await commitImport(ORG, FILE, mapping());
    expect(insertedGroups).toEqual([]);
    expect(groupIdsByEmployee().Lovelace).toBe(42);
  });
});
