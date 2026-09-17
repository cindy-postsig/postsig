import { formatCurrency } from '@/app/lib/utils';

describe('formatCurrency', () => {
  it('formats whole units by default and cents on request', () => {
    expect(formatCurrency(1234.56, 'USD')).toBe('$1,235');
    expect(formatCurrency(1234.56, 'USD', true)).toBe('$1,234.56');
  });

  it('defaults to USD when no currency is named', () => {
    expect(formatCurrency(1234.56)).toBe(formatCurrency(1234.56, 'USD'));
    expect(formatCurrency(1234.56, '')).toBe(formatCurrency(1234.56, 'USD'));
  });

  it('keeps each currency in its own symbol', () => {
    expect(formatCurrency(1000, 'EUR', true)).toBe('€1,000.00');
    expect(formatCurrency(1000, 'GBP', true)).toBe('£1,000.00');
    expect(formatCurrency(1000, 'JPY', true)).toBe('¥1,000');
  });

  it('is stable across calls: the cached formatter is not shared between keys', () => {
    // A table renders one currency thousands of times, interleaved with the
    // odd cents-on cell; every repeat has to give the same answer.
    for (let i = 0; i < 3; i += 1) {
      expect(formatCurrency(2547832.46, 'USD')).toBe('$2,547,832');
      expect(formatCurrency(2547832.46, 'USD', true)).toBe('$2,547,832.46');
      expect(formatCurrency(2547832.46, 'EUR')).toBe('€2,547,832');
      expect(formatCurrency(0, 'USD', true)).toBe('$0.00');
      expect(formatCurrency(-42.5, 'USD', true)).toBe('-$42.50');
    }
  });
});
