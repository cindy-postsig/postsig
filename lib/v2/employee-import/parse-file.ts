import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import type { ParsedSheet, SheetRow } from './types';

export class ImportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportParseError';
  }
}

export async function parseXlsxBuffer(
  buffer: ArrayBuffer,
  sheetName?: string,
): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (error) {
    throw new ImportParseError(
      `Could not read the Excel file: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }

  const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
  if (sheetNames.length === 0) {
    throw new ImportParseError('The Excel file has no sheets');
  }

  const worksheet = sheetName
    ? workbook.worksheets.find((sheet) => sheet.name === sheetName)
    : workbook.worksheets[0];

  if (!worksheet) {
    throw new ImportParseError(`Sheet "${sheetName}" not found in the file`);
  }

  const columnCount = worksheet.columnCount;
  const rows: SheetRow[] = [];

  worksheet.eachRow({ includeEmpty: true }, (row) => {
    // row.values is 1-indexed AND sparse: a row with data only in A and AD
    // yields an array with holes, so its length cannot be trusted. Read each
    // column position explicitly to get a dense row of a known width.
    const values = row.values as unknown[];
    const dense: SheetRow = new Array(columnCount);
    for (let i = 0; i < columnCount; i++) {
      dense[i] = values[i + 1] ?? null;
    }
    rows.push(dense);
  });

  while (rows.length > 0 && rows[rows.length - 1].every(isEmptyCell)) {
    rows.pop();
  }

  return {
    sheetNames,
    sheetName: worksheet.name,
    rows,
    columnCount,
  };
}

function isEmptyCell(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

export function parseCsvText(text: string): ParsedSheet {
  let records: string[][];
  try {
    records = parse(text, {
      skipEmptyLines: true,
      trim: true,
      bom: true,
      relaxColumnCount: true,
    }) as string[][];
  } catch (error) {
    throw new ImportParseError(
      `Could not parse the CSV file: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }

  const columnCount = records.reduce(
    (max, row) => Math.max(max, row.length),
    0,
  );
  const rows: SheetRow[] = records.map((row) =>
    Array.from({ length: columnCount }, (_, i) => row[i] ?? null),
  );

  return { sheetNames: [], sheetName: '', rows, columnCount };
}

function decodeCsv(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

export async function parseImportFile(
  file: File,
  sheetName?: string,
): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer();
  const isXlsx = file.name.toLowerCase().endsWith('.xlsx');

  const sheet = isXlsx
    ? await parseXlsxBuffer(buffer, sheetName)
    : parseCsvText(decodeCsv(buffer));

  if (sheet.rows.length === 0 || sheet.columnCount === 0) {
    throw new ImportParseError('The file appears to be empty');
  }

  return sheet;
}
