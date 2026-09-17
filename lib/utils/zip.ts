import logger from '@/utils/pino';
import * as unzipper from 'unzipper';
import { validateZipEntry } from './zip-content-validation';

export const MAX_ZIP_DEPTH = 5;
export const MAX_ZIP_FILES = 10_000;
export const MAX_ZIP_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB

interface ExtractionBudget {
  totalFiles: number;
  totalBytes: number;
}

function getMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    txt: 'text/plain',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    tiff: 'image/tiff',
    tif: 'image/tiff',
    zip: 'application/zip',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

export interface ExtractedFile {
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  content: Buffer;
  newFilePath?: string;
}

function shouldSkipEntry(file: { type: string; path: string }): boolean {
  if (file.type === 'Directory') return true;
  const segments = file.path.split('/');
  return segments.some((s) => s === '__MACOSX' || s.startsWith('.'));
}

function parseEntryFileName(path: string): string | null {
  const segments = path.replace(/\/+$/, '').split('/');
  if (segments.some((s) => s === '__MACOSX' || s.startsWith('.'))) return null;
  const fileName = segments[segments.length - 1];
  if (!fileName) return null;
  return fileName;
}

async function safeExtractNested(
  content: Buffer,
  fileName: string,
  folderPath: string,
  depth: number,
  budget: ExtractionBudget,
): Promise<ExtractedFile[]> {
  try {
    return await extractZipFiles(
      content,
      folderPath,
      fileName,
      depth + 1,
      budget,
    );
  } catch (err) {
    const filePath = `${folderPath}/${fileName}`;
    logger.error(
      { fileName, filePath, err },
      'Failed to extract nested ZIP, skipping',
    );
    return [];
  }
}

function buildExtractedFile(
  fileName: string,
  folderPath: string,
  fileType: string,
  content: Buffer,
): ExtractedFile {
  return {
    fileName,
    filePath: `${folderPath}/${fileName}`,
    fileType,
    fileSize: content.length,
    content,
  };
}

async function processZipEntry(
  content: Buffer,
  fileName: string,
  folderPath: string,
  depth: number,
  budget: ExtractionBudget,
): Promise<ExtractedFile[]> {
  const validation = await validateZipEntry(fileName, content);

  if (validation.recursionEligible) {
    return safeExtractNested(content, fileName, folderPath, depth, budget);
  }

  if (!validation.accepted || !validation.mimeType) {
    logger.warn(
      {
        fileName,
        fileType: getMimeType(fileName),
        sniffedFileType: validation.sniffedMimeType,
      },
      'Skipping unsupported file type extracted from ZIP',
    );
    return [];
  }

  return [
    buildExtractedFile(fileName, folderPath, validation.mimeType, content),
  ];
}

export async function extractZipFiles(
  zipBuffer: Buffer,
  basePath: string,
  zipFileName: string,
  depth: number = 0,
  budget: ExtractionBudget = { totalFiles: 0, totalBytes: 0 },
): Promise<ExtractedFile[]> {
  if (depth >= MAX_ZIP_DEPTH) {
    logger.warn(
      { zipFileName, depth },
      'Max ZIP nesting depth reached, skipping',
    );
    return [];
  }

  const extractedFiles: ExtractedFile[] = [];
  const folderPath = `${basePath}/${zipFileName.replace(/\.zip$/i, '')}`;
  const directory = await unzipper.Open.buffer(zipBuffer);

  for (const file of directory.files) {
    if (shouldSkipEntry(file)) continue;

    if (budget.totalFiles >= MAX_ZIP_FILES) {
      logger.warn({ zipFileName }, 'Extraction file count budget exceeded');
      break;
    }

    if (budget.totalBytes >= MAX_ZIP_BYTES) {
      logger.warn({ zipFileName }, 'Extraction byte budget exceeded');
      break;
    }

    const content = await file.buffer();
    if (content.length === 0) {
      logger.warn({ fileName: file.path }, 'Skipping empty file in ZIP');
      continue;
    }

    budget.totalBytes += content.length;

    const fileName = parseEntryFileName(file.path);
    if (!fileName) continue;

    const entries = await processZipEntry(
      content,
      fileName,
      folderPath,
      depth,
      budget,
    );
    budget.totalFiles += entries.length;
    extractedFiles.push(...entries);
  }

  return extractedFiles;
}

/**
 * Process a ZIP file
 */
export async function processZipFiles(
  fileBuffer: Uint8Array,
  fileName: string,
  filePath: string,
): Promise<ExtractedFile[]> {
  try {
    const basePath = filePath.substring(0, filePath.lastIndexOf('/'));

    const files = await extractZipFiles(
      Buffer.from(fileBuffer),
      basePath,
      fileName,
    );

    logger.info(
      { zipFileName: fileName, fileCount: files.length },
      'ZIP file extracted successfully',
    );

    return files;
  } catch (e) {
    logger.error({ e, filePath, fileName }, 'ZIP extraction failed');
    throw e;
  }
}
