import { parse } from 'csv-parse/sync';
import {
  VendorWhitelistEntry,
  CSVVendorEntry,
  CSVValidationResult,
  CSVVendorEntrySchema,
  VendorWhitelistEntrySchema,
} from './types';
import logger from '@/utils/pino';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ENTRIES = 1000;

export class CSVParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CSVParseError';
  }
}

function validateEmail(email: string): boolean {
  if (email.startsWith('*@')) {
    return /^\*@[\w\-.]+\.\w+$/.test(email);
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, '').slice(0, 255);
}

export function validateCSVFile(file: File): void {
  if (!file.name.endsWith('.csv')) {
    throw new CSVParseError('File must be a .csv file');
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new CSVParseError(
      `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    );
  }

  if (file.type && !['text/csv', 'application/csv'].includes(file.type)) {
    throw new CSVParseError('Invalid file MIME type. Expected text/csv');
  }
}

export async function parseVendorWhitelistCSV(
  content: string,
): Promise<CSVValidationResult> {
  let records: unknown[];

  try {
    records = parse(content, {
      columns: true,
      skipEmptyLines: true,
      trim: true,
      bom: true,
    });
  } catch (error) {
    logger.error({ error }, 'CSV parsing failed');
    throw new CSVParseError(
      `Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  if (records.length === 0) {
    throw new CSVParseError('CSV file is empty');
  }

  if (records.length > MAX_ENTRIES) {
    throw new CSVParseError(
      `CSV contains ${records.length} entries. Maximum allowed is ${MAX_ENTRIES}`,
    );
  }

  const result: CSVValidationResult = {
    valid: [],
    invalid: [],
    duplicates: [],
  };

  const seenEmails = new Set<string>();

  records.forEach((record, index) => {
    const rowNumber = index + 2;

    const parseResult = CSVVendorEntrySchema.safeParse(record);
    if (!parseResult.success) {
      result.invalid.push({
        row: rowNumber,
        data: record,
        errors: parseResult.error.issues.map((e) => e.message),
      });
      return;
    }

    const csvEntry: CSVVendorEntry = parseResult.data;
    const sanitizedEmail = sanitizeInput(csvEntry.email.toLowerCase());
    const sanitizedVendorName = csvEntry.vendor_name
      ? sanitizeInput(csvEntry.vendor_name)
      : undefined;

    if (!validateEmail(sanitizedEmail)) {
      result.invalid.push({
        row: rowNumber,
        data: record,
        errors: [
          'Invalid email format. Use valid email or domain wildcard (e.g., *@example.com)',
        ],
      });
      return;
    }

    if (seenEmails.has(sanitizedEmail)) {
      result.duplicates.push(sanitizedEmail);
      return;
    }

    seenEmails.add(sanitizedEmail);

    const entry: VendorWhitelistEntry = {
      email: sanitizedEmail,
      vendorName: sanitizedVendorName,
      addedAt: new Date().toISOString(),
    };

    const validationResult = VendorWhitelistEntrySchema.safeParse(entry);
    if (validationResult.success) {
      result.valid.push(validationResult.data);
    } else {
      result.invalid.push({
        row: rowNumber,
        data: record,
        errors: validationResult.error.issues.map((e) => e.message),
      });
    }
  });

  logger.info(
    {
      totalRecords: records.length,
      validCount: result.valid.length,
      invalidCount: result.invalid.length,
      duplicatesCount: result.duplicates.length,
    },
    'CSV parsing completed',
  );

  return result;
}

export function formatCSVErrors(result: CSVValidationResult): string {
  const errors: string[] = [];

  if (result.invalid.length > 0) {
    errors.push(
      `Invalid entries (${result.invalid.length}):`,
      ...result.invalid.map(
        (inv) => `  Row ${inv.row}: ${inv.errors.join(', ')}`,
      ),
    );
  }

  if (result.duplicates.length > 0) {
    errors.push(
      `Duplicate emails (${result.duplicates.length}):`,
      ...result.duplicates.map((dup) => `  ${dup}`),
    );
  }

  return errors.join('\n');
}
