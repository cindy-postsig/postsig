/**
 * Shared threshold for invoice discrepancy comparisons.
 *
 * Kept free of imports so client components can use it without pulling the
 * report pipeline (and its server-only dependencies) into the bundle.
 */

/**
 * Smallest gap that counts as a real billing discrepancy. The invoice totals are
 * compared unrounded, so prorating an indivisible fee leaves a remainder below a
 * cent — a $1,000 annual fee billed monthly expects $83.3333… against a billed
 * $83.33 — as does converting a non-USD fee. Those are artifacts of the
 * arithmetic, not something a vendor over-billed, so they must not open a row or
 * colour a cell as a mismatch.
 *
 * Half a cent, less slack for the double-precision error that accumulates across
 * the per-product division and summation: an exact half-cent gap computes as
 * 0.00499999999999545, which a bare `>= 0.005` would discard.
 */
export const MIN_DISCREPANCY = 0.005 - 1e-6;

/** True when two USD amounts differ by less than a reportable half-cent. */
export function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < MIN_DISCREPANCY;
}
