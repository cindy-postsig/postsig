export interface BoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CitationObject {
  id: string;
  pageNumber: number;
  citationText: string;
  boundingBox?: BoundingBox;
  confidence?: number;
  matchType?: 'exact' | 'fuzzy' | 'partial';
}

export interface CitationGroup {
  id: string;
  content: CitationObject[];
}

export type CitationTextColumn = CitationGroup[];

export interface TextractProcessingResult {
  processed: number;
  skipped: number;
  errors: number;
  reason?: string;
  updatedCitations?: CitationTextColumn;
}

export interface CitationWithBoundingBox {
  id: string;
  content: string;
  bounding_box?: {
    page: number;
    boundingBox: BoundingBox;
    confidence: number;
    matchType: 'exact' | 'fuzzy' | 'partial';
  };
}

export interface TextractWord {
  id: string;
  text: string;
  confidence: number;
  boundingBox: BoundingBox;
  page: number;
  lineId: string;
}

export interface TextractLine {
  id: string;
  text: string;
  words: TextractWord[];
  boundingBox: BoundingBox;
  page: number;
}

export interface TextractLayoutText {
  id: string;
  childIds: string[];
  boundingBox: BoundingBox;
  page: number;
}

export interface TextractPage {
  number: number;
  lines: TextractLine[];
  words: TextractWord[];
  layouts: TextractLayoutText[];
}

export interface TextractResult {
  pages: TextractPage[];
  fullText: string;
}

export interface SimplifiedTextractLayout {
  id: string;
  page: number;
  text: string;
  boundingBox: BoundingBox;
}

export interface SimplifiedTextractPage {
  number: number;
  layouts: SimplifiedTextractLayout[];
}

export interface SimplifiedTextractResult {
  pages: SimplifiedTextractPage[];
}

export interface CitationMatch {
  citationId: string;
  text: string;
  page: number;
  boundingBox: BoundingBox;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'partial';
}

// New interfaces for multi-strategy matching
export interface LineMatch {
  lineId: string;
  text: string;
  confidence: number;
  boundingBox: BoundingBox;
  page: number;
  similarity: number;
  matchedText: string;
}

export interface LayoutMatch {
  layoutId: string;
  boundingBox: BoundingBox;
  childLineIds: string[];
  page: number;
  confidence: number;
}

export interface EnhancedCitationMatch {
  citationText: string;
  matchedLines: LineMatch[];
  parentLayout: LayoutMatch;
  overallConfidence: number;
  matchType:
    | 'exact-line'
    | 'fuzzy-line'
    | 'line-boundary'
    | 'layout-level'
    | 'word-count';
  page: number;
  boundingBox: BoundingBox;
}

export interface MatchingOptions {
  strategy?:
    | 'exact'
    | 'fuzzy'
    | 'line-boundary'
    | 'layout-level'
    | 'word-count'
    | 'multi-strategy';
  exactThreshold?: number;
  fuzzyThreshold?: number;
  wordThreshold?: number;
  preferredPage?: number;
  maxResults?: number;
  enableFallback?: boolean;
  minWordCount?: number;
  wordCountStrategy?: 'prefix' | 'any-sequence';
  wordCountThreshold?: number;
}

export interface MatchingResult {
  matches: EnhancedCitationMatch[];
  strategy: string;
  totalMatches: number;
  processingTime: number;
  errors: string[];
}

export interface TextractServiceConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  maxRetries?: number;
  timeoutMs?: number;
}

export type TextractJobStatus =
  | 'IN_PROGRESS'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'PARTIAL_SUCCESS';

export interface TextractError extends Error {
  code?: string;
  statusCode?: number;
  retryable?: boolean;
}
