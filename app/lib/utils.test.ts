import {
  removeKnownSuffixes,
  calculateVendorSimilarity,
  levenshteinDistance,
  jaccardIndex,
} from './utils';

describe('removeKnownSuffixes', () => {
  it('should remove standard suffixes', () => {
    expect(removeKnownSuffixes('Microsoft Corp')).toBe('microsoft');
    expect(removeKnownSuffixes('Apple Incorporated')).toBe('apple');
    expect(removeKnownSuffixes('Google LLC')).toBe('google');
    expect(removeKnownSuffixes('Test Company Ltd')).toBe('test');
    expect(removeKnownSuffixes('Example Solutions Inc')).toBe(
      'example solutions',
    );
    expect(removeKnownSuffixes('Systems Check INC')).toBe('systems check');
  });

  it('should handle names without suffixes', () => {
    expect(removeKnownSuffixes('Microsoft')).toBe('microsoft');
    expect(removeKnownSuffixes('Apple')).toBe('apple');
  });

  it('should handle names with multiple suffixes, stripping from end', () => {
    expect(removeKnownSuffixes('My Solutions Company Inc')).toBe(
      'my solutions',
    );
    expect(removeKnownSuffixes('My Company Inc Solutions')).toBe(
      'my company inc solutions',
    );
  });

  it('should handle suffixes with periods correctly', () => {
    expect(removeKnownSuffixes('Microsoft Corp.')).toBe('microsoft');
    expect(removeKnownSuffixes('Apple Inc.')).toBe('apple');
    expect(removeKnownSuffixes('Google L.L.C.')).toBe('google');
    expect(removeKnownSuffixes('Value Co.')).toBe('value');
  });

  it('should handle mixed case names', () => {
    expect(removeKnownSuffixes('MicROsoft cOrP')).toBe('microsoft');
  });

  it('should handle names with extra spaces and some punctuation', () => {
    expect(removeKnownSuffixes('  Microsoft Corp,  ')).toBe('microsoft');
    expect(removeKnownSuffixes('Microsoft  ; Corp')).toBe('microsoft');
  });

  it('should return an empty string for empty or invalid input', () => {
    expect(removeKnownSuffixes('')).toBe('');
    // @ts-expect-error testing invalid input
    expect(removeKnownSuffixes(null)).toBe('');
    // @ts-expect-error testing invalid input
    expect(removeKnownSuffixes(undefined)).toBe('');
  });

  it('should handle names that are only suffixes (normalized)', () => {
    expect(removeKnownSuffixes('Corp')).toBe('corp');
    expect(removeKnownSuffixes('Inc.')).toBe('inc');
    expect(removeKnownSuffixes('L.L.C.')).toBe('llc');
    expect(removeKnownSuffixes('International')).toBe('international');
    expect(removeKnownSuffixes('Inc Corp')).toBe('inc');
  });

  it('should preserve hyphens and apostrophes', () => {
    expect(removeKnownSuffixes("O'Malley - Group, Inc.")).toBe(
      "o'malley - group",
    );
    expect(removeKnownSuffixes('Tech-Solutions, L.P.')).toBe('tech-solutions');
    expect(removeKnownSuffixes('Global Systems & Services LLC')).toBe(
      'global systems services',
    );
  });

  it('should correctly handle words that are not suffixes', () => {
    expect(removeKnownSuffixes('The Solutions Company')).toBe('the solutions');
    expect(removeKnownSuffixes('First International Group')).toBe(
      'first international group',
    );
    expect(removeKnownSuffixes('Universal Exports Ltd')).toBe(
      'universal exports',
    );
  });
});

describe('levenshteinDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('test', 'test')).toBe(0);
  });
  it('should return the length of the other string if one is empty', () => {
    expect(levenshteinDistance('', 'test')).toBe(4);
    expect(levenshteinDistance('test', '')).toBe(4);
  });
  it('should calculate correct distance for simple cases', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('flaw', 'lawn')).toBe(2);
  });
});

describe('jaccardIndex', () => {
  it('should return 1 for identical sets of words', () => {
    expect(jaccardIndex('test string', 'test string')).toBe(1);
  });
  it('should return 0 if one string is empty and other is not', () => {
    expect(jaccardIndex('', 'test string')).toBe(0);
  });
  it('should return 1 if both strings are empty', () => {
    expect(jaccardIndex('', '')).toBe(1);
  });
  it('should calculate correct index for simple cases', () => {
    expect(
      jaccardIndex('the quick brown fox', 'the fast brown fox'),
    ).toBeCloseTo(0.6);
    expect(jaccardIndex('apple banana', 'apple orange')).toBeCloseTo(0.333, 3);
  });
});

describe('calculateVendorSimilarity', () => {
  const defaultWeights = { levenshtein: 0.7, jaccard: 0.3 };

  it('should return 1.0 combined score for identical names', () => {
    const result = calculateVendorSimilarity(
      'Microsoft',
      'Microsoft',
      defaultWeights,
    );
    expect(result.combinedScore).toBeCloseTo(1.0);
    expect(result.normalizedName1).toBe('microsoft');
  });

  it('should return high similarity for names differing only by common suffixes', () => {
    let result = calculateVendorSimilarity(
      'Microsoft Corp',
      'Microsoft Corporation',
      defaultWeights,
    );
    expect(result.combinedScore).toBeCloseTo(1.0);
    expect(result.normalizedName1).toBe('microsoft');
    expect(result.normalizedName2).toBe('microsoft');

    result = calculateVendorSimilarity('Apple Inc.', 'Apple', defaultWeights);
    expect(result.combinedScore).toBeCloseTo(1.0);
    expect(result.normalizedName1).toBe('apple');
    expect(result.normalizedName2).toBe('apple');

    result = calculateVendorSimilarity(
      'Google LLC',
      'Google Company',
      defaultWeights,
    );
    expect(result.normalizedName1).toBe('google');
    expect(result.normalizedName2).toBe('google');
    expect(result.combinedScore).toBeCloseTo(1.0);
  });

  it('should handle punctuation and casing differences leading to high similarity', () => {
    const result = calculateVendorSimilarity(
      'Tech-Solutions, L.P.',
      'tech-solutions lp',
      defaultWeights,
    );
    expect(result.combinedScore).toBeCloseTo(1.0);
    expect(result.normalizedName1).toBe('tech-solutions');
    expect(result.normalizedName2).toBe('tech-solutions');
  });

  it('should score reasonably for significant but related variations', () => {
    const result = calculateVendorSimilarity(
      'International Business Machines',
      'IBM Corp',
      defaultWeights,
    );
    expect(result.normalizedName1).toBe('international business machines');
    expect(result.normalizedName2).toBe('ibm');
    const lDist = levenshteinDistance('international business machines', 'ibm');
    const lSim = 1 - lDist / 'international business machines'.length;
    const jSim = jaccardIndex('international business machines', 'ibm');
    const expectedScore =
      lSim * defaultWeights.levenshtein + jSim * defaultWeights.jaccard;
    expect(result.combinedScore).toBeCloseTo(expectedScore, 2);
  });

  it('should provide specific example scores from issue with new suffix list', () => {
    let res = calculateVendorSimilarity(
      'Microsoft Corp',
      'Microsoft Corporation',
    );
    expect(res.combinedScore).toBeCloseTo(1.0);

    res = calculateVendorSimilarity('IBM International', 'IBM Corp');
    expect(res.combinedScore).toBeCloseTo(1.0);
    expect(res.normalizedName1).toBe('ibm');
    expect(res.normalizedName2).toBe('ibm');

    res = calculateVendorSimilarity('Apple Inc.', 'Apple Incorporated');
    expect(res.combinedScore).toBeCloseTo(1.0);

    res = calculateVendorSimilarity(
      'Google LLC',
      'Google Limited Liability Company',
    );
    expect(res.combinedScore).toBeCloseTo(1.0);
    expect(res.normalizedName1).toBe('google');
    expect(res.normalizedName2).toBe('google');
  });

  it('should return low score for completely different names', () => {
    const result = calculateVendorSimilarity(
      'Apple Pie',
      'Banana Split',
      defaultWeights,
    );
    const lDist = levenshteinDistance('apple pie', 'banana split');
    const lSim = 1 - lDist / 'banana split'.length;
    const jSim = jaccardIndex('apple pie', 'banana split');
    const expectedScore =
      lSim * defaultWeights.levenshtein + jSim * defaultWeights.jaccard;
    expect(result.combinedScore).toBeCloseTo(expectedScore, 2);
  });

  it('should handle empty strings gracefully', () => {
    let result = calculateVendorSimilarity('', 'Test', defaultWeights);
    expect(result.combinedScore).toBe(0);
    result = calculateVendorSimilarity('Test', '', defaultWeights);
    expect(result.combinedScore).toBe(0);
    result = calculateVendorSimilarity('', '', defaultWeights);
    expect(result.combinedScore).toBe(0);
  });

  it('should handle names where one normalizes to a valid name and other is a suffix', () => {
    const result = calculateVendorSimilarity(
      'Inc.',
      'Microsoft',
      defaultWeights,
    );
    expect(result.normalizedName1).toBe('inc');
    expect(result.normalizedName2).toBe('microsoft');
    expect(result.combinedScore).toBeCloseTo(0.078, 3);
  });
});
