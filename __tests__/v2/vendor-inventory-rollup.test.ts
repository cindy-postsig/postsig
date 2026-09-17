jest.mock('@/data/users', () => ({ getUserMetadata: jest.fn() }));
jest.mock('@/lib/settings/default-cost-method', () => ({
  getDefaultCostMethod: jest.fn(),
}));
jest.mock('@/app/api/v2/handlers/spend/query', () => ({
  runSpendQuery: jest.fn(),
}));
jest.mock('@/lib/v2/bloomberg-sid/population', () => ({
  loadSidSpendPopulation: jest.fn(),
}));
const getInventoryList = jest.fn();
jest.mock('@/lib/v2/inventory/service', () => ({
  getInventoryList: () => getInventoryList(),
}));

import { getVendorInventory } from '@/lib/v2/vendors/service';

describe('getVendorInventory', () => {
  it("leaves the Inventory tab's Bloomberg rollup row out of the vendor page", async () => {
    getInventoryList.mockResolvedValue({
      items: [
        { id: '1-product-2', vendorId: 469, vendor: 'Bloomberg' },
        { id: 'bloomberg:469', vendorId: 469, vendor: 'Bloomberg' },
        { id: '3-product-4', vendorId: 7, vendor: 'Other' },
      ],
      count: 3,
    });

    const items = await getVendorInventory(469);

    expect(items.map((item) => item.id)).toEqual(['1-product-2']);
  });
});
