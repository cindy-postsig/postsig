import { filterInventoryByVendor } from '@/lib/v2/inventory/transforms';
import type { InventoryItem } from '@/lib/v2/inventory/types';

const item = (id: string, vendorId: number | null | undefined) =>
  ({ id, vendorId }) as InventoryItem;

describe('filterInventoryByVendor', () => {
  it('keeps only the rows booked under the vendor', () => {
    const rows = filterInventoryByVendor(
      [item('a', 1), item('b', 2), item('c', 1)],
      1,
    );
    expect(rows.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('drops rows with no vendor id', () => {
    expect(
      filterInventoryByVendor([item('a', null), item('b', undefined)], 1),
    ).toEqual([]);
  });
});
