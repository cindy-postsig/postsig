import { getCurrentTermProducts } from '@/lib/v2/products/transforms';
import { contractTypes } from '@/app/lib/constants';

const detail = (
  id: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id,
  product_id: 10,
  year: 1,
  fees: 595,
  sort_order: id,
  vendor_products: { id: 10, name: 'Bloomberg Anywhere' },
  ...overrides,
});

const contract = (typeId: number, details: unknown[]) => ({
  id: 1,
  type_id: typeId,
  currency: 'USD',
  term_start_date: [{ date: '2026-01-01', updated_at: '2026-01-01' }],
  term_end_date: [{ date: '2026-12-31', updated_at: '2026-01-01' }],
  vendor_products_details: details,
  vendor_products_users: [],
});

const rows = (typeId: number, details: unknown[]) => {
  const { productsByYear } = getCurrentTermProducts(contract(typeId, details));
  return Object.values(productsByYear).flat();
};

describe('Products Licensed on an invoice', () => {
  it.each([
    ['Invoice', contractTypes.Invoice],
    ['Exchange Agreement Invoice', contractTypes.EAINV],
  ])('shows both lines for a repeated product on a %s', (_label, typeId) => {
    const result = rows(typeId, [detail(1), detail(2, { fees: 1106 })]);
    expect(result).toHaveLength(2);
    expect(result.map((r: any) => r.fees)).toEqual([595, 1106]);
  });

  // Without this the fee input on the second line writes to the first line's
  // row, because product-and-year cannot tell the two apart.
  it('carries each line its own vendor_products_details id', () => {
    const result = rows(contractTypes.Invoice, [
      detail(1),
      detail(2, { fees: 1106 }),
    ]);
    expect(result.map((r: any) => r.id)).toEqual([1, 2]);
  });

  it('keeps the recorded order of the lines', () => {
    const result = rows(contractTypes.Invoice, [
      detail(1, { sort_order: 2, fees: 100 }),
      detail(2, { sort_order: 1, fees: 200 }),
    ]);
    expect(result.map((r: any) => r.fees)).toEqual([200, 100]);
  });

  it('still groups an invoice that records more than one year', () => {
    const { productsByYear } = getCurrentTermProducts(
      contract(contractTypes.Invoice, [
        detail(1),
        detail(2, { year: 2, fees: 700 }),
      ]),
    );
    expect(Object.keys(productsByYear).sort()).toEqual(['1', '2']);
    expect(productsByYear['2'][0].fees).toBe(700);
  });

  it('leaves a single-line invoice as one row', () => {
    expect(rows(contractTypes.Invoice, [detail(1)])).toHaveLength(1);
  });
});

/**
 * The price-history path is what prices renewals and compounds annual
 * increases, so a service order must keep using it. Only invoices bypass it.
 */
describe('Products Licensed on a non-invoice', () => {
  it('still collapses a repeated product on a service order', () => {
    const result = rows(contractTypes.SO, [detail(1), detail(2)]);
    expect(result).toHaveLength(1);
  });

  it('leaves the row without a vendor_products_details id', () => {
    const result = rows(contractTypes.SO, [detail(1)]);
    expect(result[0].id ?? null).toBeNull();
  });
});
