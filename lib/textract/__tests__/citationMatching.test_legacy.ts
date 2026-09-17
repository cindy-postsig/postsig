import { textractService } from '../index';
import { citationCoordinateService } from '../coordinateMatching';
import {
  TextractResult,
  TextractPage,
  TextractLine,
  TextractWord,
  TextractLayoutText,
  BoundingBox,
  CitationTextColumn,
  MatchingOptions,
} from '@/types/textract';

describe('Citation Matching Tests', () => {
  let mockTextractResult: TextractResult;

  beforeEach(() => {
    mockTextractResult = createMockTextractResult();
  });

  describe('TextractService - findCitationMatches', () => {
    it('should find exact line matches', async () => {
      const citationText = 'This is a test line from the document';
      const options: MatchingOptions = {
        strategy: 'exact',
        exactThreshold: 1.0,
      };

      const result = await textractService.findCitationMatches(
        mockTextractResult,
        citationText,
        options,
      );

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].matchType).toBe('exact-line');
      expect(result.matches[0].overallConfidence).toBe(1.0);
      expect(result.strategy).toBe('exact');
    });

    it('should find fuzzy line matches when exact fails', async () => {
      const citationText = 'This is a test line from the documnt'; // typo in 'document'
      const options: MatchingOptions = {
        strategy: 'multi-strategy',
        fuzzyThreshold: 0.8,
      };

      const result = await textractService.findCitationMatches(
        mockTextractResult,
        citationText,
        options,
      );

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].matchType).toBe('fuzzy-line');
      expect(result.matches[0].overallConfidence).toBeGreaterThan(0.8);
      expect(result.strategy).toBe('fuzzy');
    });

    it('should prefer preferred page matches', async () => {
      const citationText = 'This is a test line from the document';
      const options: MatchingOptions = {
        strategy: 'exact',
        preferredPage: 1,
      };

      const result = await textractService.findCitationMatches(
        mockTextractResult,
        citationText,
        options,
      );

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].page).toBe(1);
    });

    it('should handle empty citation text gracefully', async () => {
      const citationText = '';
      const options: MatchingOptions = {
        strategy: 'multi-strategy',
      };

      const result = await textractService.findCitationMatches(
        mockTextractResult,
        citationText,
        options,
      );

      expect(result.matches.length).toBe(0);
      expect(result.errors.length).toBe(0);
    });

    it('should use caching for repeated queries', async () => {
      const citationText = 'This is a test line from the document';
      const options: MatchingOptions = {
        strategy: 'exact',
      };

      const result1 = await textractService.findCitationMatches(
        mockTextractResult,
        citationText,
        options,
      );

      const result2 = await textractService.findCitationMatches(
        mockTextractResult,
        citationText,
        options,
      );

      expect(result1).toEqual(result2);
      expect(result2.processingTime).toBeLessThanOrEqual(
        result1.processingTime,
      );
    });
  });

  describe('TextractService - Word Count Matching', () => {
    it('should find exact word count matches with prefix strategy', async () => {
      const citationText = 'This is a test line';
      const options: MatchingOptions = {
        strategy: 'word-count',
        minWordCount: 5,
        wordCountStrategy: 'prefix',
        wordCountThreshold: 0.9,
      };

      const result = await textractService.findCitationMatches(
        mockTextractResult,
        citationText,
        options,
      );

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].matchType).toBe('word-count');
      expect(result.matches[0].overallConfidence).toBeGreaterThanOrEqual(0.9);
      expect(result.strategy).toBe('word-count');
    });

    it('should match first N words with prefix strategy', async () => {
      const citationText = 'This is a test completely different ending';
      const options: MatchingOptions = {
        strategy: 'word-count',
        minWordCount: 4,
        wordCountStrategy: 'prefix',
        wordCountThreshold: 0.8,
      };

      const result = await textractService.findCitationMatches(
        mockTextractResult,
        citationText,
        options,
      );

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].matchType).toBe('word-count');
      expect(result.matches[0].matchedLines[0].matchedText).toContain(
        'this is a test',
      );
    });

    it('should use word count as priority in multi-strategy', async () => {
      const citationText = 'This is a test different ending';
      const options: MatchingOptions = {
        strategy: 'multi-strategy',
        minWordCount: 4,
        wordCountStrategy: 'prefix',
        wordCountThreshold: 0.8,
      };

      const result = await textractService.findCitationMatches(
        mockTextractResult,
        citationText,
        options,
      );

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.strategy).toBe('word-count');
      expect(result.matches[0].matchType).toBe('word-count');
    });

    it('should fallback to other strategies when word count fails', async () => {
      const citationText = 'Completely different text that should not match';
      const options: MatchingOptions = {
        strategy: 'multi-strategy',
        minWordCount: 5,
        wordCountStrategy: 'prefix',
        wordCountThreshold: 0.95,
        fuzzyThreshold: 0.3, // Lower threshold to ensure fallback
      };

      const result = await textractService.findCitationMatches(
        mockTextractResult,
        citationText,
        options,
      );

      expect(result.strategy).not.toBe('word-count');
    });

    it('should handle any-sequence word count strategy', async () => {
      const citationText = 'test line from the document';
      const options: MatchingOptions = {
        strategy: 'word-count',
        minWordCount: 4,
        wordCountStrategy: 'any-sequence',
        wordCountThreshold: 0.8,
      };

      const result = await textractService.findCitationMatches(
        mockTextractResult,
        citationText,
        options,
      );

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].matchType).toBe('word-count');
    });

    it('should handle citation shorter than minWordCount', async () => {
      const citationText = 'This is';
      const options: MatchingOptions = {
        strategy: 'word-count',
        minWordCount: 5,
        wordCountStrategy: 'prefix',
        wordCountThreshold: 0.9,
      };

      const result = await textractService.findCitationMatches(
        mockTextractResult,
        citationText,
        options,
      );

      expect(result.matches.length).toBe(0);
    });

    it('should ignore word count strategy when minWordCount is not specified', async () => {
      const citationText = 'This is a test line';
      const options: MatchingOptions = {
        strategy: 'multi-strategy',
        wordCountStrategy: 'prefix',
        wordCountThreshold: 0.9,
      };

      const result = await textractService.findCitationMatches(
        mockTextractResult,
        citationText,
        options,
      );

      expect(result.strategy).not.toBe('word-count');
      expect(['exact', 'line-boundary']).toContain(result.strategy);
    });
  });

  describe('CitationCoordinateService - Enhanced Matching', () => {
    it('should process citations with new multi-strategy approach', async () => {
      const citationGroups: CitationTextColumn = [
        {
          id: 'test-group',
          content: [
            {
              id: 'citation-1',
              pageNumber: 1,
              citationText: 'This is a test line from the document',
            },
            {
              id: 'citation-2',
              pageNumber: 2,
              citationText: 'Another test line with different content',
            },
          ],
        },
      ];

      const result =
        await citationCoordinateService.matchCitationsToCoordinates(
          citationGroups,
          mockTextractResult,
          0.7,
        );

      expect(result.length).toBe(1);
      expect(result[0].content.length).toBe(2);

      const firstCitation = result[0].content[0];
      expect(firstCitation.boundingBox).toBeDefined();
      expect(firstCitation.confidence).toBeDefined();
      expect(firstCitation.matchType).toBeDefined();
    });

    it('should handle invalid citations gracefully', async () => {
      const citationGroups: CitationTextColumn = [
        {
          id: 'test-group',
          content: [
            {
              id: 'citation-1',
              pageNumber: 1,
              citationText: '', // empty citation
            },
            {
              id: 'citation-2',
              pageNumber: 2,
              citationText: 'a', // too short
            },
          ],
        },
      ];

      const result =
        await citationCoordinateService.matchCitationsToCoordinates(
          citationGroups,
          mockTextractResult,
          0.7,
        );

      expect(result.length).toBe(1);
      expect(result[0].content.length).toBe(2);

      // Should return original citations unchanged
      expect(result[0].content[0].boundingBox).toBeUndefined();
      expect(result[0].content[1].boundingBox).toBeUndefined();
    });

    it('should use word count options when provided', async () => {
      const citationGroups: CitationTextColumn = [
        {
          id: 'test-group',
          content: [
            {
              id: 'citation-1',
              pageNumber: 1,
              citationText: 'This is a test completely different ending',
            },
          ],
        },
      ];

      const wordCountOptions = {
        minWordCount: 4,
        wordCountStrategy: 'prefix' as const,
        wordCountThreshold: 0.8,
      };

      const result =
        await citationCoordinateService.matchCitationsToCoordinates(
          citationGroups,
          mockTextractResult,
          0.7,
          wordCountOptions,
        );

      expect(result.length).toBe(1);
      expect(result[0].content.length).toBe(1);

      const firstCitation = result[0].content[0];
      expect(firstCitation.boundingBox).toBeDefined();
      expect(firstCitation.confidence).toBeDefined();
      expect(firstCitation.matchType).toBe('partial'); // mapped from word-count
    });
  });

  describe('Performance and Caching', () => {
    it('should provide cache statistics', () => {
      const stats = textractService.getCacheStats();

      expect(stats).toHaveProperty('processingCache');
      expect(stats).toHaveProperty('similarityCache');
      expect(stats).toHaveProperty('textNormalizationCache');
      expect(typeof stats.processingCache).toBe('number');
    });

    it('should clear caches successfully', () => {
      textractService.clearCache();
      const stats = textractService.getCacheStats();

      expect(stats.processingCache).toBe(0);
      expect(stats.similarityCache).toBe(0);
      expect(stats.textNormalizationCache).toBe(0);
    });
  });
});

function createMockTextractResult(): TextractResult {
  const mockBoundingBox: BoundingBox = {
    left: 0.1,
    top: 0.1,
    width: 0.8,
    height: 0.05,
  };

  const mockWords: TextractWord[] = [
    {
      id: 'word-1',
      text: 'This',
      confidence: 0.99,
      boundingBox: { left: 0.1, top: 0.1, width: 0.05, height: 0.02 },
      page: 1,
      lineId: 'line-1',
    },
    {
      id: 'word-2',
      text: 'is',
      confidence: 0.99,
      boundingBox: { left: 0.16, top: 0.1, width: 0.02, height: 0.02 },
      page: 1,
      lineId: 'line-1',
    },
    {
      id: 'word-3',
      text: 'a',
      confidence: 0.99,
      boundingBox: { left: 0.19, top: 0.1, width: 0.02, height: 0.02 },
      page: 1,
      lineId: 'line-1',
    },
    {
      id: 'word-4',
      text: 'test',
      confidence: 0.99,
      boundingBox: { left: 0.22, top: 0.1, width: 0.04, height: 0.02 },
      page: 1,
      lineId: 'line-1',
    },
    {
      id: 'word-5',
      text: 'line',
      confidence: 0.99,
      boundingBox: { left: 0.27, top: 0.1, width: 0.04, height: 0.02 },
      page: 1,
      lineId: 'line-1',
    },
    {
      id: 'word-6',
      text: 'from',
      confidence: 0.99,
      boundingBox: { left: 0.32, top: 0.1, width: 0.04, height: 0.02 },
      page: 1,
      lineId: 'line-1',
    },
    {
      id: 'word-7',
      text: 'the',
      confidence: 0.99,
      boundingBox: { left: 0.37, top: 0.1, width: 0.03, height: 0.02 },
      page: 1,
      lineId: 'line-1',
    },
    {
      id: 'word-8',
      text: 'document',
      confidence: 0.99,
      boundingBox: { left: 0.41, top: 0.1, width: 0.08, height: 0.02 },
      page: 1,
      lineId: 'line-1',
    },
  ];

  const mockLines: TextractLine[] = [
    {
      id: 'line-1',
      text: 'This is a test line from the document',
      words: mockWords,
      boundingBox: mockBoundingBox,
      page: 1,
    },
    {
      id: 'line-2',
      text: 'Another test line with different content',
      words: [], // Simplified for testing
      boundingBox: { left: 0.1, top: 0.2, width: 0.8, height: 0.05 },
      page: 2,
    },
  ];

  const mockLayouts: TextractLayoutText[] = [
    {
      id: 'layout-1',
      childIds: ['line-1'],
      boundingBox: mockBoundingBox,
      page: 1,
    },
    {
      id: 'layout-2',
      childIds: ['line-2'],
      boundingBox: { left: 0.1, top: 0.2, width: 0.8, height: 0.05 },
      page: 2,
    },
  ];

  const mockPages: TextractPage[] = [
    {
      number: 1,
      lines: [mockLines[0]],
      words: mockWords,
      layouts: [mockLayouts[0]],
    },
    {
      number: 2,
      lines: [mockLines[1]],
      words: [],
      layouts: [mockLayouts[1]],
    },
  ];

  return {
    pages: mockPages,
    fullText:
      'This is a test line from the document\n\nAnother test line with different content',
  };
}

describe('transformTextractToSimplified', () => {
  it('should transform TextractResult to SimplifiedTextractResult correctly', () => {
    const mockTextractResult = createMockTextractResult();
    const simplified =
      textractService.transformToSimplified(mockTextractResult);

    expect(simplified).toBeDefined();
    expect(simplified.pages).toHaveLength(2);

    const expectedBoundingBox = {
      left: 0.1,
      top: 0.1,
      width: 0.8,
      height: 0.05,
    };

    expect(simplified.pages[0].number).toBe(1);
    expect(simplified.pages[0].layouts).toHaveLength(1);
    expect(simplified.pages[0].layouts[0].id).toBe('layout-1');
    expect(simplified.pages[0].layouts[0].page).toBe(1);
    expect(simplified.pages[0].layouts[0].text).toBe(
      'This is a test line from the document',
    );
    expect(simplified.pages[0].layouts[0].boundingBox).toEqual(
      expectedBoundingBox,
    );

    expect(simplified.pages[1].number).toBe(2);
    expect(simplified.pages[1].layouts).toHaveLength(1);
    expect(simplified.pages[1].layouts[0].id).toBe('layout-2');
    expect(simplified.pages[1].layouts[0].page).toBe(2);
    expect(simplified.pages[1].layouts[0].text).toBe(
      'Another test line with different content',
    );
  });

  it('should handle empty layouts gracefully', () => {
    const emptyTextractResult = {
      pages: [
        {
          number: 1,
          lines: [],
          words: [],
          layouts: [],
        },
      ],
      fullText: '',
    };

    const simplified =
      textractService.transformToSimplified(emptyTextractResult);

    expect(simplified).toBeDefined();
    expect(simplified.pages).toHaveLength(1);
    expect(simplified.pages[0].layouts).toHaveLength(0);
  });

  it('should handle layouts with no child lines', () => {
    const expectedBoundingBox = {
      left: 0.1,
      top: 0.1,
      width: 0.8,
      height: 0.05,
    };

    const textractResultWithEmptyLayouts = {
      pages: [
        {
          number: 1,
          lines: [],
          words: [],
          layouts: [
            {
              id: 'empty-layout',
              childIds: [],
              boundingBox: expectedBoundingBox,
              page: 1,
            },
          ],
        },
      ],
      fullText: '',
    };

    const simplified = textractService.transformToSimplified(
      textractResultWithEmptyLayouts,
    );

    expect(simplified).toBeDefined();
    expect(simplified.pages[0].layouts).toHaveLength(1);
    expect(simplified.pages[0].layouts[0].text).toBe('');
  });
});
