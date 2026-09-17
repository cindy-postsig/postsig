import logger from '@/utils/pino';

// Matching threshold constants
export const MIN_SIMILARITY_SCORE = 0.75;
export const HIGH_SIMILARITY_SCORE = 0.9;
export const EXACT_SIMILARITY_SCORE = 1.0;

// Similarity weights
const LEVENSHTEIN_WEIGHT = 0.7;
const JACCARD_WEIGHT = 0.3;

// Known company legal suffixes to remove during normalization
const COMPANY_SUFFIXES = new Set([
  'corp',
  'corporation',
  'inc',
  'incorporated',
  'llc',
  'ltd',
  'limited',
  'plc',
  'gmbh',
  'ag',
  'sas',
  'sarl',
  'lp',
  'llp',
  'co',
  'company',
  'liability',
  'international',
  'holdings',
  'group',
  'enterprises',
  'partners',
  'consulting',
  'services',
  'solutions',
  'technologies',
  'technology',
  'tech',
]);

// Fund-specific suffixes to remove
const FUND_SUFFIXES = new Set([
  'lp',
  'llp',
  'llc',
  'ltd',
  'limited',
  'partnership',
  'partners',
]);

export interface SimilarityResult {
  levenshteinSimilarity: number;
  jaccardSimilarity: number;
  combinedScore: number;
  cleanedName1: string;
  cleanedName2: string;
}

export interface MatchCandidate<T> {
  entity: T;
  similarity: SimilarityResult;
}

/**
 * Calculate Levenshtein distance between two strings.
 */
function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  if (!s1) return s2 ? s2.length : 0;
  if (!s2) return s1.length;

  const track = Array(s2.length + 1)
    .fill(null)
    .map(() => Array(s1.length + 1).fill(null));

  for (let i = 0; i <= s1.length; i += 1) {
    track[0][i] = i;
  }
  for (let j = 0; j <= s2.length; j += 1) {
    track[j][0] = j;
  }

  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator,
      );
    }
  }
  return track[s2.length][s1.length];
}

/**
 * Calculate Jaccard index between two strings based on word sets.
 */
function jaccardIndex(s1: string, s2: string): number {
  const words1 = s1.toLowerCase().split(/\s+/).filter(Boolean);
  const words2 = s2.toLowerCase().split(/\s+/).filter(Boolean);

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  if (set1.size === 0 && set2.size === 0) return 1.0;
  if (set1.size === 0 || set2.size === 0) return 0.0;

  let intersectionSize = 0;
  for (const item of Array.from(set1)) {
    if (set2.has(item)) {
      intersectionSize++;
    }
  }

  const unionSet = new Set([...words1, ...words2]);
  const unionSize = unionSet.size;

  if (unionSize === 0) return 1.0;

  return intersectionSize / unionSize;
}

/**
 * Clean and normalize a company name by:
 * - Converting to lowercase
 * - Removing punctuation (except hyphens and apostrophes within words)
 * - Removing known legal suffixes (Inc, Corp, LLC, Ltd, etc.)
 * - Trimming whitespace
 *
 * @example
 * cleanCompanyName("Acme Corporation, Inc.") // => "acme"
 * cleanCompanyName("ACME INTERNATIONAL LLC") // => "acme"
 * cleanCompanyName("Acme Corp") // => "acme"
 */
export function cleanCompanyName(name: string | null): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  let cleaned = name.toLowerCase();
  // Remove punctuation except hyphens and apostrophes within words
  cleaned = cleaned.replace(/[^a-z0-9\s'-]/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  if (!cleaned) {
    return '';
  }

  const words = cleaned.split(' ');
  if (words.length === 0) {
    return cleaned;
  }

  // Remove trailing suffixes
  let numWordsToKeep = words.length;
  while (numWordsToKeep > 1) {
    const currentWord = words[numWordsToKeep - 1].replace(/[.']/g, '');
    if (COMPANY_SUFFIXES.has(currentWord)) {
      numWordsToKeep--;
    } else {
      break;
    }
  }

  const result = words.slice(0, numWordsToKeep).join(' ').trim();
  return result.length > 0 ? result : cleaned;
}

/**
 * Produce a compressed, suffix-free form of a company name for space-insensitive matching.
 *
 * Unlike cleanCompanyName (which preserves spaces for Levenshtein/Jaccard scoring),
 * this function removes ALL non-alphanumeric characters so that names where spaces
 * were omitted (common in filenames) match their spaced counterparts in the database.
 *
 * Iteratively strips known legal suffixes from the end of the compressed string.
 *
 * @example
 * compressForComparison("ABC Inc")          // => "abc"
 * compressForComparison("ABCInc")           // => "abc"
 * compressForComparison("TechSolutionsLLC")   // => "techsolutions"  (only the trailing "llc" is stripped)
 * compressForComparison("Tech Solutions LLC") // => "techsolutions"
 */
export function compressForComparison(name: string | null): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  // Lowercase and strip all non-alphanumeric characters (removes spaces too)
  let compressed = name.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (!compressed) {
    return '';
  }

  // Strip at most one known suffix from the end.
  const sortedSuffixes = Array.from(COMPANY_SUFFIXES).sort(
    (a, b) => b.length - a.length,
  );

  for (const suffix of sortedSuffixes) {
    if (compressed.length > suffix.length && compressed.endsWith(suffix)) {
      compressed = compressed.slice(0, -suffix.length);
      break;
    }
  }

  return compressed;
}

/**
 * Clean and normalize a fund name by:
 * - Converting to lowercase
 * - Removing punctuation (except hyphens)
 * - Standardizing L.P./LP/Limited Partnership
 * - Preserving fund numbers (I, II, III, IV, 1, 2, 3, etc.)
 * - Removing common fund suffixes
 *
 * @example
 * cleanFundName("Acme Ventures Fund III, L.P.") // => "acme ventures fund iii"
 * cleanFundName("Acme Ventures Fund III LP") // => "acme ventures fund iii"
 * cleanFundName("ACME VENTURES FUND III") // => "acme ventures fund iii"
 */
export function cleanFundName(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  let cleaned = name.toLowerCase();

  // Normalize L.P. variations to lp
  cleaned = cleaned.replace(/l\.p\./g, 'lp');
  cleaned = cleaned.replace(/l\.l\.c\./g, 'llc');
  cleaned = cleaned.replace(/l\.l\.p\./g, 'llp');

  // Remove punctuation except hyphens
  cleaned = cleaned.replace(/[^a-z0-9\s-]/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  if (!cleaned) {
    return '';
  }

  const words = cleaned.split(' ');
  if (words.length === 0) {
    return cleaned;
  }

  // Remove trailing fund-specific suffixes but preserve fund numbers
  let numWordsToKeep = words.length;
  while (numWordsToKeep > 1) {
    const currentWord = words[numWordsToKeep - 1];
    // Keep arabic numerals (fund numbers like 1, 2, 3)
    if (/^\d+$/.test(currentWord)) {
      break;
    }
    // Keep valid roman numerals (I, II, III, IV, V, VI, VII, VIII, IX, X, etc.)
    // Use strict pattern to avoid matching suffixes like 'llc' that contain roman chars
    if (
      /^m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/.test(
        currentWord,
      ) &&
      currentWord.length > 0
    ) {
      break;
    }
    if (FUND_SUFFIXES.has(currentWord)) {
      numWordsToKeep--;
    } else {
      break;
    }
  }

  const result = words.slice(0, numWordsToKeep).join(' ').trim();
  return result.length > 0 ? result : cleaned;
}

/**
 * Calculate similarity between two entity names using Levenshtein (70%) + Jaccard (30%) weighted scoring.
 *
 * @param name1 - First entity name
 * @param name2 - Second entity name
 * @param type - Entity type ('company' | 'fund') to determine cleaning function
 * @returns SimilarityResult with individual and combined scores
 */
export function calculateEntitySimilarity(
  name1: string,
  name2: string,
  type: 'company' | 'fund',
): SimilarityResult {
  const cleanFn = type === 'company' ? cleanCompanyName : cleanFundName;

  const cleanedName1 = cleanFn(name1);
  const cleanedName2 = cleanFn(name2);

  if (!cleanedName1 || !cleanedName2) {
    return {
      levenshteinSimilarity: 0,
      jaccardSimilarity: 0,
      combinedScore: 0,
      cleanedName1: cleanedName1 || '',
      cleanedName2: cleanedName2 || '',
    };
  }

  // Calculate Levenshtein similarity
  const maxLength = Math.max(cleanedName1.length, cleanedName2.length);
  let levenshteinSimilarity = 0;
  if (maxLength > 0) {
    const distance = levenshteinDistance(cleanedName1, cleanedName2);
    levenshteinSimilarity = 1.0 - distance / maxLength;
  } else if (cleanedName1 === cleanedName2) {
    levenshteinSimilarity = 1.0;
  }

  // Calculate Jaccard similarity
  const jaccardSimilarity = jaccardIndex(cleanedName1, cleanedName2);

  // Combined weighted score
  const combinedScore =
    levenshteinSimilarity * LEVENSHTEIN_WEIGHT +
    jaccardSimilarity * JACCARD_WEIGHT;

  return {
    levenshteinSimilarity,
    jaccardSimilarity,
    combinedScore,
    cleanedName1,
    cleanedName2,
  };
}

export interface MatchResult<T> {
  match: T | null;
  isExactMatch: boolean;
  similarity: SimilarityResult | null;
  hasTies: boolean;
  tiedEntities?: T[];
}

/**
 * Find the best matching entity using a 3-step approach:
 * 1. Exact match on cleaned name
 * 2. ILIKE (case-insensitive) candidates
 * 3. Similarity search with combined Levenshtein + Jaccard scoring
 *
 * @param inputName - The name to match
 * @param candidates - Array of candidate entities with { id, name } properties
 * @param type - Entity type ('company' | 'fund')
 * @param minScore - Minimum similarity score threshold (default: MIN_SIMILARITY_SCORE)
 * @returns MatchResult with best match or null if no suitable match found
 */
export function findBestMatch<T extends { id: number; name: string | null }>(
  inputName: string,
  candidates: T[],
  type: 'company' | 'fund',
  minScore: number = MIN_SIMILARITY_SCORE,
): MatchResult<T> {
  const cleanFn = type === 'company' ? cleanCompanyName : cleanFundName;
  const cleanedInput = cleanFn(inputName);

  if (!cleanedInput) {
    return {
      match: null,
      isExactMatch: false,
      similarity: null,
      hasTies: false,
    };
  }

  // Filter out candidates with null/empty names
  const validCandidates = candidates.filter(
    (c) => c.name && c.name.trim() !== '',
  );

  if (validCandidates.length === 0) {
    return {
      match: null,
      isExactMatch: false,
      similarity: null,
      hasTies: false,
    };
  }

  // Step 1: Exact match on cleaned name
  const exactMatches = validCandidates.filter(
    (c) => cleanFn(c.name!) === cleanedInput,
  );

  if (exactMatches.length === 1) {
    const similarity = calculateEntitySimilarity(
      inputName,
      exactMatches[0].name!,
      type,
    );
    logger.debug(
      { inputName, matchedName: exactMatches[0].name, type },
      'Found exact match',
    );
    return {
      match: exactMatches[0],
      isExactMatch: true,
      similarity,
      hasTies: false,
    };
  }

  if (exactMatches.length > 1) {
    // Multiple exact matches - log warning and return as tie
    logger.warn(
      {
        inputName,
        matchCount: exactMatches.length,
        matches: exactMatches.map((m) => ({ id: m.id, name: m.name })),
        type,
      },
      'Multiple exact matches found, cannot auto-select',
    );
    return {
      match: null,
      isExactMatch: true,
      similarity: null,
      hasTies: true,
      tiedEntities: exactMatches,
    };
  }

  // Step 1.5: Compressed match — handles names where spaces were omitted in filenames
  // (e.g. "ABCInc" from a filename matches "ABC Inc" in the database).
  // compressForComparison strips all whitespace/punctuation and trailing suffixes,
  // making "ABCInc" and "ABC Inc" identical after compression.
  const compressedInput = compressForComparison(inputName);
  if (compressedInput) {
    const compressedMatches = validCandidates.filter(
      (c) => compressForComparison(c.name!) === compressedInput,
    );

    if (compressedMatches.length === 1) {
      const similarity = calculateEntitySimilarity(
        inputName,
        compressedMatches[0].name!,
        type,
      );
      logger.debug(
        { inputName, matchedName: compressedMatches[0].name, type },
        'Found compressed (space-insensitive) match',
      );
      return {
        match: compressedMatches[0],
        isExactMatch: true,
        similarity,
        hasTies: false,
      };
    }

    if (compressedMatches.length > 1) {
      logger.warn(
        {
          inputName,
          matchCount: compressedMatches.length,
          matches: compressedMatches.map((m) => ({ id: m.id, name: m.name })),
          type,
        },
        'Multiple compressed matches found, cannot auto-select',
      );
      return {
        match: null,
        isExactMatch: true,
        similarity: null,
        hasTies: true,
        tiedEntities: compressedMatches,
      };
    }
  }

  // Step 2: ILIKE candidates (case-insensitive partial match)
  const ilikePattern = cleanedInput.toLowerCase();
  const ilikeCandidates = validCandidates.filter((c) => {
    const cleanedCandidate = cleanFn(c.name!).toLowerCase();
    return (
      cleanedCandidate.includes(ilikePattern) ||
      ilikePattern.includes(cleanedCandidate)
    );
  });

  // If exactly one ILIKE match with high similarity, use it
  if (ilikeCandidates.length === 1) {
    const similarity = calculateEntitySimilarity(
      inputName,
      ilikeCandidates[0].name!,
      type,
    );
    if (similarity.combinedScore >= HIGH_SIMILARITY_SCORE) {
      logger.debug(
        {
          inputName,
          matchedName: ilikeCandidates[0].name,
          score: similarity.combinedScore,
          type,
        },
        'Found unique ILIKE match with high similarity',
      );
      return {
        match: ilikeCandidates[0],
        isExactMatch: false,
        similarity,
        hasTies: false,
      };
    }
  }

  // Step 3: Similarity search on all candidates (or ILIKE candidates if available)
  const searchCandidates =
    ilikeCandidates.length > 0 ? ilikeCandidates : validCandidates;

  const scored = searchCandidates
    .map((entity) => ({
      entity,
      similarity: calculateEntitySimilarity(inputName, entity.name!, type),
    }))
    .filter((s) => s.similarity.combinedScore >= minScore)
    .sort((a, b) => b.similarity.combinedScore - a.similarity.combinedScore);

  if (scored.length === 0) {
    logger.debug(
      { inputName, candidateCount: searchCandidates.length, minScore, type },
      'No candidates above similarity threshold',
    );
    return {
      match: null,
      isExactMatch: false,
      similarity: null,
      hasTies: false,
    };
  }

  // Check for ties at top score
  const topScore = scored[0].similarity.combinedScore;
  const ties = scored.filter((s) => s.similarity.combinedScore === topScore);

  if (ties.length === 1) {
    logger.debug(
      {
        inputName,
        matchedName: ties[0].entity.name,
        score: topScore,
        type,
      },
      'Found best similarity match',
    );
    return {
      match: ties[0].entity,
      isExactMatch: false,
      similarity: ties[0].similarity,
      hasTies: false,
    };
  }

  // Multiple entities tied for best score
  logger.warn(
    {
      inputName,
      tieCount: ties.length,
      topScore,
      tiedNames: ties.map((t) => t.entity.name),
      type,
    },
    'Multiple entities tied for best similarity score, cannot auto-select',
  );

  return {
    match: null,
    isExactMatch: false,
    similarity: null,
    hasTies: true,
    tiedEntities: ties.map((t) => t.entity),
  };
}
