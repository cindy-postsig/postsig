import { excelDateToIso } from './date-values';

type RichTextCell = { richText: { text?: string }[] };
type HyperlinkCell = { text?: unknown; hyperlink?: unknown };
type FormulaCell = { result?: unknown };
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Normalizes any value exceljs or csv-parse can hand back into a string.
 *
 * exceljs cells are not always primitives: an emailed HR export typically
 * carries mailto-linked email cells (`{ text, hyperlink }`) and styled cells
 * (`{ richText }`), both of which stringify to "[object Object]" if passed
 * straight to String().
 */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number')
    return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return String(value);
  if (value instanceof Date) return excelDateToIso(value);

  if (isRecord(value)) {
    if ('error' in value) return '';
    if (Array.isArray((value as RichTextCell).richText)) {
      return (value as RichTextCell).richText
        .map((part) => part?.text ?? '')
        .join('')
        .trim();
    }
    if ('text' in value) return cellToString((value as HyperlinkCell).text);
    if ('result' in value) return cellToString((value as FormulaCell).result);
    if ('hyperlink' in value) {
      return cellToString((value as HyperlinkCell).hyperlink).replace(
        /^mailto:/i,
        '',
      );
    }
  }

  return '';
}

/**
 * The HR file uses a literal 0 in the code column to mean "this level does not
 * apply" — e.g. Department code 0 means the employee has no department, so the
 * whole Department field must be left blank rather than imported as "0 - ".
 */
export function isZeroLike(value: unknown): boolean {
  const str = cellToString(value);
  if (str === '') return false;
  return /^0+(?:\.0+)?$/.test(str);
}
