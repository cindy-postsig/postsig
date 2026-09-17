import { sanitizeOrderNumber } from '@/lib/v2/contracts/orderNumber';

describe('sanitizeOrderNumber', () => {
  it('returns a trimmed string for real values', () => {
    expect(sanitizeOrderNumber('  PO-123 ')).toBe('PO-123');
    expect(sanitizeOrderNumber(456)).toBe('456');
  });

  it('treats null/undefined/empty as no value', () => {
    expect(sanitizeOrderNumber(null)).toBeNull();
    expect(sanitizeOrderNumber(undefined)).toBeNull();
    expect(sanitizeOrderNumber('   ')).toBeNull();
  });

  it('treats the literal string "null" (any case) as no value', () => {
    expect(sanitizeOrderNumber('null')).toBeNull();
    expect(sanitizeOrderNumber('NULL')).toBeNull();
    expect(sanitizeOrderNumber('  Null  ')).toBeNull();
  });
});
