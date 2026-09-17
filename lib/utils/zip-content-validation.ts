import * as unzipper from 'unzipper';
import { detectFileType } from '@/utils/file-type';

const PDF_MIME = 'application/pdf';
const ZIP_MIME = 'application/zip';
const CFB_MIME = 'application/x-cfb';
const XLS_MIME = 'application/vnd.ms-excel';
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CSV_MIME = 'text/csv';

const OOXML_MARKER = '[Content_Types].xml';

export interface ZipEntryValidation {
  /** Whether the entry may be kept as an extracted file. */
  accepted: boolean;
  /** Whether the entry is a plain archive that may be recursed into. */
  recursionEligible: boolean;
  /** MIME type to store for an accepted entry. */
  mimeType?: string;
  /** What the bytes actually sniffed as, for diagnostics on rejection. */
  sniffedMimeType?: string;
}

function reject(sniffedMimeType?: string): ZipEntryValidation {
  return { accepted: false, recursionEligible: false, sniffedMimeType };
}

function accept(
  mimeType: string,
  sniffedMimeType?: string,
): ZipEntryValidation {
  return {
    accepted: true,
    recursionEligible: false,
    mimeType,
    sniffedMimeType,
  };
}

function getExtension(fileName: string): string {
  const segments = fileName.toLowerCase().split('.');
  return segments.length > 1 ? (segments[segments.length - 1] ?? '') : '';
}

/**
 * Whether an archive carries the OOXML marker part, which distinguishes an
 * Office package from a plain ZIP. Unreadable archives report false.
 */
async function hasOoxmlMarker(content: Buffer): Promise<boolean> {
  try {
    const directory = await unzipper.Open.buffer(content);
    return directory.files.some((file) => file.path === OOXML_MARKER);
  } catch {
    return false;
  }
}

/**
 * `file-type` resolves an Office package to its specific MIME when the
 * `[Content_Types].xml` part declares the matching Override, and falls back to
 * `application/zip` when it does not. Both shapes are genuine spreadsheets, so
 * acceptance covers the specific MIME and the generic-archive-plus-marker case.
 */
async function validateXlsx(
  content: Buffer,
  sniffed: string | undefined,
): Promise<ZipEntryValidation> {
  if (sniffed === XLSX_MIME) return accept(XLSX_MIME, sniffed);
  if (sniffed !== ZIP_MIME) return reject(sniffed);
  return (await hasOoxmlMarker(content))
    ? accept(XLSX_MIME, sniffed)
    : reject(sniffed);
}

/**
 * CSV has no magic signature, so a genuine one sniffs as nothing at all. That
 * makes the NUL-byte scan the only thing separating it from a binary payload
 * whose own signature is likewise unrecognised.
 */
function validateCsv(
  content: Buffer,
  sniffed: string | undefined,
): ZipEntryValidation {
  if (sniffed !== undefined) return reject(sniffed);
  return content.includes(0) ? reject(sniffed) : accept(CSV_MIME, sniffed);
}

/** A plain archive may be recursed into; an Office package may not. */
async function validateZip(
  content: Buffer,
  sniffed: string | undefined,
): Promise<ZipEntryValidation> {
  if (sniffed !== ZIP_MIME) return reject(sniffed);
  if (await hasOoxmlMarker(content)) return reject(sniffed);
  return { accepted: false, recursionEligible: true, sniffedMimeType: sniffed };
}

/**
 * Decide whether a ZIP entry may be kept, based on its declared extension and
 * the bytes that back it. Pure: performs no I/O, storage or logging.
 */
export async function validateZipEntry(
  fileName: string,
  content: Buffer,
): Promise<ZipEntryValidation> {
  const sniffed = (await detectFileType(content))?.mime;

  switch (getExtension(fileName)) {
    case 'pdf':
      return sniffed === PDF_MIME ? accept(PDF_MIME, sniffed) : reject(sniffed);
    case 'xlsx':
      return validateXlsx(content, sniffed);
    case 'xls':
      return sniffed === CFB_MIME ? accept(XLS_MIME, sniffed) : reject(sniffed);
    case 'csv':
      return validateCsv(content, sniffed);
    case 'zip':
      return validateZip(content, sniffed);
    default:
      return reject(sniffed);
  }
}
