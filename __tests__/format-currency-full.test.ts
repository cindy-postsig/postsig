import { formatCurrencyFull, formatPricePerShare } from '@/app/lib/utils';

describe('formatCurrencyFull', () => {
  it('defaults to USD when no currency is given', () => {
    expect(formatCurrencyFull(1_234)).toBe('$1,234');
  });

  it('defaults to USD when currency is null, not just undefined', () => {
    expect(formatCurrencyFull(1_234, null)).toBe('$1,234');
  });

  it('formats a given currency', () => {
    expect(formatCurrencyFull(1_234.5, 'EUR')).toBe('€1,234.50');
  });
});

describe('formatPricePerShare', () => {
  it('defaults to USD when no currency is given', () => {
    expect(formatPricePerShare(1.5)).toBe('$1.5000');
  });

  it('defaults to USD when currency is null, not just undefined', () => {
    expect(formatPricePerShare(1.5, null)).toBe('$1.5000');
  });

  it('formats a given currency', () => {
    expect(formatPricePerShare(0.804670264, 'EUR')).toBe('€0.8047');
  });
});
