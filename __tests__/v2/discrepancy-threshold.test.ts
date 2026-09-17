import { MIN_DISCREPANCY, amountsMatch } from '@/lib/v2/reports/discrepancy';

describe('amountsMatch', () => {
  it('treats float dust from currency conversion as a match', () => {
    // 100000 * 1.1 lands on 110000.00000000001; an exact === would call this a
    // mismatch and colour a correct invoice as underbilled.
    expect(amountsMatch(110000, 100000 * 1.1)).toBe(true);
    expect(amountsMatch(110000, 110000)).toBe(true);
  });

  it('treats sub-cent proration remainders as a match', () => {
    // A $1,000 annual fee billed monthly expects 83.3333... against a billed
    // 83.33 — an artifact of the arithmetic, not an overbill.
    expect(amountsMatch(1000 / 12, 83.33)).toBe(true);
  });

  it('reports a real half-cent gap as a mismatch', () => {
    // Computes as 0.00499999999999545, so the threshold carries float slack.
    expect(amountsMatch(100.42, 1204.98 / 12)).toBe(false);
  });

  it('reports ordinary cent-level gaps as a mismatch', () => {
    expect(amountsMatch(1000.51, 1000.49)).toBe(false);
    expect(amountsMatch(1000.1, 1000)).toBe(false);
    expect(amountsMatch(4012.5, 4011)).toBe(false);
  });

  it('is symmetric', () => {
    expect(amountsMatch(1000.1, 1000)).toBe(amountsMatch(1000, 1000.1));
    expect(amountsMatch(110000, 100000 * 1.1)).toBe(
      amountsMatch(100000 * 1.1, 110000),
    );
  });

  it('sits just under half a cent', () => {
    expect(MIN_DISCREPANCY).toBeLessThan(0.005);
    expect(MIN_DISCREPANCY).toBeGreaterThan(0.0049);
  });
});
