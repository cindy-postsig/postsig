import { textractService } from './index';
import {
  TextractResult,
  BoundingBox,
  CitationMatch,
  CitationTextColumn,
  CitationObject,
  EnhancedCitationMatch,
  MatchingOptions,
} from '@/types/textract';

export class CitationCoordinateService {
  private readonly DEFAULT_CONFIDENCE_THRESHOLD = 0.75;
  private readonly DEFAULT_EXACT_THRESHOLD = 1.0;
  private readonly DEFAULT_FUZZY_THRESHOLD = 0.85;
  private readonly DEFAULT_WORD_THRESHOLD = 0.4;
  private readonly DEFAULT_MIN_WORD_COUNT = 5;
  private readonly DEFAULT_WORD_COUNT_STRATEGY: 'prefix' | 'any-sequence' =
    'prefix';
  private readonly DEFAULT_WORD_COUNT_THRESHOLD = 0.9;
  private readonly MIN_CITATION_LENGTH = 5;
  private readonly MAX_CITATION_LENGTH = 500;

  async matchCitationsToCoordinates(
    citationGroups: CitationTextColumn,
    textractResult: TextractResult,
    confidenceThreshold: number = this.DEFAULT_CONFIDENCE_THRESHOLD,
    wordCountOptions?: {
      minWordCount?: number;
      wordCountStrategy?: 'prefix' | 'any-sequence';
      wordCountThreshold?: number;
    },
  ): Promise<CitationTextColumn> {
    const updatedGroups: CitationTextColumn = [];

    try {
      for (const group of citationGroups) {
        const updatedContent: CitationObject[] = [];

        for (const citation of group.content) {
          try {
            const result = await this.processSingleCitation(
              citation,
              textractResult,
              confidenceThreshold,
              wordCountOptions,
            );
            updatedContent.push(result);
          } catch (error) {
            console.error(`Error processing citation ${citation.id}:`, error);
            updatedContent.push(citation);
          }
        }

        updatedGroups.push({
          ...group,
          content: updatedContent,
        });
      }
    } catch (error) {
      console.error('Error in matchCitationsToCoordinates:', error);
      throw error;
    }

    return updatedGroups;
  }

  private async processSingleCitation(
    citation: CitationObject,
    textractResult: TextractResult,
    confidenceThreshold: number,
    wordCountOptions?: {
      minWordCount?: number;
      wordCountStrategy?: 'prefix' | 'any-sequence';
      wordCountThreshold?: number;
    },
  ): Promise<CitationObject> {
    if (!this.isValidCitation(citation)) {
      return citation;
    }

    const cleanedText = this.cleanCitationText(citation.citationText);
    if (!this.isValidCitationText(cleanedText)) {
      return citation;
    }

    try {
      const matchingOptions: MatchingOptions = {
        strategy: 'multi-strategy',
        exactThreshold: this.DEFAULT_EXACT_THRESHOLD,
        fuzzyThreshold: this.DEFAULT_FUZZY_THRESHOLD,
        wordThreshold: this.DEFAULT_WORD_THRESHOLD,
        preferredPage: citation.pageNumber,
        maxResults: 5,
        enableFallback: true,
        minWordCount:
          wordCountOptions?.minWordCount ?? this.DEFAULT_MIN_WORD_COUNT,
        wordCountStrategy:
          wordCountOptions?.wordCountStrategy ??
          this.DEFAULT_WORD_COUNT_STRATEGY,
        wordCountThreshold:
          wordCountOptions?.wordCountThreshold ??
          this.DEFAULT_WORD_COUNT_THRESHOLD,
      };

      const matchingResult = await textractService.findCitationMatches(
        textractResult,
        cleanedText,
        matchingOptions,
      );

      if (matchingResult.errors.length > 0) {
        console.warn(
          `Warnings in citation matching for ${citation.id}:`,
          matchingResult.errors,
        );
      }

      const bestMatch = this.selectBestMatch(
        matchingResult.matches,
        confidenceThreshold,
        citation.pageNumber,
      );

      if (bestMatch) {
        return {
          ...citation,
          boundingBox: bestMatch.boundingBox,
          confidence: bestMatch.overallConfidence,
          matchType: this.mapMatchTypeToLegacyType(bestMatch.matchType),
        };
      }

      return citation;
    } catch (error) {
      console.error(
        `Error in line-first matching for citation ${citation.id}:`,
        error,
      );
      return await this.fallbackToLegacyMatching(
        citation,
        textractResult,
        confidenceThreshold,
      );
    }
  }

  private async fallbackToLegacyMatching(
    citation: CitationObject,
    textractResult: TextractResult,
    confidenceThreshold: number,
  ): Promise<CitationObject> {
    try {
      const cleanedText = this.cleanCitationText(citation.citationText);
      const matches = await this.findBestMatch(
        cleanedText,
        textractResult,
        confidenceThreshold,
        citation.pageNumber,
      );

      if (matches.length > 0) {
        const bestMatch = matches[0];
        return {
          ...citation,
          boundingBox: bestMatch.boundingBox,
          confidence: bestMatch.confidence,
          matchType: bestMatch.matchType,
        };
      }

      return citation;
    } catch (error) {
      console.error(
        `Error in fallback matching for citation ${citation.id}:`,
        error,
      );
      return citation;
    }
  }

  private isValidCitation(citation: CitationObject): boolean {
    return !!(
      citation &&
      citation.citationText &&
      typeof citation.citationText === 'string' &&
      citation.citationText.trim().length > 0
    );
  }

  private isValidCitationText(text: string): boolean {
    return !!(
      text &&
      text.length >= this.MIN_CITATION_LENGTH &&
      text.length <= this.MAX_CITATION_LENGTH
    );
  }

  private selectBestMatch(
    matches: EnhancedCitationMatch[],
    confidenceThreshold: number,
    preferredPage?: number,
  ): EnhancedCitationMatch | null {
    if (matches.length === 0) {
      return null;
    }

    const validMatches = matches.filter(
      (match) => match.overallConfidence >= confidenceThreshold,
    );

    if (validMatches.length === 0) {
      return null;
    }

    if (preferredPage) {
      const pageMatches = validMatches.filter(
        (match) => match.page === preferredPage,
      );
      if (pageMatches.length > 0) {
        return pageMatches[0];
      }
    }

    return validMatches[0];
  }

  private mapMatchTypeToLegacyType(
    matchType:
      | 'exact-line'
      | 'fuzzy-line'
      | 'line-boundary'
      | 'layout-level'
      | 'word-count',
  ): 'exact' | 'fuzzy' | 'partial' {
    switch (matchType) {
      case 'exact-line':
        return 'exact';
      case 'fuzzy-line':
        return 'fuzzy';
      case 'line-boundary':
      case 'layout-level':
      case 'word-count':
        return 'partial';
      default:
        return 'partial';
    }
  }

  private async findBestMatch(
    citationText: string,
    textractResult: TextractResult,
    confidenceThreshold: number,
    expectedPage?: number,
  ): Promise<CitationMatch[]> {
    const allMatches: CitationMatch[] = [];

    try {
      const exactMatches = await this.findExactMatches(
        citationText,
        textractResult,
        expectedPage,
      );
      allMatches.push(
        ...exactMatches.map((match) => ({
          ...match,
          matchType: 'exact' as const,
        })),
      );

      if (allMatches.length === 0) {
        const fuzzyMatches = await this.findFuzzyMatches(
          citationText,
          textractResult,
          0.85,
          expectedPage,
        );
        allMatches.push(
          ...fuzzyMatches.map((match) => ({
            ...match,
            matchType: 'fuzzy' as const,
          })),
        );
      }

      if (allMatches.length === 0) {
        const partialMatches = await this.findPartialMatches(
          citationText,
          textractResult,
          0.7,
          expectedPage,
        );
        allMatches.push(
          ...partialMatches.map((match) => ({
            ...match,
            matchType: 'partial' as const,
          })),
        );
      }

      let filteredMatches = allMatches.filter(
        (match) => match.confidence >= confidenceThreshold,
      );

      if (expectedPage && filteredMatches.length > 1) {
        const pageMatches = filteredMatches.filter(
          (match) => match.page === expectedPage,
        );
        if (pageMatches.length > 0) {
          filteredMatches = pageMatches;
        }
      }

      return filteredMatches.sort((a, b) => {
        if (expectedPage) {
          const aPageMatch = a.page === expectedPage ? 1 : 0;
          const bPageMatch = b.page === expectedPage ? 1 : 0;
          if (aPageMatch !== bPageMatch) {
            return bPageMatch - aPageMatch;
          }
        }
        return b.confidence - a.confidence;
      });
    } catch (error) {
      console.error('Error in findBestMatch:', error);
      return [];
    }
  }

  private async findExactMatches(
    citationText: string,
    textractResult: TextractResult,
    expectedPage?: number,
  ): Promise<
    Array<{
      citationId: string;
      text: string;
      page: number;
      boundingBox: BoundingBox;
      confidence: number;
    }>
  > {
    const matches = await textractService.findTextMatches(
      textractResult,
      citationText,
      0.7,
    );

    const layoutMatches = await textractService.findLayoutsForMatches(
      matches,
      textractResult,
    );

    return matches
      .filter((match) => !expectedPage || match.page === expectedPage)
      .map((match) => ({
        citationId: '',
        text: match.text,
        page: match.page,
        boundingBox: match.boundingBox,
        confidence: match.confidence,
      }));
  }

  private async findFuzzyMatches(
    citationText: string,
    textractResult: TextractResult,
    similarity: number,
    expectedPage?: number,
  ): Promise<
    Array<{
      citationId: string;
      text: string;
      page: number;
      boundingBox: BoundingBox;
      confidence: number;
    }>
  > {
    const matches = await textractService.findTextMatches(
      textractResult,
      citationText,
      similarity,
    );

    const layoutMatches = await textractService.findLayoutsForMatches(
      matches,
      textractResult,
    );

    return matches
      .filter((match) => !expectedPage || match.page === expectedPage)
      .map((match) => ({
        citationId: '',
        text: match.text,
        page: match.page,
        boundingBox: match.boundingBox,
        confidence: match.confidence,
      }));
  }

  private async findPartialMatches(
    citationText: string,
    textractResult: TextractResult,
    minSimilarity: number,
    expectedPage?: number,
  ): Promise<
    Array<{
      citationId: string;
      text: string;
      page: number;
      boundingBox: BoundingBox;
      confidence: number;
    }>
  > {
    const matches: Array<{
      citationId: string;
      text: string;
      page: number;
      boundingBox: BoundingBox;
      confidence: number;
    }> = [];
    const citationWords = citationText
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    if (citationWords.length < 3) {
      return matches;
    }

    const pagesToSearch = expectedPage
      ? textractResult.pages.filter((page) => page.number === expectedPage)
      : textractResult.pages;

    for (const page of pagesToSearch) {
      for (let lineIndex = 0; lineIndex < page.lines.length; lineIndex++) {
        const line = page.lines[lineIndex];
        const lineWords = line.text.toLowerCase().split(/\s+/);

        const sequences = this.findWordSequences(lineWords, citationWords, 3);

        for (const sequence of sequences) {
          const similarity = this.calculateSequenceSimilarity(
            sequence.words,
            citationWords.slice(
              sequence.startIndex,
              sequence.startIndex + sequence.length,
            ),
          );

          if (similarity >= minSimilarity) {
            const wordBoundingBoxes = line.words
              .slice(
                sequence.lineStartIndex,
                sequence.lineStartIndex + sequence.length,
              )
              .map((w) => w.boundingBox);

            const combinedBoundingBox =
              this.combineBoundingBoxes(wordBoundingBoxes);

            matches.push({
              citationId: '',
              text: sequence.words.join(' '),
              page: page.number,
              boundingBox: combinedBoundingBox,
              confidence: similarity * 0.8,
            });
          }
        }
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  private findWordSequences(
    lineWords: string[],
    citationWords: string[],
    minLength: number,
  ): Array<{
    words: string[];
    startIndex: number;
    length: number;
    lineStartIndex: number;
  }> {
    const sequences: Array<{
      words: string[];
      startIndex: number;
      length: number;
      lineStartIndex: number;
    }> = [];

    for (let i = 0; i <= lineWords.length - minLength; i++) {
      for (
        let len = minLength;
        len <= Math.min(lineWords.length - i, citationWords.length);
        len++
      ) {
        const sequence = lineWords.slice(i, i + len);
        sequences.push({
          words: sequence,
          startIndex: 0,
          length: len,
          lineStartIndex: i,
        });
      }
    }

    return sequences;
  }

  private calculateSequenceSimilarity(
    sequence1: string[],
    sequence2: string[],
  ): number {
    if (sequence1.length === 0 || sequence2.length === 0) {
      return 0;
    }

    let matches = 0;
    const minLength = Math.min(sequence1.length, sequence2.length);

    for (let i = 0; i < minLength; i++) {
      const similarity = this.calculateWordSimilarity(
        sequence1[i],
        sequence2[i],
      );
      if (similarity > 0.8) {
        matches++;
      }
    }

    return matches / minLength;
  }

  private calculateWordSimilarity(word1: string, word2: string): number {
    if (word1 === word2) return 1;

    const longer = word1.length > word2.length ? word1 : word2;
    const shorter = word1.length > word2.length ? word2 : word1;

    if (longer.length === 0) return 1;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator,
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private combineBoundingBoxes(boundingBoxes: BoundingBox[]): BoundingBox {
    if (boundingBoxes.length === 0) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }

    let minLeft = Number.MAX_VALUE;
    let minTop = Number.MAX_VALUE;
    let maxRight = Number.MIN_VALUE;
    let maxBottom = Number.MIN_VALUE;

    boundingBoxes.forEach((box) => {
      minLeft = Math.min(minLeft, box.left);
      minTop = Math.min(minTop, box.top);
      maxRight = Math.max(maxRight, box.left + box.width);
      maxBottom = Math.max(maxBottom, box.top + box.height);
    });

    return {
      left: minLeft,
      top: minTop,
      width: maxRight - minLeft,
      height: maxBottom - minTop,
    };
  }

  private cleanCitationText(content: string): string {
    if (typeof content !== 'string') {
      return '';
    }

    return content
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s.,;:!?()-]/g, '')
      .trim()
      .slice(0, 500);
  }

  countProcessedCitations(citationGroups: CitationTextColumn): {
    processed: number;
    total: number;
  } {
    let processed = 0;
    let total = 0;

    for (const group of citationGroups) {
      for (const citation of group.content) {
        total++;
        if (citation.boundingBox) {
          processed++;
        }
      }
    }

    return { processed, total };
  }
}

export const citationCoordinateService = new CitationCoordinateService();
