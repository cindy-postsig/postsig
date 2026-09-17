import { buildProductSubRows } from '@/lib/v2/contracts/transforms';
import { contractTypes } from '@/app/lib/constants';

const detail = (
  id: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id,
  product_id: 10,
  year: 1,
  fees: 810000,
  sort_order: id,
  vendor_products: { id: 10, name: 'Test1' },
  ...overrides,
});

const baseRow: any = {
  currency: 'USD',
  termStartDate: '2026-08-05',
  fiscalYearStart: 1,
};

const enriched = (typeId: number, details: unknown[]): any => ({
  id: 1,
  contract: { id: 1, type_id: typeId, vendor_products_details: details },
  // Enrichment groups by product id, so the repeated product arrives merged.
  products: [
    { product_id: 10, name: 'Test1', fees: 812000, year: 1, sort_order: 1 },
    {
      product_id: 11,
      name: 'Test vendor product',
      fees: 1000,
      year: 1,
      sort_order: 3,
    },
  ],
  engineSpend: {
    products: { 10: { currentNative: 810000, projectedNative: 2000 } },
  },
});

const rowsFor = (typeId: number, details: unknown[]) =>
  buildProductSubRows(enriched(typeId, details), baseRow);

describe('invoice product sub-rows', () => {
  const threeLines = [
    detail(1),
    detail(2, { fees: 2000 }),
    detail(3, {
      product_id: 11,
      fees: 1000,
      vendor_products: { id: 11, name: 'Test vendor product' },
    }),
  ];

  it('shows one row per invoice line, not one per product', () => {
    const rows = rowsFor(contractTypes.Invoice, threeLines);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.vendor_products.name)).toEqual([
      'Test1',
      'Test1',
      'Test vendor product',
    ]);
  });

  it('gives each line its own recorded fee', () => {
    const rows = rowsFor(contractTypes.Invoice, threeLines);
    expect(rows.map((r) => r.currentBudget)).toEqual([810000, 2000, 1000]);
  });

  it('projects nothing, matching the parent invoice row', () => {
    const rows = rowsFor(contractTypes.Invoice, threeLines);
    expect(rows.map((r) => r.projectedBudget)).toEqual([null, null, null]);
  });

  it('keys each row on its own line id so two lines cannot collide', () => {
    const rows = rowsFor(contractTypes.Invoice, threeLines);
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
  });

  it('sums back to the invoice total', () => {
    const rows = rowsFor(contractTypes.Invoice, threeLines);
    const total = rows.reduce((sum, r) => sum + r.currentBudget, 0);
    expect(total).toBe(813000);
  });

  it('expands an invoice whose only two lines share a product', () => {
    const rows = rowsFor(contractTypes.Invoice, [
      detail(1),
      detail(2, { fees: 2000 }),
    ]);
    expect(rows).toHaveLength(2);
  });

  it('does not expand a single-line invoice', () => {
    expect(rowsFor(contractTypes.Invoice, [detail(1)])).toEqual([]);
  });

  it('orders the lines as recorded', () => {
    const rows = rowsFor(contractTypes.Invoice, [
      detail(1, { sort_order: 2, fees: 100 }),
      detail(2, { sort_order: 1, fees: 200 }),
    ]);
    expect(rows.map((r) => r.currentBudget)).toEqual([200, 100]);
  });
});

describe('non-invoice product sub-rows', () => {
  // A service order's sub-rows still answer per product per window, because
  // that is what prices its renewals.
  it('still reads the engine stamps', () => {
    const rows = rowsFor(contractTypes.SO, [detail(1), detail(2)]);
    expect(rows).toHaveLength(2);
    const test1 = rows.find((r) => r.vendor_products.id === 10);
    expect(test1?.currentBudget).toBe(810000);
    expect(test1?.projectedBudget).toBe(2000);
  });
});
