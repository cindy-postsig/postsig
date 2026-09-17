/**
 * Removes the product code from an Exchange Agreement product description.
 *
 * The two document layouts put the code in opposite places — invoices and fee
 * schedules lead with it (`"DEQL2-BANDRU ENX Dublin Equities L2…"`), service
 * orders trail it in parentheses (`"Euronext Milan … (MAFFL2-OUNDRU)"`). Left in,
 * the same product's name reads differently on each document and cannot be
 * compared across them.
 *
 * Only the code is removed. The `ENX` marker and everything else stay verbatim,
 * because the extraction rules forbid normalising a copied field.
 */

/** Leading/trailing separator characters left behind by table extraction. */
const EDGE_CHARS = ' -|';

function trimEdges(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && EDGE_CHARS.includes(value[start])) start += 1;
  while (end > start && EDGE_CHARS.includes(value[end - 1])) end -= 1;
  return value.slice(start, end);
}

function startsWithWholeCode(name: string, code: string): boolean {
  if (!name.toUpperCase().startsWith(code.toUpperCase())) return false;
  const next = name[code.length];
  return next === undefined || /\s/.test(next);
}

/**
 * Strips `code` from either end of `name`, then trims separator debris.
 *
 * Returns the name unchanged when there is no code, when the code does not
 * appear at either end, or when removing it would leave nothing — a bare code
 * with no description is still better than an empty product name.
 */
export function stripProductCodeFromName(
  name: string,
  code?: string | null,
): string {
  const original = name ?? '';
  if (!code) return trimEdges(original) || original;

  const target = code.trim();
  if (!target) return trimEdges(original) || original;

  // Trim first: a table-extracted value can arrive as "| CODE - name |", where a
  // leading pipe would hide the code from the prefix test below.
  let stripped = trimEdges(original.trim());

  // Service order layout: "<description> (CODE)"
  const parenthesised = `(${target})`;
  if (stripped.endsWith(parenthesised)) {
    stripped = stripped.slice(0, -parenthesised.length);
  } else if (startsWithWholeCode(stripped, target)) {
    // Invoice / fee schedule layout: "CODE ENX <description>"
    stripped = stripped.slice(target.length);
  }

  const cleaned = trimEdges(stripped);
  return cleaned || trimEdges(original) || original;
}
