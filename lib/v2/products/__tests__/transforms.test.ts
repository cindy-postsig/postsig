import { getCurrentTermProducts } from '../transforms';

function makeProduct(
  id: number,
  name: string,
  fees: number,
  sortOrder?: number | null,
) {
  return {
    product_id: id,
    fees,
    sort_order: sortOrder ?? null,
    vendor_products: { id, name },
  };
}

function getProductNames(result: ReturnType<typeof getCurrentTermProducts>) {
  return result.productsByYear['1']?.map(
    (p: { vendor_products: { name: string } }) => p.vendor_products.name,
  );
}

describe('getCurrentTermProducts', () => {
  describe('sort_order sorting', () => {
    it('sorts products by sort_order when set', () => {
      const result = getCurrentTermProducts({
        vendor_products_details: [
          makeProduct(1, 'Gamma', 100, 3),
          makeProduct(2, 'Alpha', 200, 1),
          makeProduct(3, 'Beta', 150, 2),
        ],
      });

      expect(getProductNames(result)).toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    it('falls back to product_id when sort_order is null', () => {
      const result = getCurrentTermProducts({
        vendor_products_details: [
          makeProduct(30, 'C', 100),
          makeProduct(10, 'A', 200),
          makeProduct(20, 'B', 150),
        ],
      });

      expect(getProductNames(result)).toEqual(['A', 'B', 'C']);
    });

    it('sorts null sort_order after explicit sort_order', () => {
      const result = getCurrentTermProducts({
        vendor_products_details: [
          makeProduct(1, 'NoOrder', 100, null),
          makeProduct(2, 'First', 200, 1),
          makeProduct(3, 'AlsoNoOrder', 150, null),
        ],
      });

      const names = getProductNames(result);
      expect(names[0]).toBe('First');
      expect(names).toContain('NoOrder');
      expect(names).toContain('AlsoNoOrder');
    });

    it('uses product_id as tiebreaker for equal sort_order', () => {
      const result = getCurrentTermProducts({
        vendor_products_details: [
          makeProduct(20, 'Second', 100, 1),
          makeProduct(10, 'First', 200, 1),
        ],
      });

      expect(getProductNames(result)).toEqual(['First', 'Second']);
    });

    it('handles mixed sort_order and null values', () => {
      const result = getCurrentTermProducts({
        vendor_products_details: [
          makeProduct(5, 'E', 100, null),
          makeProduct(1, 'Third', 200, 3),
          makeProduct(2, 'First', 150, 1),
          makeProduct(3, 'D', 120, null),
          makeProduct(4, 'Second', 180, 2),
        ],
      });

      expect(getProductNames(result)).toEqual([
        'First',
        'Second',
        'Third',
        'D',
        'E',
      ]);
    });
  });
});
