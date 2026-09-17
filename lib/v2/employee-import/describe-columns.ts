import { cellToString } from './cell-value';
import { COLUMN_ALIASES } from './column-aliases';
import { indexToColumnLetter } from './column-letters';
import type {
  ColumnDescriptor,
  EmployeeImportMapping,
  ImportTargetField,
  SheetRow,
} from './types';

const MAX_SAMPLES = 3;

export function describeColumns(
  rows: SheetRow[],
  hasHeaderRow: boolean,
  columnCount: number,
): ColumnDescriptor[] {
  const headerRow = hasHeaderRow ? rows[0] : undefined;
  const dataRows = hasHeaderRow ? rows.slice(1) : rows;

  return Array.from({ length: columnCount }, (_, index) => {
    const samples: string[] = [];
    let nonEmptyCount = 0;

    for (const row of dataRows) {
      const value = cellToString(row[index]);
      if (value === '') continue;
      nonEmptyCount += 1;
      if (samples.length < MAX_SAMPLES) samples.push(value);
    }

    const header = headerRow ? cellToString(headerRow[index]) : '';

    return {
      index,
      letter: indexToColumnLetter(index),
      header: header === '' ? null : header,
      samples,
      nonEmptyCount,
    };
  });
}

/**
 * A header row is all text. A real data row in an HR export almost always
 * carries a date or a numeric code, so either one is decisive evidence that
 * row 1 is data — which is exactly the Berenberg case.
 */
export function guessHasHeaderRow(rows: SheetRow[]): boolean {
  const first = rows[0];
  if (!first) return false;

  for (const cell of first) {
    if (cell instanceof Date) return false;
    if (typeof cell === 'number') return false;
  }

  const aliasHits = first.filter((cell) => {
    const value = cellToString(cell).toLowerCase();
    return value !== '' && COLUMN_ALIASES[value] !== undefined;
  }).length;

  return aliasHits >= 2;
}

export function autoDetectMapping(
  columns: ColumnDescriptor[],
): EmployeeImportMapping['fields'] {
  const fields: EmployeeImportMapping['fields'] = {};
  const used = new Set<ImportTargetField>();

  for (const column of columns) {
    if (!column.header) continue;
    const match = COLUMN_ALIASES[column.header.trim().toLowerCase()];
    if (!match || used.has(match)) continue;
    fields[match] = { sources: [{ index: column.index }] };
    used.add(match);
  }

  return fields;
}
