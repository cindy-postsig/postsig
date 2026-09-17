import { fileTypeFromBuffer } from 'file-type';

export interface FileTypeResult {
  mime: string;
  ext: string;
}

/**
 * Detect file type from buffer using magic bytes
 */
export async function detectFileType(
  buffer: Uint8Array,
): Promise<FileTypeResult | undefined> {
  return fileTypeFromBuffer(buffer);
}

/**
 * Check if buffer represents a ZIP file
 */
export async function isZipFile(buffer: Uint8Array): Promise<boolean> {
  const type = await detectFileType(buffer);
  return type?.mime === 'application/zip';
}
