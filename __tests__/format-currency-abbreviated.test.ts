import { formatCurrencyAbbreviated, getCurrencySymbol } from '@/app/lib/utils';

describe('getCurrencySymbol', () => {
  it('resolves supported currencies to their symbol', () => {
    expect(getCurrencySymbol('USD')).toBe('$');
    expect(getCurrencySymbol('EUR')).toBe('€');
  });
});

describe('formatCurrencyAbbreviated', () => {
  it('defaults to USD when no currency is given', () => {
    expect(formatCurrencyAbbreviated(1_500)).toBe('$1.5K');
    expect(formatCurrencyAbbreviated(2_450_000)).toBe('$2.45M');
    expect(formatCurrencyAbbreviated(750)).toBe('$750');
  });

  it('renders the euro symbol for EUR', () => {
    expect(formatCurrencyAbbreviated(1_500, 'EUR')).toBe('€1.5K');
    expect(formatCurrencyAbbreviated(2_450_000, 'EUR')).toBe('€2.45M');
    expect(formatCurrencyAbbreviated(750, 'EUR')).toBe('€750');
  });

  it('keeps the sign for negative amounts', () => {
    expect(formatCurrencyAbbreviated(-1_500, 'EUR')).toBe('-€1.5K');
    expect(formatCurrencyAbbreviated(-2_450_000)).toBe('-$2.45M');
  });

  it('defaults to USD when currency is null, not just undefined', () => {
    expect(formatCurrencyAbbreviated(1_500, null)).toBe('$1.5K');
  });
});
