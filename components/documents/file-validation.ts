export const MAX_INDIVIDUAL_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_ZIP_FILE_SIZE = 5 * 1024 * 1024 * 1024;

export const SUPPORTED_EXTENSIONS = ['.pdf', '.zip', '.csv', '.xlsx'] as const;
export const SUPPORTED_MIME_TYPES = new Set<string>([
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const IGNORED_FILE_NAMES = new Set<string>([
  '.ds_store',
  'thumbs.db',
  'desktop.ini',
]);

export function isZipFile(file: File): boolean {
  if (file.type === 'application/zip') return true;
  if (file.type === 'application/x-zip-compressed') return true;
  return file.name.toLowerCase().endsWith('.zip');
}

export function isSupportedFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  if (SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  return SUPPORTED_MIME_TYPES.has(file.type);
}

export type ClassifyResult =
  | { kind: 'ready'; file: File }
  | { kind: 'unsupported'; file: File }
  | { kind: 'error'; file: File; message: string }
  | { kind: 'empty'; file: File }
  | { kind: 'duplicate'; file: File };

export function classifyFile(
  file: File,
  existingNames: Set<string>,
): ClassifyResult {
  if (!isSupportedFile(file)) return { kind: 'unsupported', file };
  if (file.size === 0) return { kind: 'empty', file };
  if (existingNames.has(file.name)) return { kind: 'duplicate', file };
  if (isZipFile(file)) {
    if (file.size > MAX_ZIP_FILE_SIZE) {
      return { kind: 'error', file, message: 'ZIP file exceeds the 5GB limit' };
    }
  } else if (file.size > MAX_INDIVIDUAL_FILE_SIZE) {
    return { kind: 'error', file, message: 'Exceeds 50MB limit' };
  }
  return { kind: 'ready', file };
}
