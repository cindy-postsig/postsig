import {
  TextractClient,
  JobStatus,
  Block,
  BlockType,
  StartDocumentAnalysisCommand,
  GetDocumentAnalysisCommand,
} from '@aws-sdk/client-textract';
import {
  BoundingBox,
  TextractWord,
  TextractLine,
  TextractResult,
  TextractPage,
  TextractServiceConfig,
  TextractLayoutText,
  LineMatch,
  LayoutMatch,
  EnhancedCitationMatch,
  MatchingOptions,
  MatchingResult,
  SimplifiedTextractResult,
  SimplifiedTextractPage,
  SimplifiedTextractLayout,
} from '@/types/textract';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

class TextractService {
  private lineToLayoutMap: Map<string, string> = new Map();
  private layoutBlocksMap: Map<string, TextractLayoutText> = new Map();
  private textNormalizationCache: Map<string, string> = new Map();
  private similarityCache: Map<string, number> = new Map();
  private processingCache: Map<string, MatchingResult> = new Map();
  private readonly CACHE_SIZE_LIMIT = 1000;
  private _client: TextractClient | null = null;
  private _s3Client: S3Client | null = null;
  private _bucketName: string | null = null;

  private getAwsConfig() {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const bucketName = process.env.TEXTRACT_S3_BUCKET;

    if (!accessKeyId || !secretAccessKey || !bucketName) {
      throw new Error(
        `Missing required AWS environment variables: ${
          !accessKeyId ? 'AWS_ACCESS_KEY_ID ' : ''
        }${!secretAccessKey ? 'AWS_SECRET_ACCESS_KEY ' : ''}${
          !bucketName ? 'TEXTRACT_S3_BUCKET ' : ''
        }`.trim(),
      );
    }

    return {
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: { accessKeyId, secretAccessKey },
      bucketName,
    };
  }

  private get client(): TextractClient {
    if (!this._client) {
      const config = this.getAwsConfig();
      this._client = new TextractClient({
        region: config.region,
        credentials: config.credentials,
      });
    }
    return this._client;
  }

  private get s3Client(): S3Client {
    if (!this._s3Client) {
      const config = this.getAwsConfig();
      this._s3Client = new S3Client({
        region: config.region,
        credentials: config.credentials,
      });
    }
    return this._s3Client;
  }

  private get bucketName(): string {
    if (!this._bucketName) {
      this._bucketName = this.getAwsConfig().bucketName;
    }
    return this._bucketName;
  }

  async deleteDocument(filePath: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: filePath,
      }),
    );
  }

  async uploadDocument(filePath: string, fileBuffer: Buffer): Promise<void> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: filePath,
        Body: fileBuffer,
      }),
    );
  }

  async processDocument(
    contractId: number,
    s3Key: string,
  ): Promise<TextractResult> {
    const s3Object = {
      Bucket: this.bucketName,
      Name: s3Key,
    };

    const startCommand = new StartDocumentAnalysisCommand({
      DocumentLocation: {
        S3Object: s3Object,
      },
      FeatureTypes: ['LAYOUT'],
      OutputConfig: {
        S3Bucket: this.bucketName,
        S3Prefix: `textract-output/${contractId}/`,
      },
    });

    const startResponse = await this.client.send(startCommand);
    const jobId = startResponse.JobId!;

    return await this.waitForJobCompletion(jobId);
  }

  private async waitForJobCompletion(jobId: string): Promise<TextractResult> {
    let jobStatus: JobStatus | undefined = 'IN_PROGRESS';
    let attempts = 0;
    const maxAttempts = 30;
    const delayMs = 5000;

    while (jobStatus === 'IN_PROGRESS' && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      const getCommand = new GetDocumentAnalysisCommand({
        JobId: jobId,
      });

      const response = await this.client.send(getCommand);
      jobStatus = response.JobStatus;

      if (jobStatus === 'SUCCEEDED') {
        const allBlocks: Block[] = response.Blocks || [];
        let nextToken = response.NextToken;

        while (nextToken) {
          const nextPageCommand = new GetDocumentAnalysisCommand({
            JobId: jobId,
            NextToken: nextToken,
          });
          const nextPageResponse = await this.client.send(nextPageCommand);
          if (nextPageResponse.Blocks) {
            allBlocks.push(...nextPageResponse.Blocks);
          }
          nextToken = nextPageResponse.NextToken;
        }

        return this.parseTextractResponse({ Blocks: allBlocks });
      } else if (jobStatus === 'FAILED') {
        throw new Error(`Textract job failed: ${response.StatusMessage}`);
      }

      attempts++;
    }

    throw new Error('Textract job timed out');
  }

  private parseTextractResponse(response: { Blocks: Block[] }): TextractResult {
    const blocks: Block[] = response.Blocks || [];
    const pages = new Map<
      number,
      {
        lines: TextractLine[];
        words: TextractWord[];
        layouts: TextractLayoutText[];
      }
    >();
    const wordBlocks = new Map<string, Block>();
    const lineBlocks = new Map<string, Block>();
    const layoutTextBlocks = new Map<string, Block>();

    blocks.forEach((block) => {
      if (block.BlockType === BlockType.WORD) {
        wordBlocks.set(block.Id!, block);
      } else if (block.BlockType === BlockType.LINE) {
        lineBlocks.set(block.Id!, block);
      } else if (
        block.BlockType === BlockType.LAYOUT_TEXT ||
        block.BlockType === BlockType.LAYOUT_TABLE ||
        block.BlockType === BlockType.LAYOUT_LIST
      ) {
        layoutTextBlocks.set(block.Id!, block);
      }
    });

    const pageNumbers = Array.from(
      new Set(blocks.map((block) => block.Page || 1)),
    ).sort();

    pageNumbers.forEach((pageNum) => {
      if (!pages.has(pageNum)) {
        pages.set(pageNum, { lines: [], words: [], layouts: [] });
      }
    });

    lineBlocks.forEach((lineBlock) => {
      const pageNum = lineBlock.Page || 1;
      const line = this.parseLineBlock(lineBlock, wordBlocks);
      const pageData = pages.get(pageNum)!;
      pageData.lines.push(line);
      pageData.words.push(...line.words);
    });

    layoutTextBlocks.forEach((layoutTextBlock) => {
      const pageNum = layoutTextBlock.Page || 1;
      const layoutText = this.parseLayoutTextBlock(layoutTextBlock, lineBlocks);
      pages.get(pageNum)!.layouts.push(layoutText);
    });

    const pagesArray = Array.from(pages.entries()).map(([number, data]) => ({
      number,
      lines: data.lines.sort((a, b) => a.boundingBox.top - b.boundingBox.top),
      words: data.words.sort((a, b) =>
        a.boundingBox.top === b.boundingBox.top
          ? a.boundingBox.left - b.boundingBox.left
          : a.boundingBox.top - b.boundingBox.top,
      ),
      layouts: data.layouts,
    }));

    const fullText = pagesArray
      .map((page) => page.lines.map((line) => line.text).join('\n'))
      .join('\n\n');

    return {
      pages: pagesArray,
      fullText,
    };
  }

  private parseLineBlock(
    lineBlock: Block,
    wordBlocks: Map<string, Block>,
  ): TextractLine {
    const words: TextractWord[] = [];
    const lineId = lineBlock.Id!;

    if (lineBlock.Relationships) {
      const wordRelationship = lineBlock.Relationships.find(
        (rel) => rel.Type === 'CHILD',
      );
      if (wordRelationship?.Ids) {
        wordRelationship.Ids.forEach((wordId) => {
          const wordBlock = wordBlocks.get(wordId);
          if (wordBlock) {
            words.push(this.parseWordBlock(wordBlock, lineId));
          }
        });
      }
    }

    return {
      id: lineId,
      text: lineBlock.Text || '',
      words: words.sort((a, b) => a.boundingBox.left - b.boundingBox.left),
      boundingBox: this.extractBoundingBox(lineBlock.Geometry?.BoundingBox),
      page: lineBlock.Page || 1,
    };
  }

  private parseWordBlock(wordBlock: Block, lineId: string): TextractWord {
    return {
      id: wordBlock.Id!,
      text: wordBlock.Text || '',
      confidence: wordBlock.Confidence || 0,
      boundingBox: this.extractBoundingBox(wordBlock.Geometry?.BoundingBox),
      page: wordBlock.Page || 1,
      lineId: lineId,
    };
  }

  private parseLayoutTextBlock(
    layoutTextBlock: Block,
    lineBlocks: Map<string, Block>,
  ): TextractLayoutText {
    const childLineIds =
      layoutTextBlock.Relationships?.find(
        (rel) => rel.Type === 'CHILD',
      )?.Ids?.filter((id) => lineBlocks.has(id)) || [];

    return {
      id: layoutTextBlock.Id!,
      childIds: childLineIds,
      boundingBox: this.extractBoundingBox(
        layoutTextBlock.Geometry?.BoundingBox,
      ),
      page: layoutTextBlock.Page || 1,
    };
  }

  private extractBoundingBox(geometry: any): BoundingBox {
    if (!geometry) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }

    return {
      left: geometry.Left || 0,
      top: geometry.Top || 0,
      width: geometry.Width || 0,
      height: geometry.Height || 0,
    };
  }

  async findTextMatches(
    textractResult: TextractResult,
    searchText: string,
    threshold: number = 0.8,
  ): Promise<
    Array<{
      text: string;
      page: number;
      boundingBox: BoundingBox;
      confidence: number;
      lineIds: string[];
    }>
  > {
    const matches: Array<{
      text: string;
      page: number;
      boundingBox: BoundingBox;
      confidence: number;
      lineIds: string[];
    }> = [];
    const searchWords = searchText.toLowerCase().split(/\s+/);

    for (const page of textractResult.pages) {
      for (let i = 0; i < page.words.length; i++) {
        const potentialMatch = this.checkSequentialMatch(
          page.words,
          i,
          searchWords,
          threshold,
        );
        if (potentialMatch) {
          matches.push({
            text: potentialMatch.text,
            page: page.number,
            boundingBox: potentialMatch.boundingBox,
            confidence: potentialMatch.confidence,
            lineIds: potentialMatch.lineIds,
          });
        }
      }
    }

    return matches;
  }

  private checkSequentialMatch(
    words: TextractWord[],
    startIndex: number,
    searchWords: string[],
    threshold: number,
  ): {
    text: string;
    boundingBox: BoundingBox;
    confidence: number;
    lineIds: string[];
  } | null {
    if (startIndex + searchWords.length > words.length) {
      return null;
    }

    const matchingWords: TextractWord[] = [];
    let totalConfidence = 0;

    for (let i = 0; i < searchWords.length; i++) {
      const word = words[startIndex + i];
      const similarity = this.calculateSimilarity(
        word.text.toLowerCase(),
        searchWords[i],
      );

      if (similarity < threshold) {
        return null;
      }

      matchingWords.push(word);
      totalConfidence += word.confidence;
    }

    const combinedBoundingBox = this.combineBoundingBoxes(
      matchingWords.map((w) => w.boundingBox),
    );

    const uniqueLineIds = [...new Set(matchingWords.map((w) => w.lineId))];

    return {
      text: matchingWords.map((w) => w.text).join(' '),
      boundingBox: combinedBoundingBox,
      confidence: totalConfidence / matchingWords.length,
      lineIds: uniqueLineIds,
    };
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const cached = this.getCachedSimilarity(str1, str2);
    if (cached !== null) {
      return cached;
    }

    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) {
      this.cacheSimilarity(str1, str2, 1.0);
      return 1.0;
    }

    const similarity =
      (longer.length - this.editDistance(longer, shorter)) / longer.length;
    this.cacheSimilarity(str1, str2, similarity);
    return similarity;
  }

  private editDistance(str1: string, str2: string): number {
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

  async findCitationMatches(
    textractResult: TextractResult,
    citationText: string,
    options: MatchingOptions = {},
  ): Promise<MatchingResult> {
    const cacheKey = this.generateCacheKey(citationText, options);

    if (this.processingCache.has(cacheKey)) {
      return this.processingCache.get(cacheKey)!;
    }

    const startTime = Date.now();
    const errors: string[] = [];

    const {
      strategy = 'multi-strategy',
      exactThreshold = 1.0,
      fuzzyThreshold = 0.85,
      wordThreshold = 0.7,
      preferredPage,
      maxResults = 10,
      enableFallback = true,
      minWordCount,
      wordCountStrategy = 'prefix',
      wordCountThreshold = 0.9,
    } = options;

    this.buildLineToLayoutIndex(textractResult);

    let matches: EnhancedCitationMatch[] = [];
    let usedStrategy = strategy;

    try {
      if (
        minWordCount &&
        minWordCount > 0 &&
        (strategy === 'word-count' || strategy === 'multi-strategy')
      ) {
        matches = await this.findWordCountMatches(
          textractResult,
          citationText,
          minWordCount,
          wordCountStrategy,
          wordCountThreshold,
          preferredPage,
        );
        usedStrategy = 'word-count';
      }

      if (
        matches.length === 0 &&
        enableFallback &&
        (strategy === 'exact' || strategy === 'multi-strategy')
      ) {
        matches = await this.findExactLineMatches(
          textractResult,
          citationText,
          preferredPage,
        );
        usedStrategy = 'exact';
      }

      if (
        matches.length === 0 &&
        enableFallback &&
        (strategy === 'fuzzy' || strategy === 'multi-strategy')
      ) {
        matches = await this.findFuzzyLineMatches(
          textractResult,
          citationText,
          fuzzyThreshold,
          preferredPage,
        );
        usedStrategy = 'fuzzy';
      }

      if (
        matches.length === 0 &&
        enableFallback &&
        (strategy === 'line-boundary' || strategy === 'multi-strategy')
      ) {
        matches = await this.findLineBoundaryMatches(
          textractResult,
          citationText,
          wordThreshold,
          preferredPage,
        );
        usedStrategy = 'line-boundary';
      }

      if (
        matches.length === 0 &&
        enableFallback &&
        (strategy === 'layout-level' || strategy === 'multi-strategy')
      ) {
        matches = await this.findLayoutLevelMatches(
          textractResult,
          citationText,
          wordThreshold,
          preferredPage,
        );
        usedStrategy = 'layout-level';
      }

      matches = matches.slice(0, maxResults);
    } catch (error) {
      errors.push(
        `Error in citation matching: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const processingTime = Date.now() - startTime;

    const result: MatchingResult = {
      matches,
      strategy: usedStrategy,
      totalMatches: matches.length,
      processingTime,
      errors,
    };

    this.cacheResult(cacheKey, result);

    return result;
  }

  private async findExactLineMatches(
    textractResult: TextractResult,
    citationText: string,
    preferredPage?: number,
  ): Promise<EnhancedCitationMatch[]> {
    const matches: EnhancedCitationMatch[] = [];
    const cleanCitationText = this.cleanTextForMatching(citationText);

    if (!cleanCitationText || cleanCitationText.length < 5) {
      return matches;
    }

    const pagesToSearch = preferredPage
      ? textractResult.pages.filter((page) => page.number === preferredPage)
      : textractResult.pages;

    for (const page of pagesToSearch) {
      for (const line of page.lines) {
        const cleanLineText = this.cleanTextForMatching(line.text);

        if (cleanLineText === cleanCitationText) {
          const layoutMatch = this.findParentLayout(line.id, page);

          const lineMatch: LineMatch = {
            lineId: line.id,
            text: line.text,
            confidence: 1.0,
            boundingBox: line.boundingBox,
            page: page.number,
            similarity: 1.0,
            matchedText: line.text,
          };

          matches.push({
            citationText,
            matchedLines: [lineMatch],
            parentLayout: layoutMatch,
            overallConfidence: 1.0,
            matchType: 'exact-line',
            page: page.number,
            boundingBox: layoutMatch.boundingBox,
          });
        }
      }
    }

    return matches.sort((a, b) => {
      if (preferredPage) {
        const aPageMatch = a.page === preferredPage ? 1 : 0;
        const bPageMatch = b.page === preferredPage ? 1 : 0;
        if (aPageMatch !== bPageMatch) {
          return bPageMatch - aPageMatch;
        }
      }
      return b.overallConfidence - a.overallConfidence;
    });
  }

  private async findFuzzyLineMatches(
    textractResult: TextractResult,
    citationText: string,
    threshold: number,
    preferredPage?: number,
  ): Promise<EnhancedCitationMatch[]> {
    const matches: EnhancedCitationMatch[] = [];
    const cleanCitationText = this.cleanTextForMatching(citationText);

    if (!cleanCitationText || cleanCitationText.length < 5) {
      return matches;
    }

    const pagesToSearch = preferredPage
      ? textractResult.pages.filter((page) => page.number === preferredPage)
      : textractResult.pages;

    for (const page of pagesToSearch) {
      for (const line of page.lines) {
        const cleanLineText = this.cleanTextForMatching(line.text);
        const similarity = this.calculateSimilarity(
          cleanLineText,
          cleanCitationText,
        );

        if (similarity >= threshold) {
          const layoutMatch = this.findParentLayout(line.id, page);

          const lineMatch: LineMatch = {
            lineId: line.id,
            text: line.text,
            confidence: similarity,
            boundingBox: line.boundingBox,
            page: page.number,
            similarity,
            matchedText: line.text,
          };

          matches.push({
            citationText,
            matchedLines: [lineMatch],
            parentLayout: layoutMatch,
            overallConfidence: similarity,
            matchType: 'fuzzy-line',
            page: page.number,
            boundingBox: layoutMatch.boundingBox,
          });
        }
      }
    }

    return matches.sort((a, b) => {
      if (preferredPage) {
        const aPageMatch = a.page === preferredPage ? 1 : 0;
        const bPageMatch = b.page === preferredPage ? 1 : 0;
        if (aPageMatch !== bPageMatch) {
          return bPageMatch - aPageMatch;
        }
      }
      return b.overallConfidence - a.overallConfidence;
    });
  }

  private async findLineBoundaryMatches(
    textractResult: TextractResult,
    citationText: string,
    threshold: number,
    preferredPage?: number,
  ): Promise<EnhancedCitationMatch[]> {
    const matches: EnhancedCitationMatch[] = [];
    const cleanCitationText = this.cleanTextForMatching(citationText);
    const citationWords = cleanCitationText
      .split(/\s+/)
      .filter((word) => word.length > 0);

    if (citationWords.length === 0) {
      return matches;
    }

    const pagesToSearch = preferredPage
      ? textractResult.pages.filter((page) => page.number === preferredPage)
      : textractResult.pages;

    for (const page of pagesToSearch) {
      for (const line of page.lines) {
        const lineWords = line.text
          .split(/\s+/)
          .filter((word) => word.length > 0);

        if (lineWords.length === 0) continue;

        const match = this.findBestWordSequenceInLine(
          line,
          citationWords,
          threshold,
        );

        if (match) {
          const layoutMatch = this.findParentLayout(line.id, page);

          const lineMatch: LineMatch = {
            lineId: line.id,
            text: line.text,
            confidence: match.confidence,
            boundingBox: match.boundingBox,
            page: page.number,
            similarity: match.similarity,
            matchedText: match.matchedText,
          };

          matches.push({
            citationText,
            matchedLines: [lineMatch],
            parentLayout: layoutMatch,
            overallConfidence: match.confidence,
            matchType: 'line-boundary',
            page: page.number,
            boundingBox: layoutMatch.boundingBox,
          });
        }
      }
    }

    return matches.sort((a, b) => {
      if (preferredPage) {
        const aPageMatch = a.page === preferredPage ? 1 : 0;
        const bPageMatch = b.page === preferredPage ? 1 : 0;
        if (aPageMatch !== bPageMatch) {
          return bPageMatch - aPageMatch;
        }
      }
      return b.overallConfidence - a.overallConfidence;
    });
  }

  private async findLayoutLevelMatches(
    textractResult: TextractResult,
    citationText: string,
    threshold: number,
    preferredPage?: number,
  ): Promise<EnhancedCitationMatch[]> {
    const matches: EnhancedCitationMatch[] = [];
    const cleanCitationText = this.cleanTextForMatching(citationText);

    if (!cleanCitationText || cleanCitationText.length < 5) {
      return matches;
    }

    const pagesToSearch = preferredPage
      ? textractResult.pages.filter((page) => page.number === preferredPage)
      : textractResult.pages;

    for (const page of pagesToSearch) {
      for (const layout of page.layouts) {
        const layoutText = this.getLayoutText(layout, page);
        const cleanLayoutText = this.cleanTextForMatching(layoutText);

        if (cleanLayoutText.includes(cleanCitationText)) {
          const similarity = this.calculateSimilarity(
            cleanLayoutText,
            cleanCitationText,
          );

          if (similarity >= threshold) {
            const childLines = this.getChildLines(layout, page);
            const lineMatches: LineMatch[] = childLines.map((line) => ({
              lineId: line.id,
              text: line.text,
              confidence: similarity,
              boundingBox: line.boundingBox,
              page: page.number,
              similarity,
              matchedText: line.text,
            }));

            const layoutMatch: LayoutMatch = {
              layoutId: layout.id,
              boundingBox: layout.boundingBox,
              childLineIds: layout.childIds,
              page: page.number,
              confidence: similarity,
            };

            matches.push({
              citationText,
              matchedLines: lineMatches,
              parentLayout: layoutMatch,
              overallConfidence: similarity,
              matchType: 'layout-level',
              page: page.number,
              boundingBox: layout.boundingBox,
            });
          }
        }
      }
    }

    return matches.sort((a, b) => {
      if (preferredPage) {
        const aPageMatch = a.page === preferredPage ? 1 : 0;
        const bPageMatch = b.page === preferredPage ? 1 : 0;
        if (aPageMatch !== bPageMatch) {
          return bPageMatch - aPageMatch;
        }
      }
      return b.overallConfidence - a.overallConfidence;
    });
  }

  private async findWordCountMatches(
    textractResult: TextractResult,
    citationText: string,
    minWordCount: number,
    wordCountStrategy: 'prefix' | 'any-sequence',
    threshold: number,
    preferredPage?: number,
  ): Promise<EnhancedCitationMatch[]> {
    const matches: EnhancedCitationMatch[] = [];
    const cleanCitationText = this.cleanTextForMatching(citationText);

    if (!cleanCitationText || cleanCitationText.length < 3) {
      return matches;
    }

    const citationWords = cleanCitationText
      .split(/\s+/)
      .filter((word) => word.length > 0);

    if (citationWords.length < minWordCount) {
      return matches;
    }

    const targetWords =
      wordCountStrategy === 'prefix'
        ? citationWords.slice(0, minWordCount)
        : citationWords;

    const pagesToSearch = preferredPage
      ? textractResult.pages.filter((page) => page.number === preferredPage)
      : textractResult.pages;

    for (const page of pagesToSearch) {
      for (const line of page.lines) {
        const cleanLineText = this.cleanTextForMatching(line.text);
        const lineWords = cleanLineText
          .split(/\s+/)
          .filter((word) => word.length > 0);

        if (lineWords.length < minWordCount) {
          continue;
        }

        let similarity = 0;
        let matchedText = '';
        let wordBoundingBoxes: BoundingBox[] = [];

        if (wordCountStrategy === 'prefix') {
          const linePrefix = lineWords.slice(0, minWordCount);
          similarity = this.calculateSequenceSimilarity(
            linePrefix,
            targetWords,
          );

          if (similarity >= threshold) {
            matchedText = linePrefix.join(' ');
            wordBoundingBoxes = line.words
              .slice(0, Math.min(minWordCount, line.words.length))
              .map((word) => word.boundingBox);
          }
        } else {
          for (let i = 0; i <= lineWords.length - minWordCount; i++) {
            const sequence = lineWords.slice(i, i + minWordCount);
            const seqSimilarity = this.calculateSequenceSimilarity(
              sequence,
              targetWords.slice(0, minWordCount),
            );

            if (seqSimilarity >= threshold && seqSimilarity > similarity) {
              similarity = seqSimilarity;
              matchedText = sequence.join(' ');
              wordBoundingBoxes = line.words
                .slice(i, i + minWordCount)
                .map((word) => word.boundingBox);
            }
          }
        }

        if (similarity >= threshold && wordBoundingBoxes.length > 0) {
          const layoutMatch = this.findParentLayout(line.id, page);
          const boundingBox = this.combineBoundingBoxes(wordBoundingBoxes);

          const lineMatch: LineMatch = {
            lineId: line.id,
            text: line.text,
            confidence: similarity,
            boundingBox,
            page: page.number,
            similarity,
            matchedText,
          };

          matches.push({
            citationText,
            matchedLines: [lineMatch],
            parentLayout: layoutMatch,
            overallConfidence: similarity,
            matchType: 'word-count',
            page: page.number,
            boundingBox: layoutMatch.boundingBox,
          });
        }
      }
    }

    return matches.sort((a, b) => {
      if (preferredPage) {
        const aPageMatch = a.page === preferredPage ? 1 : 0;
        const bPageMatch = b.page === preferredPage ? 1 : 0;
        if (aPageMatch !== bPageMatch) {
          return bPageMatch - aPageMatch;
        }
      }
      return b.overallConfidence - a.overallConfidence;
    });
  }

  private buildLineToLayoutIndex(textractResult: TextractResult): void {
    this.lineToLayoutMap.clear();
    this.layoutBlocksMap.clear();

    for (const page of textractResult.pages) {
      for (const layout of page.layouts) {
        this.layoutBlocksMap.set(layout.id, layout);
        for (const childId of layout.childIds) {
          this.lineToLayoutMap.set(childId, layout.id);
        }
      }
    }
  }

  private findParentLayout(lineId: string, page: TextractPage): LayoutMatch {
    const layoutId = this.lineToLayoutMap.get(lineId);

    if (layoutId) {
      const layout = this.layoutBlocksMap.get(layoutId);
      if (layout) {
        return {
          layoutId: layout.id,
          boundingBox: layout.boundingBox,
          childLineIds: layout.childIds,
          page: page.number,
          confidence: 1.0,
        };
      }
    }

    const line = page.lines.find((l) => l.id === lineId);
    return {
      layoutId: `fallback-${lineId}`,
      boundingBox: line?.boundingBox || {
        left: 0,
        top: 0,
        width: 0,
        height: 0,
      },
      childLineIds: [lineId],
      page: page.number,
      confidence: 0.5,
    };
  }

  private getLayoutText(
    layout: TextractLayoutText,
    page: TextractPage,
  ): string {
    const childLines = this.getChildLines(layout, page);
    return childLines.map((line) => line.text).join(' ');
  }

  private getChildLines(
    layout: TextractLayoutText,
    page: TextractPage,
  ): TextractLine[] {
    return layout.childIds
      .map((childId) => page.lines.find((line) => line.id === childId))
      .filter((line): line is TextractLine => line !== undefined);
  }

  private findBestWordSequenceInLine(
    line: TextractLine,
    citationWords: string[],
    threshold: number,
  ): {
    confidence: number;
    similarity: number;
    matchedText: string;
    boundingBox: BoundingBox;
  } | null {
    const lineWords = line.text.split(/\s+/).filter((word) => word.length > 0);

    if (lineWords.length === 0 || citationWords.length === 0) {
      return null;
    }

    let bestMatch: {
      confidence: number;
      similarity: number;
      matchedText: string;
      boundingBox: BoundingBox;
    } | null = null;

    for (let i = 0; i <= lineWords.length - citationWords.length; i++) {
      const sequence = lineWords.slice(i, i + citationWords.length);
      const similarity = this.calculateSequenceSimilarity(
        sequence,
        citationWords,
      );

      if (similarity >= threshold) {
        const matchedText = sequence.join(' ');
        const wordBoundingBoxes = line.words
          .slice(i, i + citationWords.length)
          .map((word) => word.boundingBox);

        const boundingBox = this.combineBoundingBoxes(wordBoundingBoxes);

        const match = {
          confidence: similarity,
          similarity,
          matchedText,
          boundingBox,
        };

        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = match;
        }
      }
    }

    return bestMatch;
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
      const similarity = this.calculateSimilarity(
        sequence1[i].toLowerCase(),
        sequence2[i].toLowerCase(),
      );
      if (similarity > 0.8) {
        matches++;
      }
    }

    return matches / minLength;
  }

  private cleanTextForMatching(text: string): string {
    if (this.textNormalizationCache.has(text)) {
      return this.textNormalizationCache.get(text)!;
    }

    const cleaned = text
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s.,;:!?()-]/g, '')
      .trim()
      .toLowerCase();

    if (this.textNormalizationCache.size >= this.CACHE_SIZE_LIMIT) {
      const firstKey = this.textNormalizationCache.keys().next().value;
      if (firstKey !== undefined) {
        this.textNormalizationCache.delete(firstKey);
      }
    }

    this.textNormalizationCache.set(text, cleaned);
    return cleaned;
  }

  async findLayoutsForMatches(
    matches: Array<{ page: number; lineIds: string[] }>,
    textractResult: TextractResult,
  ): Promise<Array<{ page: number; boundingBox: BoundingBox }>> {
    const lineToLayoutMap = new Map<string, string>();
    for (const page of textractResult.pages) {
      for (const layout of page.layouts) {
        for (const childId of layout.childIds) {
          lineToLayoutMap.set(childId, layout.id);
        }
      }
    }

    const layoutBoundingBoxes: Array<{
      page: number;
      boundingBox: BoundingBox;
    }> = [];
    const foundLayoutIds = new Set<string>();

    for (const match of matches) {
      for (const lineId of match.lineIds) {
        const layoutId = lineToLayoutMap.get(lineId);
        if (layoutId && !foundLayoutIds.has(layoutId)) {
          const page = textractResult.pages.find((p) =>
            p.layouts.some((l) => l.id === layoutId),
          );
          if (page) {
            const layout = page.layouts.find((l) => l.id === layoutId);
            if (layout) {
              layoutBoundingBoxes.push({
                page: page.number,
                boundingBox: layout.boundingBox,
              });
              foundLayoutIds.add(layoutId);
            }
          }
        }
      }
    }
    return layoutBoundingBoxes;
  }

  private generateCacheKey(
    citationText: string,
    options: MatchingOptions,
  ): string {
    const optionsString = JSON.stringify(options);
    return `${citationText}:${optionsString}`;
  }

  private cacheResult(key: string, result: MatchingResult): void {
    if (this.processingCache.size >= this.CACHE_SIZE_LIMIT) {
      const firstKey = this.processingCache.keys().next().value;
      if (firstKey !== undefined) {
        this.processingCache.delete(firstKey);
      }
    }
    this.processingCache.set(key, result);
  }

  private getCachedSimilarity(str1: string, str2: string): number | null {
    const cacheKey = `${str1}:${str2}`;
    return this.similarityCache.get(cacheKey) || null;
  }

  private cacheSimilarity(
    str1: string,
    str2: string,
    similarity: number,
  ): void {
    const cacheKey = `${str1}:${str2}`;
    if (this.similarityCache.size >= this.CACHE_SIZE_LIMIT) {
      const firstKey = this.similarityCache.keys().next().value;
      if (firstKey !== undefined) {
        this.similarityCache.delete(firstKey);
      }
    }
    this.similarityCache.set(cacheKey, similarity);
  }

  clearCache(): void {
    this.processingCache.clear();
    this.similarityCache.clear();
    this.textNormalizationCache.clear();
  }

  getCacheStats(): {
    processingCache: number;
    similarityCache: number;
    textNormalizationCache: number;
  } {
    return {
      processingCache: this.processingCache.size,
      similarityCache: this.similarityCache.size,
      textNormalizationCache: this.textNormalizationCache.size,
    };
  }

  transformToSimplified(
    textractResult: TextractResult,
  ): SimplifiedTextractResult {
    const simplifiedPages: SimplifiedTextractPage[] = textractResult.pages.map(
      (page) => {
        const simplifiedLayouts: SimplifiedTextractLayout[] = page.layouts.map(
          (layout) => {
            const text = this.getLayoutText(layout, page);
            return {
              id: layout.id,
              page: page.number,
              text,
              boundingBox: layout.boundingBox,
            };
          },
        );

        return {
          number: page.number,
          layouts: simplifiedLayouts,
        };
      },
    );

    return {
      pages: simplifiedPages,
    };
  }
}

export const textractService = new TextractService();

export function transformTextractToSimplified(
  textractResult: TextractResult,
): SimplifiedTextractResult {
  return textractService.transformToSimplified(textractResult);
}
