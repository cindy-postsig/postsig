import { describe, expect, it } from '@jest/globals';
import { normalizeStoredPercent } from '@/app/lib/mcp/tools/investor/companies';

describe('normalizeStoredPercent', () => {
  it('scales a fraction up to a whole-number percent', () => {
    expect(normalizeStoredPercent(0.0771)).toBeCloseTo(7.71);
    expect(normalizeStoredPercent(0.04)).toBeCloseTo(4);
  });

  it('leaves an already whole-number percent unchanged', () => {
    expect(normalizeStoredPercent(7.71)).toBe(7.71);
  });

  it('rounds to 2 decimals so binary float noise never reaches the client', () => {
    // 0.0523 * 100 === 5.2299999999999995 in JS floating point.
    expect(normalizeStoredPercent(0.0523)).toBe(5.23);
  });

  it('passes null through', () => {
    expect(normalizeStoredPercent(null)).toBeNull();
  });
});
