import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import {
  calculateVendorSimilarity,
  removeKnownSuffixes,
} from '@/app/lib/utils';

const MIN_SIMILARITY_SCORE = 0.75;

describe('removeKnownSuffixes', () => {
  it('keeps non-ASCII letters', () => {
    // The ASCII char class this replaced produced 'brs' / 'brsen'.
    expect(removeKnownSuffixes('BØRS')).toBe('børs');
    expect(removeKnownSuffixes('Børsen Holding')).toBe('børsen holding');
    expect(removeKnownSuffixes('Ålesund Data GmbH')).toBe('ålesund data');
  });

  it('returns an empty string for a name with no letters or digits', () => {
    expect(removeKnownSuffixes('---')).toBe('');
  });

  // Carried over from app/lib/utils.test.ts, which never runs under the
  // current jest testMatch, so the ASCII contract stays enforced.
  it('still strips known company suffixes', () => {
    expect(removeKnownSuffixes('Microsoft Corp')).toBe('microsoft');
    expect(removeKnownSuffixes("O'Malley - Group, Inc.")).toBe(
      "o'malley - group",
    );
    expect(removeKnownSuffixes('Global Systems & Services LLC')).toBe(
      'global systems services',
    );
    expect(removeKnownSuffixes('Tech-Solutions, L.P.')).toBe('tech-solutions');
  });

  it('handles invalid input', () => {
    expect(removeKnownSuffixes('')).toBe('');
    expect(removeKnownSuffixes(null as unknown as string)).toBe('');
    expect(removeKnownSuffixes(undefined as unknown as string)).toBe('');
  });
});

describe('calculateVendorSimilarity', () => {
  it('treats an ASCII-ified name as identical to the original', () => {
    // Before the fold short-circuit this scored 0.525, below the threshold
    // getVendorId uses, so it created a duplicate vendor.
    expect(calculateVendorSimilarity('BORS AS', 'BØRS AS').combinedScore).toBe(
      1,
    );
    expect(calculateVendorSimilarity('BØRS', 'BØRS').combinedScore).toBe(1);
  });

  it('does not loosen the threshold for genuinely different names', () => {
    expect(
      calculateVendorSimilarity('Terminal 1', 'Terminal 2').combinedScore,
    ).toBeLessThan(MIN_SIMILARITY_SCORE);
    expect(
      calculateVendorSimilarity('Bloomberg', 'Refinitiv').combinedScore,
    ).toBeLessThan(MIN_SIMILARITY_SCORE);
  });

  it('returns zeros for missing input', () => {
    expect(calculateVendorSimilarity('', 'BØRS').combinedScore).toBe(0);
  });
});
