/**
 * Vercel rejects serverless request bodies above ~4.5 MB with a platform 413
 * that never reaches the handler, so cap below that to fail with a real
 * message instead. A 1,600-row HR workbook is around 200 KB.
 */
export const MAX_IMPORT_FILE_SIZE = 4 * 1024 * 1024;

const ALLOWED_EXTENSIONS = ['.csv', '.xlsx'] as const;

const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportFileError';
  }
}

export function validateImportFile(file: File): void {
  const name = file.name.toLowerCase();

  if (!ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    throw new ImportFileError('File must be a .csv or .xlsx file');
  }

  if (file.size === 0) {
    throw new ImportFileError('File is empty');
  }

  if (file.size > MAX_IMPORT_FILE_SIZE) {
    throw new ImportFileError(
      `File size exceeds maximum of ${MAX_IMPORT_FILE_SIZE / 1024 / 1024}MB`,
    );
  }

  // Browsers leave file.type empty for some xlsx uploads, so an absent type is
  // not evidence of a bad file — the extension check above already ran.
  if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new ImportFileError(
      `Invalid file type "${file.type}". Expected a CSV or Excel file`,
    );
  }
}
