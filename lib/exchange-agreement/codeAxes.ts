/**
 * Cross-checks an Exchange Agreement product's name against its product code.
 *
 * A Euronext product code encodes the same facts its description spells out, so
 * the two can be read independently and compared. A disagreement means one of
 * them is wrong — a transposed or mis-OCR'd code that exact matching would
 * otherwise accept, silently attaching a contract line to the wrong product.

 */

export type UseCategory =
  | 'TRADING PLATFORM'
  | 'BROKING/AGENTS'
  | 'OTHER'
  | 'ORIGINAL CREATED WORKS';

export type CustomerCategory =
  | 'RESTRICTED - PREMIUM'
  | 'RESTRICTED BASIC'
  | 'ENTERPRISE';

export type CodeAxis = 'use' | 'cat';

export interface DecodedAxes {
  use: UseCategory | null;
  cat: CustomerCategory | null;
}

export interface ReconciledAxes extends DecodedAxes {
  /** Axes where the name and the code disagree outright. */
  conflicts: CodeAxis[];
}

/**
 * The code's SUFFIX (after the first hyphen) encodes use-category and customer-
 * category. Longest key first, so `TPL` is tested before any shorter prefix.
 *
 * The PREFIX is deliberately not decoded: it is SKU-like and inconsistent —
 * `ECB1` is Level 1 but `ECB10` is Level 2 — so reading market or depth out of it
 * would be guesswork.
 */
const CODE_USE: ReadonlyArray<readonly [string, UseCategory]> = [
  ['TPL', 'TRADING PLATFORM'],
  ['OCW', 'ORIGINAL CREATED WORKS'],
  ['BA', 'BROKING/AGENTS'],
  ['OU', 'OTHER'],
];

/** Reads the two axes out of a product description. */
export function decodeAxesFromName(name: string): DecodedAxes {
  const value = name ?? '';

  let use: UseCategory | null = null;
  if (/trading platform/i.test(value)) use = 'TRADING PLATFORM';
  else if (/broking\/agents/i.test(value)) use = 'BROKING/AGENTS';
  else if (/other use/i.test(value)) use = 'OTHER';
  else if (/created works/i.test(value)) use = 'ORIGINAL CREATED WORKS';

  let cat: CustomerCategory | null = null;
  if (/restricted\s*[- ]\s*premium/i.test(value)) cat = 'RESTRICTED - PREMIUM';
  else if (/restricted basic|restricted\b/i.test(value))
    cat = 'RESTRICTED BASIC';
  else if (/enterprise/i.test(value)) cat = 'ENTERPRISE';

  return { use, cat };
}

/**
 * Reads the same two axes out of a product code — an independent second read,
 * used only to cross-check {@link decodeAxesFromName}.
 */
export function decodeAxesFromCode(code: string): DecodedAxes {
  const value = code ?? '';
  const hyphen = value.indexOf('-');
  const suffix = hyphen === -1 ? value : value.slice(hyphen + 1);

  const match = CODE_USE.find(([key]) => suffix.startsWith(key));
  return {
    use: match ? match[1] : null,
    // The only customer category these codes are known to encode.
    cat: suffix.includes('RU') ? 'RESTRICTED BASIC' : null,
  };
}

/**
 * Merges the name and code reads. A code read fills an axis the name missed;
 * agreement raises confidence; an outright disagreement is **surfaced, never
 * silently resolved** — the caller decides what to do with it.
 */
export function reconcileAxes(
  fromName: DecodedAxes,
  fromCode: DecodedAxes,
): ReconciledAxes {
  const conflicts: CodeAxis[] = [];
  if (fromName.use && fromCode.use && fromName.use !== fromCode.use) {
    conflicts.push('use');
  }
  if (fromName.cat && fromCode.cat && fromName.cat !== fromCode.cat) {
    conflicts.push('cat');
  }
  return {
    use: fromName.use ?? fromCode.use,
    cat: fromName.cat ?? fromCode.cat,
    conflicts,
  };
}

/**
 * Convenience wrapper: decode both sides of one product line and reconcile.
 * Returns no conflicts when either side is missing — absence is not disagreement.
 */
export function crossCheckProductCode(
  name: string,
  code?: string | null,
): ReconciledAxes {
  if (!code) {
    const fromName = decodeAxesFromName(name);
    return { ...fromName, conflicts: [] };
  }
  return reconcileAxes(decodeAxesFromName(name), decodeAxesFromCode(code));
}
