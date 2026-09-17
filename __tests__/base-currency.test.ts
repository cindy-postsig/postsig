import { parseBaseCurrency, BASE_CURRENCY_DEFAULT } from '@/lib/base-currency';

describe('parseBaseCurrency', () => {
  it('accepts supported currencies', () => {
    expect(parseBaseCurrency('USD')).toBe('USD');
    expect(parseBaseCurrency('EUR')).toBe('EUR');
  });

  it('matches case-insensitively', () => {
    expect(parseBaseCurrency('usd')).toBe('USD');
    expect(parseBaseCurrency('eur')).toBe('EUR');
    expect(parseBaseCurrency(' Eur ')).toBe('EUR');
  });

  it('falls back to default for unsupported currencies', () => {
    expect(parseBaseCurrency('GBP')).toBe(BASE_CURRENCY_DEFAULT);
    expect(parseBaseCurrency('')).toBe(BASE_CURRENCY_DEFAULT);
  });

  it('falls back to default for non-string input', () => {
    expect(parseBaseCurrency(null)).toBe(BASE_CURRENCY_DEFAULT);
    expect(parseBaseCurrency(undefined)).toBe(BASE_CURRENCY_DEFAULT);
    expect(parseBaseCurrency(42)).toBe(BASE_CURRENCY_DEFAULT);
    expect(parseBaseCurrency({})).toBe(BASE_CURRENCY_DEFAULT);
  });
});
