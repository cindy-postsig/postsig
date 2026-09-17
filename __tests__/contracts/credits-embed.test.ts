import { describe, expect, it } from '@jest/globals';
import {
  contractCredits,
  creditsByYear,
  creditsFromEmbed,
  creditsTotal,
} from '@/lib/v2/credits';
import type { RawContractCreditRow } from '@/lib/v2/credits';

const row = (
  overrides: Partial<RawContractCreditRow> = {},
): RawContractCreditRow => ({
  id: 1,
  product_id: 10,
  year: 1,
  amount: 9289.62,
  sort_order: 0,
  vendor_products: { id: 10, name: 'J.P. Morgan CEMBI USD' },
  ...overrides,
});

describe('creditsFromEmbed', () => {
  it('maps a credit row to the shape the table renders', () => {
    expect(creditsFromEmbed([row()])).toEqual([
      {
        id: 1,
        productId: 10,
        year: 1,
        amount: 9289.62,
        name: 'J.P. Morgan CEMBI USD',
        productCode: null,
      },
    ]);
  });

  it.each([
    ['an empty array', [] as RawContractCreditRow[]],
    ['null', null],
    ['undefined', undefined],
  ])('returns no credits for %s', (_label, rows) => {
    expect(creditsFromEmbed(rows)).toEqual([]);
  });

  it('orders by sort_order, not by the order PostgREST returned', () => {
    const credits = creditsFromEmbed([
      row({
        id: 2,
        sort_order: 1,
        vendor_products: { id: 11, name: 'Second' },
      }),
      row({ id: 1, sort_order: 0, vendor_products: { id: 10, name: 'First' } }),
    ]);
    expect(credits.map((credit) => credit.name)).toEqual(['First', 'Second']);
  });

  it('falls back to row id when sort_order is absent', () => {
    // Rows written before sort_order existed must still render in a stable
    // order rather than whichever way the driver happens to sort nulls.
    const credits = creditsFromEmbed([
      row({
        id: 7,
        sort_order: null,
        vendor_products: { id: 11, name: 'Later' },
      }),
      row({
        id: 3,
        sort_order: null,
        vendor_products: { id: 10, name: 'Earlier' },
      }),
    ]);
    expect(credits.map((credit) => credit.name)).toEqual(['Earlier', 'Later']);
  });

  it('reads a numeric amount returned as a string', () => {
    expect(creditsFromEmbed([row({ amount: '9289.62' })])[0].amount).toBe(
      9289.62,
    );
  });

  it('skips a row whose product join is missing rather than rendering blank', () => {
    expect(creditsFromEmbed([row({ vendor_products: null })])).toEqual([]);
  });

  it('skips a row whose amount is not a number rather than rendering NaN', () => {
    expect(creditsFromEmbed([row({ amount: 'n/a' })])).toEqual([]);
  });

  it('keeps a product code when the row carries one', () => {
    const credits = creditsFromEmbed([
      row({
        vendor_products: { id: 10, name: 'ENX Milan', product_code: 'MAFFL2' },
      }),
    ]);
    expect(credits[0].productCode).toBe('MAFFL2');
  });
});

describe('creditsByYear', () => {
  it('groups by relative year, keyed as strings like productsByYear', () => {
    const grouped = creditsByYear(
      creditsFromEmbed([
        row({ id: 1, year: 1 }),
        row({ id: 2, year: 2, vendor_products: { id: 11, name: 'Other' } }),
        row({ id: 3, year: 1, vendor_products: { id: 12, name: 'Third' } }),
      ]),
    );
    expect(Object.keys(grouped).sort()).toEqual(['1', '2']);
    expect(grouped['1']).toHaveLength(2);
    expect(grouped['2']).toHaveLength(1);
  });

  it('returns an empty map for no credits', () => {
    expect(creditsByYear([])).toEqual({});
  });
});

describe('creditsTotal', () => {
  it('sums the magnitudes', () => {
    // The example invoice: two equal credits reconciling 67,500 to 48,920.76.
    const total = creditsTotal(
      creditsFromEmbed([
        row({ id: 1 }),
        row({ id: 2, vendor_products: { id: 11, name: 'Other' } }),
      ]),
    );
    expect(total).toBeCloseTo(18579.24, 2);
  });

  it('is zero for no credits', () => {
    expect(creditsTotal([])).toBe(0);
  });
});

describe('contractCredits', () => {
  it('reads the embed off a contract row', () => {
    expect(contractCredits({ contract_product_credits: [row()] })).toHaveLength(
      1,
    );
  });

  it('returns no credits for a contract that has none', () => {
    expect(contractCredits({})).toEqual([]);
  });
});
