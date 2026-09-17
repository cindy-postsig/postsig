import { describe, expect, it } from '@jest/globals';
import { parseProductsList } from '@/lib/utils';

describe('parseProductsList', () => {
  it('parses a well-formed array string', () => {
    const raw =
      '[{"year":"1","product_name":"BØRS","cost":"1000","n_users":"10"}]';
    expect(parseProductsList(raw)).toEqual([
      { year: '1', product_name: 'BØRS', cost: '1000', n_users: '10' },
    ]);
  });

  it('preserves non-ASCII characters in the product name', () => {
    const raw = '[{"year":"1","product_name":"BØRS","cost":"1","n_users":"1"}]';
    const parsed = parseProductsList(raw) as { product_name: string }[];
    expect(parsed[0].product_name).toBe('BØRS');
  });

  it('returns null for a truncated response instead of throwing', () => {
    // A 250-character cap on a JSON-carrying STRING field truncates mid-array;
    // throwing here used to abort every product link for the contract.
    expect(() =>
      parseProductsList('[{"year":"1","product_name":"BØ'),
    ).not.toThrow();
    expect(parseProductsList('[{"year":"1","product_name":"BØ')).toBeNull();
  });

  it('returns null for valid JSON that is not an array', () => {
    expect(parseProductsList('{"year":"1"}')).toBeNull();
    expect(parseProductsList('"BØRS"')).toBeNull();
  });

  it('passes an already-parsed array through', () => {
    const products = [{ product_name: 'BØRS' }];
    expect(parseProductsList(products)).toBe(products);
  });

  it('returns an empty array unchanged', () => {
    expect(parseProductsList('[]')).toEqual([]);
  });

  it('returns null for non-string, non-array input', () => {
    expect(parseProductsList(null)).toBeNull();
    expect(parseProductsList(undefined)).toBeNull();
    expect(parseProductsList(42)).toBeNull();
  });
});
