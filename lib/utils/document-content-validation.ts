import { detectFileType } from '@/utils/file-type';

const PDF_MIME = 'application/pdf';
const CFB_MIME = 'application/x-cfb';
const XLS_MIME = 'application/vnd.ms-excel';
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CSV_MIME = 'text/csv';

/**
 * MIME resolved from the bytes, keyed by the type the caller declared.
 *
 * A declared type is only ever confirmed, never widened: an entry here says
 * "these bytes may back that claim", so a PDF cannot be relabelled a
 * spreadsheet by sniffing alone.
 */
const SNIFFED_MIME_BY_DECLARED: Record<string, ReadonlySet<string>> = {
  [PDF_MIME]: new Set([PDF_MIME]),
  [XLS_MIME]: new Set([CFB_MIME]),
  [XLSX_MIME]: new Set([XLSX_MIME]),
};

export interface DocumentContentValidation {
  /** Whether the bytes corroborate the declared type. */
  accepted: boolean;
  /** What the bytes actually sniffed as, for diagnostics on rejection. */
  sniffedMimeType?: string;
}

/**
 * CSV and other plain text carry no magic signature, so a genuine one sniffs as
 * nothing at all. That makes the NUL-byte scan the only thing separating it
 * from a binary payload whose own signature is likewise unrecognised.
 */
function validateCsv(
  content: Uint8Array,
  sniffed: string | undefined,
): DocumentContentValidation {
  if (sniffed !== undefined) {
    return { accepted: false, sniffedMimeType: sniffed };
  }
  return { accepted: !content.includes(0) };
}

/**
 * Whether an uploaded document's bytes corroborate the type declared for it.
 *
 * The declared type reaches the pipeline from the upload request, so it is a
 * claim rather than a fact; only the bytes settle it. Pure: no I/O, storage or
 * logging.
 */
export async function validateDocumentContent(
  declaredMimeType: string,
  content: Uint8Array,
): Promise<DocumentContentValidation> {
  const sniffed = (await detectFileType(content))?.mime;

  if (declaredMimeType === CSV_MIME) return validateCsv(content, sniffed);

  const allowed = SNIFFED_MIME_BY_DECLARED[declaredMimeType];
  if (!allowed) return { accepted: false, sniffedMimeType: sniffed };
  if (sniffed === undefined) return { accepted: false };
  return { accepted: allowed.has(sniffed), sniffedMimeType: sniffed };
}
