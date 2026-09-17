/**
 * Normalizes the extracted contract/invoice number for display and export.
 *
 * The number lives at `contract.metadata.lineage.order_number`. Some records
 * store the literal string `"null"` (case-insensitive) or an empty string,
 * which should be treated as "no value".
 */
export function sanitizeOrderNumber(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === '' || str.toLowerCase() === 'null') return null;
  return str;
}

/**
 * Extraction stores order numbers inconsistently punctuated — a document's
 * "202.205-23" can land as "20220523" — so all order-number matching strips
 * non-alphanumerics from both sides before comparing.
 */
export const normalizeOrderNumber = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');
