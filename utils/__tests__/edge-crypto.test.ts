import { describe, expect, it } from '@jest/globals';

import { randomInt } from '@/utils/edge-crypto';

describe('randomInt', () => {
  it('returns values within [min, max)', () => {
    for (let i = 0; i < 100; i++) {
      const value = randomInt(5, 10);
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThan(10);
    }
  });

  it('returns values within a large range without bias', () => {
    const value = randomInt(0, 1_000_000);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1_000_000);
  });

  it('works with range of 1', () => {
    expect(randomInt(7, 8)).toBe(7);
  });
});
