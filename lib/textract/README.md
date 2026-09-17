# Textract Citation Matching API

This document describes the enhanced multi-strategy citation matching system for the Textract service.

## Overview

The enhanced citation matching system provides a line-first approach to matching citations against Textract document analysis results. It implements multiple matching strategies with automatic fallback to ensure the highest possible accuracy while maintaining performance.

## Features

- **Multi-Strategy Matching**: Exact line, fuzzy line, line-boundary, and layout-level matching
- **Line-First Approach**: Prioritizes complete line matches over word-level matching
- **Performance Optimizations**: Caching, efficient data structures, and configurable limits
- **Comprehensive Error Handling**: Graceful degradation and detailed error reporting
- **Backward Compatibility**: Maintains existing API while adding new capabilities

## API Reference

### TextractService.findCitationMatches()

Enhanced method for finding citations using multiple matching strategies.

```typescript
async findCitationMatches(
  textractResult: TextractResult,
  citationText: string,
  options: MatchingOptions = {}
): Promise<MatchingResult>
```

#### Parameters

- `textractResult`: The Textract analysis result containing pages, lines, words, and layout information
- `citationText`: The citation text to search for
- `options`: Configuration options for matching behavior

#### MatchingOptions

```typescript
interface MatchingOptions {
  strategy?:
    | 'exact'
    | 'fuzzy'
    | 'line-boundary'
    | 'layout-level'
    | 'multi-strategy';
  exactThreshold?: number; // Default: 1.0
  fuzzyThreshold?: number; // Default: 0.85
  wordThreshold?: number; // Default: 0.7
  preferredPage?: number; // Optional page preference
  maxResults?: number; // Default: 10
  enableFallback?: boolean; // Default: true
}
```

#### Strategy Types

1. **`exact`**: Exact line text matching
2. **`fuzzy`**: Fuzzy line matching with similarity scoring
3. **`line-boundary`**: Word-level matching within line boundaries
4. **`layout-level`**: Layout block-level matching
5. **`multi-strategy`**: Automatic fallback through all strategies

#### Return Value

```typescript
interface MatchingResult {
  matches: EnhancedCitationMatch[];
  strategy: string; // Strategy that produced the results
  totalMatches: number;
  processingTime: number; // Milliseconds
  errors: string[];
}
```

#### Enhanced Citation Match

```typescript
interface EnhancedCitationMatch {
  citationText: string;
  matchedLines: LineMatch[];
  parentLayout: LayoutMatch;
  overallConfidence: number;
  matchType: 'exact-line' | 'fuzzy-line' | 'line-boundary' | 'layout-level';
  page: number;
  boundingBox: BoundingBox;
}
```

### Usage Examples

#### Basic Multi-Strategy Matching

```typescript
const options: MatchingOptions = {
  strategy: 'multi-strategy',
  preferredPage: 1,
  maxResults: 5,
};

const result = await textractService.findCitationMatches(
  textractResult,
  'The contract will automatically renew',
  options,
);

console.log(
  `Found ${result.matches.length} matches using ${result.strategy} strategy`,
);
console.log(`Processing time: ${result.processingTime}ms`);
```

#### Exact Line Matching Only

```typescript
const options: MatchingOptions = {
  strategy: 'exact',
  exactThreshold: 1.0,
};

const result = await textractService.findCitationMatches(
  textractResult,
  'Revenue for the fourth quarter of 2023 reached $150 million',
  options,
);

if (result.matches.length > 0) {
  const match = result.matches[0];
  console.log(`Exact match found with confidence: ${match.overallConfidence}`);
  console.log(`Bounding box:`, match.boundingBox);
}
```

#### Fuzzy Matching with Custom Threshold

```typescript
const options: MatchingOptions = {
  strategy: 'fuzzy',
  fuzzyThreshold: 0.8,
  preferredPage: 2,
};

const result = await textractService.findCitationMatches(
  textractResult,
  'The subscription term is 12 months',
  options,
);
```

### CitationCoordinateService

The `CitationCoordinateService` has been enhanced to automatically use the new multi-strategy approach while maintaining backward compatibility.

```typescript
const updatedCitations =
  await citationCoordinateService.matchCitationsToCoordinates(
    citationGroups,
    textractResult,
    0.75, // confidence threshold
  );
```

#### Features

- **Automatic Strategy Selection**: Uses multi-strategy approach by default
- **Fallback Support**: Falls back to legacy matching if new approach fails
- **Enhanced Error Handling**: Detailed error logging and graceful degradation
- **Performance Optimization**: Caching and efficient processing

### Performance Features

#### Caching

The service implements multiple levels of caching:

- **Processing Cache**: Caches complete matching results
- **Similarity Cache**: Caches string similarity calculations
- **Text Normalization Cache**: Caches cleaned text results

#### Cache Management

```typescript
// Get cache statistics
const stats = textractService.getCacheStats();
console.log('Cache sizes:', stats);

// Clear all caches
textractService.clearCache();
```

#### Performance Considerations

- **Memory Usage**: Caches are limited to 1000 entries each with LRU eviction
- **Processing Time**: Cached results return instantly for repeated queries
- **Concurrency**: Thread-safe caching implementation

### Error Handling

The system provides comprehensive error handling:

```typescript
const result = await textractService.findCitationMatches(
  textractResult,
  citationText,
  options,
);

if (result.errors.length > 0) {
  console.warn('Matching warnings:', result.errors);
}

// Fallback is automatic in CitationCoordinateService
```

### Best Practices

1. **Use Multi-Strategy**: Start with `multi-strategy` for best results
2. **Set Preferred Page**: When known, specify the expected page number
3. **Configure Thresholds**: Adjust thresholds based on your accuracy requirements
4. **Monitor Performance**: Use cache statistics to optimize usage
5. **Handle Errors**: Always check for errors and warnings in results

### Migration Guide

#### From Legacy API

The legacy `findTextMatches` method is still available but deprecated. To migrate:

**Before:**

```typescript
const matches = await textractService.findTextMatches(
  textractResult,
  citationText,
  0.8,
);
```

**After:**

```typescript
const result = await textractService.findCitationMatches(
  textractResult,
  citationText,
  { strategy: 'multi-strategy', fuzzyThreshold: 0.8 },
);
const matches = result.matches;
```

#### Benefits of Migration

- **Higher Accuracy**: Line-first matching provides better precision
- **Better Performance**: Caching and optimized algorithms
- **More Control**: Configurable strategies and thresholds
- **Better Debugging**: Detailed error reporting and timing information

### Testing

Comprehensive tests are available in `lib/textract/__tests__/citationMatching.test.ts`:

```bash
npm test -- lib/textract/__tests__/citationMatching.test.ts
```

The tests cover:

- All matching strategies
- Error handling
- Performance and caching
- Edge cases and invalid inputs
- Backward compatibility

### Configuration

#### Environment Variables

The service respects the following environment variables:

- `AWS_REGION`: AWS region for Textract service
- `AWS_ACCESS_KEY_ID`: AWS access key
- `AWS_SECRET_ACCESS_KEY`: AWS secret key

#### Default Configuration

```typescript
const DEFAULT_OPTIONS: MatchingOptions = {
  strategy: 'multi-strategy',
  exactThreshold: 1.0,
  fuzzyThreshold: 0.85,
  wordThreshold: 0.7,
  maxResults: 10,
  enableFallback: true,
};
```

### Troubleshooting

#### Common Issues

1. **No Matches Found**: Check citation text length and format
2. **Low Confidence**: Adjust thresholds or try different strategies
3. **Performance Issues**: Clear caches or reduce result limits
4. **Memory Usage**: Monitor cache sizes and clear when necessary

#### Debug Information

```typescript
const result = await textractService.findCitationMatches(
  textractResult,
  citationText,
  options,
);

console.log('Strategy used:', result.strategy);
console.log('Processing time:', result.processingTime);
console.log('Errors:', result.errors);
console.log('Cache stats:', textractService.getCacheStats());
```

## Changelog

### Version 2.0.0

- Added multi-strategy citation matching
- Implemented line-first matching approach
- Added comprehensive caching system
- Enhanced error handling and reporting
- Improved performance with optimized algorithms
- Added extensive test coverage
- Maintained backward compatibility

### Migration Timeline

- **Phase 1**: New API available alongside legacy API
- **Phase 2**: Default to new API with legacy fallback
- **Phase 3**: Deprecate legacy API (future release)
