import {
  cleanCompanyName,
  cleanFundName,
  calculateEntitySimilarity,
  findBestMatch,
  compressForComparison,
  MIN_SIMILARITY_SCORE,
  HIGH_SIMILARITY_SCORE,
  EXACT_SIMILARITY_SCORE,
} from '../matching';

describe('Entity Matching Utilities', () => {
  describe('cleanCompanyName', () => {
    it('should convert to lowercase and remove legal suffixes', () => {
      expect(cleanCompanyName('Acme Corporation, Inc.')).toBe('acme');
      expect(cleanCompanyName('Acme Corp')).toBe('acme');
      expect(cleanCompanyName('ACME INTERNATIONAL LLC')).toBe('acme');
    });

    it('should handle multiple trailing suffixes', () => {
      expect(cleanCompanyName('Acme Holdings Group Ltd')).toBe('acme');
      expect(cleanCompanyName('Tech Solutions Company Inc')).toBe('tech');
    });

    it('should preserve core company name', () => {
      expect(cleanCompanyName('Apple Inc.')).toBe('apple');
      expect(cleanCompanyName('Microsoft Corporation')).toBe('microsoft');
      expect(cleanCompanyName('Google LLC')).toBe('google');
    });

    it('should handle names with hyphens and apostrophes', () => {
      expect(cleanCompanyName("Ben & Jerry's Inc")).toBe("ben jerry's");
      expect(cleanCompanyName('Hewlett-Packard Company')).toBe(
        'hewlett-packard',
      );
    });

    it('should return empty string for invalid input', () => {
      expect(cleanCompanyName('')).toBe('');
      expect(cleanCompanyName(null as unknown as string)).toBe('');
      expect(cleanCompanyName(undefined as unknown as string)).toBe('');
    });

    it('should handle names that are only suffixes', () => {
      expect(cleanCompanyName('Inc')).toBe('inc');
      expect(cleanCompanyName('LLC')).toBe('llc');
    });

    it('should normalize whitespace', () => {
      expect(cleanCompanyName('  Acme   Corp  ')).toBe('acme');
      expect(cleanCompanyName('Acme\t\nInc')).toBe('acme');
    });
  });

  describe('cleanFundName', () => {
    it('should normalize L.P./LP variations', () => {
      expect(cleanFundName('Acme Ventures Fund III, L.P.')).toBe(
        'acme ventures fund iii',
      );
      expect(cleanFundName('Acme Ventures Fund III LP')).toBe(
        'acme ventures fund iii',
      );
      expect(cleanFundName('Acme Ventures Fund III Limited Partnership')).toBe(
        'acme ventures fund iii',
      );
    });

    it('should preserve fund numbers (roman numerals)', () => {
      expect(cleanFundName('Growth Fund I')).toBe('growth fund i');
      expect(cleanFundName('Growth Fund II')).toBe('growth fund ii');
      expect(cleanFundName('Growth Fund III')).toBe('growth fund iii');
      expect(cleanFundName('Growth Fund IV')).toBe('growth fund iv');
      expect(cleanFundName('Growth Fund V')).toBe('growth fund v');
    });

    it('should preserve fund numbers (arabic numerals)', () => {
      expect(cleanFundName('Growth Fund 1')).toBe('growth fund 1');
      expect(cleanFundName('Growth Fund 2')).toBe('growth fund 2');
      expect(cleanFundName('Growth Fund 3')).toBe('growth fund 3');
    });

    it('should convert to lowercase', () => {
      expect(cleanFundName('ACME VENTURES FUND III')).toBe(
        'acme ventures fund iii',
      );
    });

    it('should remove fund-specific suffixes', () => {
      // Note: 'partners' is also a suffix, so it gets removed
      expect(cleanFundName('Venture Partners LP')).toBe('venture');
      expect(cleanFundName('Seed Fund LLP')).toBe('seed fund');
    });

    it('should return empty string for invalid input', () => {
      expect(cleanFundName('')).toBe('');
      expect(cleanFundName(null as unknown as string)).toBe('');
      expect(cleanFundName(undefined as unknown as string)).toBe('');
    });

    it('should handle LLC variations', () => {
      expect(cleanFundName('Tech Fund L.L.C.')).toBe('tech fund');
      expect(cleanFundName('Tech Fund LLC')).toBe('tech fund');
    });
  });

  describe('calculateEntitySimilarity', () => {
    describe('company similarity', () => {
      it('should return exact score for identical names', () => {
        const result = calculateEntitySimilarity(
          'Acme Corporation',
          'Acme Corporation',
          'company',
        );
        expect(result.combinedScore).toBe(EXACT_SIMILARITY_SCORE);
      });

      it('should return exact score for names differing only in legal suffix', () => {
        const result = calculateEntitySimilarity(
          'Acme Inc',
          'Acme Corporation',
          'company',
        );
        expect(result.combinedScore).toBe(EXACT_SIMILARITY_SCORE);
      });

      it('should return moderate score for names with typos', () => {
        const result = calculateEntitySimilarity(
          'Acme Ventuers',
          'Acme Ventures',
          'company',
        );
        // Typos reduce similarity - may be below threshold for auto-match
        expect(result.combinedScore).toBeGreaterThan(0.5);
        expect(result.combinedScore).toBeLessThan(1.0);
      });

      it('should return low score for different names', () => {
        const result = calculateEntitySimilarity(
          'Acme Corporation',
          'Zenith Industries',
          'company',
        );
        expect(result.combinedScore).toBeLessThan(MIN_SIMILARITY_SCORE);
      });

      it('should return 0 for empty names', () => {
        const result = calculateEntitySimilarity('', 'Acme', 'company');
        expect(result.combinedScore).toBe(0);
      });
    });

    describe('fund similarity', () => {
      it('should return exact score for identical fund names', () => {
        const result = calculateEntitySimilarity(
          'Growth Fund III',
          'Growth Fund III',
          'fund',
        );
        expect(result.combinedScore).toBe(EXACT_SIMILARITY_SCORE);
      });

      it('should return exact score for LP variations', () => {
        const result = calculateEntitySimilarity(
          'Acme Ventures Fund III, L.P.',
          'Acme Ventures Fund III LP',
          'fund',
        );
        expect(result.combinedScore).toBe(EXACT_SIMILARITY_SCORE);
      });

      it('should distinguish different fund numbers', () => {
        const result = calculateEntitySimilarity(
          'Growth Fund III',
          'Growth Fund IV',
          'fund',
        );
        expect(result.combinedScore).toBeLessThan(EXACT_SIMILARITY_SCORE);
        expect(result.combinedScore).toBeGreaterThan(0.5);
      });

      it('should return good score for typos in firm name', () => {
        const result = calculateEntitySimilarity(
          'Acme Ventuers Fund III',
          'Acme Ventures Fund III',
          'fund',
        );
        // Typos reduce similarity but should still be above minimum threshold
        expect(result.combinedScore).toBeGreaterThan(MIN_SIMILARITY_SCORE);
      });
    });

    it('should return cleaned names in result', () => {
      const result = calculateEntitySimilarity(
        'Acme Corporation, Inc.',
        'Acme LLC',
        'company',
      );
      expect(result.cleanedName1).toBe('acme');
      expect(result.cleanedName2).toBe('acme');
    });

    it('should return individual similarity scores', () => {
      const result = calculateEntitySimilarity(
        'Acme Corp',
        'Acme LLC',
        'company',
      );
      expect(result.levenshteinSimilarity).toBeDefined();
      expect(result.jaccardSimilarity).toBeDefined();
      expect(result.levenshteinSimilarity).toBeGreaterThanOrEqual(0);
      expect(result.levenshteinSimilarity).toBeLessThanOrEqual(1);
      expect(result.jaccardSimilarity).toBeGreaterThanOrEqual(0);
      expect(result.jaccardSimilarity).toBeLessThanOrEqual(1);
    });
  });

  describe('findBestMatch', () => {
    const companies = [
      { id: 1, name: 'Acme Corporation' },
      { id: 2, name: 'Zenith Industries' },
      { id: 3, name: 'Global Tech Solutions' },
      { id: 4, name: 'Beta Holdings' },
    ];

    const funds = [
      { id: 1, name: 'Seed Fund I' },
      { id: 2, name: 'Seed Fund II' },
      { id: 3, name: 'Seed Fund III' },
      { id: 4, name: 'Growth Partners LP' },
    ];

    describe('exact matching', () => {
      it('should find exact match on cleaned name', () => {
        const result = findBestMatch(
          'Acme Corporation Inc',
          companies,
          'company',
        );
        expect(result.match?.id).toBe(1);
        expect(result.isExactMatch).toBe(true);
        expect(result.hasTies).toBe(false);
      });

      it('should detect ties when multiple exact matches exist', () => {
        const duplicates = [
          { id: 1, name: 'Acme Inc' },
          { id: 2, name: 'Acme Corporation' },
        ];
        const result = findBestMatch('Acme LLC', duplicates, 'company');
        expect(result.match).toBeNull();
        expect(result.hasTies).toBe(true);
        expect(result.tiedEntities?.length).toBe(2);
      });
    });

    describe('fuzzy matching', () => {
      it('should find similar match when no exact match', () => {
        // "Acme Corp" cleans to "acme", "Acme Corporation" also cleans to "acme"
        // So this is an exact match on cleaned names
        const result = findBestMatch('Acme Corp', companies, 'company');
        expect(result.match?.id).toBe(1);
        expect(result.isExactMatch).toBe(true);
      });

      it('should return null when no match above threshold', () => {
        const result = findBestMatch(
          'Completely Different Name',
          companies,
          'company',
        );
        expect(result.match).toBeNull();
        expect(result.hasTies).toBe(false);
      });

      it('should detect ties when multiple candidates have identical scores', () => {
        // Both clean to "acme" which is identical, so this is an exact tie
        const similar = [
          { id: 1, name: 'Acme Inc' },
          { id: 2, name: 'Acme Corp' },
        ];
        const result = findBestMatch('Acme LLC', similar, 'company');
        expect(result.hasTies).toBe(true);
      });
    });

    describe('fund matching', () => {
      it('should match fund with LP variation', () => {
        const result = findBestMatch('Seed Fund I, L.P.', funds, 'fund');
        expect(result.match?.id).toBe(1);
      });

      it('should distinguish different fund numbers', () => {
        const result = findBestMatch('Seed Fund II', funds, 'fund');
        expect(result.match?.id).toBe(2);
      });

      it('should not match very different fund names', () => {
        const singleFund = [{ id: 1, name: 'Alpha Ventures Fund I' }];
        const result = findBestMatch(
          'Zenith Growth Partners II',
          singleFund,
          'fund',
        );
        expect(result.match).toBeNull();
      });
    });

    describe('compressed (space-insensitive) matching', () => {
      it('should match a concatenated filename name to a spaced DB name', () => {
        const result = findBestMatch(
          'ABCInc',
          [{ id: 1, name: 'ABC Inc' }],
          'company',
        );
        expect(result.match?.id).toBe(1);
        expect(result.isExactMatch).toBe(true);
        expect(result.hasTies).toBe(false);
      });

      it('should match AcmeCorp to Acme Corporation', () => {
        const result = findBestMatch(
          'AcmeCorp',
          [{ id: 1, name: 'Acme Corporation' }],
          'company',
        );
        expect(result.match?.id).toBe(1);
        expect(result.isExactMatch).toBe(true);
      });

      it('should still not match unrelated concatenated names', () => {
        const result = findBestMatch(
          'ABCInc',
          [{ id: 1, name: 'XYZ Inc' }],
          'company',
        );
        expect(result.match).toBeNull();
      });

      it('should detect ties when multiple candidates compress to the same form', () => {
        const result = findBestMatch(
          'ABCInc',
          [
            { id: 1, name: 'ABC Inc' },
            { id: 2, name: 'ABC LLC' },
          ],
          'company',
        );
        expect(result.match).toBeNull();
        expect(result.hasTies).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle empty candidates array', () => {
        const result = findBestMatch('Acme', [], 'company');
        expect(result.match).toBeNull();
        expect(result.hasTies).toBe(false);
      });

      it('should handle candidates with null names', () => {
        const withNull = [
          { id: 1, name: null as unknown as string },
          { id: 2, name: 'Acme Corp' },
        ];
        const result = findBestMatch('Acme', withNull, 'company');
        expect(result.match?.id).toBe(2);
      });

      it('should handle empty input name', () => {
        const result = findBestMatch('', companies, 'company');
        expect(result.match).toBeNull();
      });

      it('should respect custom threshold', () => {
        const result = findBestMatch(
          'Acme Corporaton',
          companies,
          'company',
          0.99, // very high threshold
        );
        expect(result.match).toBeNull();
      });
    });
  });

  describe('compressForComparison', () => {
    it('should match spaced and unspaced forms of the same name', () => {
      expect(compressForComparison('ABC Inc')).toBe(
        compressForComparison('ABCInc'),
      );
      expect(compressForComparison('Acme Corp')).toBe(
        compressForComparison('AcmeCorp'),
      );
      // Both compress to "techsolutions" — only the trailing "llc" is stripped
      expect(compressForComparison('Tech Solutions LLC')).toBe(
        compressForComparison('TechSolutionsLLC'),
      );
    });

    it('should strip only the single trailing suffix from the compressed form', () => {
      expect(compressForComparison('ABCInc')).toBe('abc');
      expect(compressForComparison('AcmeCorp')).toBe('acme');
      // Only "llc" is stripped — "solutions" is preserved to avoid false matches
      expect(compressForComparison('TechSolutionsLLC')).toBe('techsolutions');
    });

    it('should handle already-spaced names the same as cleanCompanyName core', () => {
      expect(compressForComparison('ABC Inc')).toBe('abc');
      expect(compressForComparison('Acme Corporation')).toBe('acme');
    });

    it('should strip a single trailing suffix', () => {
      expect(compressForComparison('AcmeHoldings')).toBe('acme');
    });

    it('should return empty string for invalid input', () => {
      expect(compressForComparison('')).toBe('');
      expect(compressForComparison(null)).toBe('');
    });

    it('should not strip a suffix that is the entire name', () => {
      // Name is only a suffix word — keep it rather than returning empty
      expect(compressForComparison('Inc')).toBe('inc');
    });
  });

  describe('threshold constants', () => {
    it('should have correct threshold values', () => {
      expect(MIN_SIMILARITY_SCORE).toBe(0.75);
      expect(HIGH_SIMILARITY_SCORE).toBe(0.9);
      expect(EXACT_SIMILARITY_SCORE).toBe(1.0);
    });

    it('should have thresholds in correct order', () => {
      expect(MIN_SIMILARITY_SCORE).toBeLessThan(HIGH_SIMILARITY_SCORE);
      expect(HIGH_SIMILARITY_SCORE).toBeLessThan(EXACT_SIMILARITY_SCORE);
    });
  });
});
