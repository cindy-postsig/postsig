import { stringify, Options } from 'csv-stringify/sync';
import { escapeSpreadsheetCell } from './escape';

type CsvRecords = Parameters<typeof stringify>[0];

/**
 * `csv-stringify` with formula-injection escaping applied to every string cell.
 * Use this instead of importing `stringify` directly, so no export can emit a
 * user-controlled value that a spreadsheet app will execute.
 */
export function stringifyCsv(
  records: CsvRecords,
  options: Options = {},
): string {
  return stringify(records, {
    ...options,
    cast: {
      ...options.cast,
      string: (value) => escapeSpreadsheetCell(value),
    },
  });
}
