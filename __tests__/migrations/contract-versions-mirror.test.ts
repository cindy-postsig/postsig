import * as fs from 'fs';
import * as path from 'path';

const TYPES_PATH = path.join(__dirname, '../../database.types.ts');

/**
 * Columns that legitimately live only on `contracts` and should not be
 * mirrored onto `contract_versions`. Add to this set deliberately.
 *
 * - contract_search: a Postgres function exposed as a virtual column on
 *   `contracts`. Not a real column; it can't be inserted.
 */
const CONTRACTS_ONLY_EXCLUDES = new Set<string>(['contract_search']);

function extractRowColumns(source: string, table: string): Set<string> {
  const tableHeader = new RegExp(`^      ${table}: \\{$`, 'm');
  const headerMatch = tableHeader.exec(source);
  if (!headerMatch) {
    throw new Error(`Could not find table block for "${table}"`);
  }

  const afterHeader = source.slice(headerMatch.index + headerMatch[0].length);
  const rowStart = afterHeader.indexOf('Row: {');
  if (rowStart === -1) {
    throw new Error(`Could not find Row block for "${table}"`);
  }

  const rowBody = afterHeader.slice(rowStart + 'Row: {'.length);
  const rowEnd = rowBody.indexOf('\n        };');
  if (rowEnd === -1) {
    throw new Error(`Could not find end of Row block for "${table}"`);
  }

  const block = rowBody.slice(0, rowEnd);
  const columns = new Set<string>();
  for (const line of block.split('\n')) {
    const m = line.match(/^\s{10}([a-z_][a-z0-9_]*)\s*:/);
    if (m) columns.add(m[1]);
  }
  return columns;
}

describe('contract_versions mirrors contracts schema', () => {
  let contractsCols: Set<string>;
  let versionsCols: Set<string>;

  beforeAll(() => {
    const source = fs.readFileSync(TYPES_PATH, 'utf-8');
    contractsCols = extractRowColumns(source, 'contracts');
    versionsCols = extractRowColumns(source, 'contract_versions');
  });

  it('parses non-empty column sets from database.types.ts', () => {
    expect(contractsCols.size).toBeGreaterThan(50);
    expect(versionsCols.size).toBeGreaterThan(50);
  });

  it('every contracts column exists on contract_versions', () => {
    const missing: string[] = [];
    for (const col of contractsCols) {
      if (CONTRACTS_ONLY_EXCLUDES.has(col)) continue;
      if (!versionsCols.has(col)) missing.push(col);
    }

    if (missing.length > 0) {
      throw new Error(
        `contract_versions is missing columns present on contracts: ` +
          `${missing.join(', ')}.\n` +
          `Add a migration mirroring these columns onto contract_versions, ` +
          `or — if intentional — add them to CONTRACTS_ONLY_EXCLUDES in this test.`,
      );
    }
  });

  it('CONTRACTS_ONLY_EXCLUDES entries actually exist on contracts', () => {
    for (const col of CONTRACTS_ONLY_EXCLUDES) {
      expect(contractsCols.has(col)).toBe(true);
    }
  });
});
