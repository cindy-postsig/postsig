/**
 * A value that spreadsheet apps may execute when it is the first character of
 * a cell. `\t` and `\r` matter because Excel strips them and then evaluates
 * whatever follows.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * A bare numeric literal — `-12.5`, `+3`, `1e-9`. These start with a trigger
 * but cannot be formulas, and prefixing them would turn every negative amount
 * in every export into left-aligned text that no longer sums.
 */
const NUMERIC_LITERAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Prefixes cells starting with a formula trigger (=, +, -, @, tab, CR) with a
 * single quote so spreadsheet apps render them as text instead of executing
 * them (CSV injection). Export-only — never apply to in-app display values.
 */
export function escapeSpreadsheetCell(value: string): string {
  if (!FORMULA_TRIGGER.test(value) || NUMERIC_LITERAL.test(value)) {
    return value;
  }
  return `'${value}`;
}

/**
 * Renders one value as a complete, quoted CSV field: formula-escaped, with
 * embedded quotes doubled so the value cannot break out of its cell. For
 * exports that assemble CSV lines by hand instead of going through
 * `stringifyCsv`.
 */
export function csvField(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  return `"${escapeSpreadsheetCell(text).replace(/"/g, '""')}"`;
}
