import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/app/lib/emails/contract-lineage', () => ({
  __esModule: true,
  sendContractLineageEmail: jest.fn(),
}));
jest.mock('@/app/lib/actions/openai', () => ({
  __esModule: true,
  getContractSpecifics: jest.fn(),
  getContractBasics: jest.fn(),
  getAdditionalData: jest.fn(),
  getVendorId: jest.fn(),
  saveContractColumns: jest.fn(),
  saveAiExtractionStatus: jest.fn(),
  saveToDb: jest.fn(),
  updateAiExtractionJson: jest.fn(),
}));

import { normalizeCreditsList } from '@/app/lib/actions/contract-processing';

/**
 * A credit is stored as a positive magnitude linked to a product and a relative
 * year. Everything below guards one of the three ways that goes wrong: a sign
 * surviving into the database, a credit landing on the wrong term year, or an
 * unusable answer clearing a contract's credits.
 */
describe('normalizeCreditsList', () => {
  const credit = (overrides: Record<string, unknown> = {}) => ({
    year: '2024',
    product_name: 'J.P. Morgan CEMBI USD',
    cost: '9289.62',
    ...overrides,
  });

  it('reads the credit block off the example invoice', () => {
    const normalized = normalizeCreditsList(
      [credit(), credit({ product_name: 'J.P. Morgan CEMBI IG USD' })],
      [2024, 2024],
    );

    expect(normalized).toEqual([
      {
        year: 1,
        amount: 9289.62,
        name: 'J.P. Morgan CEMBI USD',
        product_code: null,
      },
      {
        year: 1,
        amount: 9289.62,
        name: 'J.P. Morgan CEMBI IG USD',
        product_code: null,
      },
    ]);
  });

  it.each([
    ['parenthesised', '(9,289.62)'],
    ['minus signed', '-9289.62'],
    ['both, as printed', '- (9,289.62)'],
    ['currency prefixed', '$9,289.62'],
  ])('stores a %s amount as a positive magnitude', (_label, cost) => {
    const normalized = normalizeCreditsList([credit({ cost })], [2024]);
    expect(normalized?.[0].amount).toBe(9289.62);
  });

  it('accepts a JSON string, the shape the model answers with', () => {
    const normalized = normalizeCreditsList(JSON.stringify([credit()]), [2024]);
    expect(normalized).toHaveLength(1);
    expect(normalized?.[0].name).toBe('J.P. Morgan CEMBI USD');
  });

  it('accepts a bare object when the model finds exactly one credit', () => {
    const normalized = normalizeCreditsList(credit(), [2024]);
    expect(normalized).toHaveLength(1);
    expect(normalized?.[0].amount).toBe(9289.62);
  });

  it('places a credit on the same relative year as the product lines', () => {
    // Products span 2024-2025, so 2025 is the second year of the term. Deriving
    // a range from this lone credit would call it year 1 and file the credit
    // against the wrong year's charges.
    const normalized = normalizeCreditsList(
      [credit({ year: '2025' })],
      [2024, 2025],
    );
    expect(normalized?.[0].year).toBe(2);
  });

  it('falls back to year 1 for a credit outside the invoice period', () => {
    // A credit repairing an older billing oversight is recognised when the
    // invoice is, not against the period it repairs.
    const normalized = normalizeCreditsList(
      [credit({ year: '2019' })],
      [2024, 2025],
    );
    expect(normalized?.[0].year).toBe(1);
  });

  it('keeps a product code when the line prints one', () => {
    const normalized = normalizeCreditsList(
      [credit({ product_code: 'MAFFL2-TPLNDRUA' })],
      [2024],
    );
    expect(normalized?.[0].product_code).toBe('MAFFL2-TPLNDRUA');
  });

  it.each([
    ['no credits', []],
    ['a null answer', null],
    ['unparseable text', 'the invoice states no credits'],
    ['a zero amount', [{ year: '2024', product_name: 'X', cost: '0' }]],
    ['no amount', [{ year: '2024', product_name: 'X', cost: null }]],
    ['no product name', [{ year: '2024', product_name: null, cost: '10' }]],
    [
      'a name with neither letters nor digits',
      [{ year: '2024', product_name: '---', cost: '10' }],
    ],
  ])('returns undefined for %s, so existing rows are kept', (_label, input) => {
    expect(normalizeCreditsList(input, [2024])).toBeUndefined();
  });

  it('drops only the unusable lines when some are usable', () => {
    const normalized = normalizeCreditsList(
      [credit(), { year: '2024', product_name: '', cost: '10' }],
      [2024],
    );
    expect(normalized).toHaveLength(1);
    expect(normalized?.[0].name).toBe('J.P. Morgan CEMBI USD');
  });

  it('survives a date where a year belongs', () => {
    const normalized = normalizeCreditsList(
      [credit({ year: '20240101' })],
      [2024, 20240101],
    );
    expect(normalized).toHaveLength(1);
    expect(normalized?.[0].amount).toBe(9289.62);
  });

  it('places a credit whose year is unreadable on year 1', () => {
    const normalized = normalizeCreditsList([credit({ year: 'n/a' })], [2024]);
    expect(normalized?.[0].year).toBe(1);
  });

  it('derives years from the credits when no product years are given', () => {
    const normalized = normalizeCreditsList([
      credit({ year: '2024' }),
      credit({ year: '2025' }),
    ]);
    expect(normalized?.map((entry) => entry.year)).toEqual([1, 2]);
  });
});
