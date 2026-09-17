import { formatFxRate } from '@/app/lib/utils';

describe('formatFxRate', () => {
  it('rounds to 4 significant figures', () => {
    expect(formatFxRate(0.920341)).toBe('0.9203');
    expect(formatFxRate(1.083712)).toBe('1.084');
  });

  it('trims trailing zeros', () => {
    expect(formatFxRate(1.2)).toBe('1.2');
    expect(formatFxRate(1)).toBe('1');
  });

  it('handles small and large multipliers', () => {
    expect(formatFxRate(0.0083217)).toBe('0.008322');
    expect(formatFxRate(147.256)).toBe('147.3');
  });
});
