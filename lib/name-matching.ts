import { deburr } from 'lodash';

/**
 * Everything except letters, digits, combining marks, whitespace, apostrophe
 * and hyphen. Deliberately Unicode-aware: the ASCII `\w` class this replaces
 * deleted letters outright, collapsing "BØRS" to "brs".
 */
const DISALLOWED_CHARS = /[^\p{L}\p{N}\p{M}\s'-]/gu;

const HAS_ALPHANUMERIC = /[\p{L}\p{N}]/u;

/**
 * Comparison key for a name. Case-insensitive and punctuation-insensitive, but
 * never drops a letter, digit or mark, so two spellings of the same name always
 * produce the same key.
 *
 * Returns '' for names carrying no identity ("", "***", "---"). Callers must
 * treat '' as "no key": an empty key passed to `includes()` matches everything.
 */
export function toCompareKey(name: string): string {
  if (!name || typeof name !== 'string') return '';
  const key = name
    // Lowercase before normalising: toLowerCase can itself decompose
    // (İ -> i + U+0307), so NFC has to run afterwards to recompose.
    .toLowerCase()
    .normalize('NFC')
    .replace(DISALLOWED_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();
  return HAS_ALPHANUMERIC.test(key) ? key : '';
}

/**
 * Lossy transliteration key: "BØRS" and "BORS" both fold to "bors".
 *
 * Used only as a lower-precision matching tier, because the extraction model
 * intermittently ASCII-ifies non-ASCII names. NFD runs before `deburr` so
 * precomposed characters absent from lodash's table (Ǿ) decompose to one that
 * is present; Ø itself has no decomposition, which is why NFD alone is not
 * enough.
 */
export function toFoldKey(name: string): string {
  const key = toCompareKey(name);
  return key ? deburr(key.normalize('NFD')) : '';
}

export type NameMatchTier = 'exact' | 'folded' | 'word-overlap';

export type NameMatch<T> = {
  item: T;
  tier: NameMatchTier;
  /** More than one candidate matched at this tier; the first was taken. */
  ambiguous: boolean;
};

const WORD_OVERLAP_THRESHOLD = 0.7;

function wordOverlap(a: string, b: string): number {
  const words1 = a.split(' ').filter(Boolean);
  const words2 = b.split(' ').filter(Boolean);
  if (!words1.length || !words2.length) return 0;
  const intersection = words1.filter((word) => words2.includes(word));
  const union = new Set([...words1, ...words2]);
  return intersection.length / union.size;
}

export function findByName<T extends { name: string }>(
  items: T[],
  name: string,
): NameMatch<T> | undefined {
  const key = toCompareKey(name);
  if (!key) return undefined;
  const folded = toFoldKey(name);

  const candidates = items
    .map((item) => ({
      item,
      key: toCompareKey(item.name),
      folded: toFoldKey(item.name),
    }))
    .filter((candidate) => candidate.key);

  type Candidate = (typeof candidates)[number];
  const tiers: [NameMatchTier, (candidate: Candidate) => boolean][] = [
    ['exact', (candidate) => candidate.key === key],
    ['folded', (candidate) => candidate.folded === folded],
    [
      'word-overlap',
      (candidate) => wordOverlap(candidate.key, key) > WORD_OVERLAP_THRESHOLD,
    ],
  ];

  for (const [tier, predicate] of tiers) {
    const matches = candidates.filter(predicate);
    if (matches.length > 0) {
      return {
        item: matches[0].item,
        tier,
        ambiguous: matches.length > 1,
      };
    }
  }
  return undefined;
}
