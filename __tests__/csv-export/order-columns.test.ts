import { orderExportColumns } from '@/lib/csv-export/order-columns';

// Mirrors the contracts exportCSV mapping shape: a leading id, a handful of
// configurable columns, then rich fields the list view never exposes.
const idToKey = {
  vendor: 'vendor',
  orderNumber: 'order_number',
  product: 'product_name',
  currentBudget: 'product_fee',
  tags: 'tags',
};
const allKeys = [
  'id',
  'vendor',
  'order_number',
  'product_name',
  'product_fee',
  'payment_terms',
  'distribution_rights',
  'tags',
  'geo_restrictions',
];

describe('orderExportColumns', () => {
  it('places visible configurable columns first in the user order', () => {
    const result = orderExportColumns({
      visibleIds: ['product', 'vendor', 'currentBudget'],
      idToKey,
      allKeys,
      leadingKeys: ['id'],
    });

    expect(result.slice(0, 4)).toEqual([
      'id',
      'product_name',
      'vendor',
      'product_fee',
    ]);
  });

  it('appends the remaining rich fields after the configurable ones', () => {
    const result = orderExportColumns({
      visibleIds: ['vendor'],
      idToKey,
      allKeys,
      leadingKeys: ['id'],
    });

    expect(result).toEqual([
      'id',
      'vendor',
      'payment_terms',
      'distribution_rights',
      'geo_restrictions',
    ]);
  });

  it('drops a hidden configurable column entirely', () => {
    const result = orderExportColumns({
      visibleIds: ['vendor'],
      idToKey,
      allKeys,
      leadingKeys: ['id'],
    });

    // `order_number`, `product_name`, `product_fee`, `tags` are configurable but
    // not visible, so none of them appear.
    expect(result).not.toContain('order_number');
    expect(result).not.toContain('product_name');
    expect(result).not.toContain('tags');
  });

  it('ignores unmapped or unknown ids without throwing', () => {
    const result = orderExportColumns({
      visibleIds: ['folder', 'projectedBudget', 'vendor'],
      idToKey,
      allKeys,
      leadingKeys: ['id'],
    });

    expect(result[0]).toBe('id');
    expect(result[1]).toBe('vendor');
  });

  it('never duplicates a leading key that is also mapped', () => {
    const result = orderExportColumns({
      visibleIds: ['vendor'],
      idToKey: { ...idToKey, docId: 'id' },
      allKeys,
      leadingKeys: ['id'],
    });

    expect(result.filter((key) => key === 'id')).toHaveLength(1);
  });
});
