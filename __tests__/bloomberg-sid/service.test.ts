const fetchFirmwideAccounts = jest.fn();
const fetchLatestSidProducts = jest.fn();
jest.mock('@/lib/v2/bloomberg-sid/queries', () => ({
  fetchFirmwideAccounts: (...args: unknown[]) => fetchFirmwideAccounts(...args),
  fetchLatestSidProducts: (...args: unknown[]) =>
    fetchLatestSidProducts(...args),
}));
jest.mock('@/data/users', () => ({ getUserMetadata: jest.fn() }));

import { getSidVendorInventoryItems } from '@/lib/v2/bloomberg-sid/service';
import type { SeatRoster } from '@/lib/v2/seats/types';

const EVERYONE: SeatRoster = {
  isActiveEmployee: () => true,
  matchActiveNames: () => () => true,
};

const account = (id: number, firmwideId: number, vendorId: number) => ({
  id,
  firmwideId,
  vendorId,
  vendor: { name: `Vendor ${vendorId}`, domain: null },
});
const product = (gptt: number, seats: number, monthlyCost: number) => ({
  gptt,
  description: `Product ${gptt}`,
  seats,
  monthlyCost,
  entitlementsCost: 0,
  entitledSeats: 0,
  reportMonth: '2026-04-01',
  holders: [{ name: `user ${gptt}`, dormant: false }],
  earliestContractDate: '2020-03-02',
  latestRenewalDate: '2026-03-02',
});

describe('getSidVendorInventoryItems', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is empty, without reading products, for an org with no firmwide accounts', async () => {
    fetchFirmwideAccounts.mockResolvedValue([]);

    expect(await getSidVendorInventoryItems('org-1', EVERYONE)).toEqual([]);
    expect(fetchLatestSidProducts).not.toHaveBeenCalled();
  });

  it('builds one row per vendor, folding several firmwide accounts together', async () => {
    fetchFirmwideAccounts.mockResolvedValue([
      account(1, 100, 469),
      account(2, 200, 469),
      account(3, 300, 7),
    ]);
    fetchLatestSidProducts.mockImplementation(
      async (_org: string, firmwideId: number) =>
        firmwideId === 100
          ? [product(28, 3, 100)]
          : firmwideId === 200
            ? [product(30, 1, 50)]
            : [],
    );

    const items = await getSidVendorInventoryItems(
      'org-1',
      Promise.resolve(EVERYONE),
    );

    expect(fetchFirmwideAccounts).toHaveBeenCalledWith('org-1');
    expect(
      items.map((item) => [item.id, item.licensesCount, item.cost]),
    ).toEqual([['bloomberg:469', 4, 1800]]);
  });

  it('counts active users per seat, off the roster it is handed', async () => {
    fetchFirmwideAccounts.mockResolvedValue([account(1, 100, 469)]);
    fetchLatestSidProducts.mockResolvedValue([
      {
        ...product(28, 3, 100),
        holders: [
          { name: 'user a', dormant: false },
          { name: 'user a', dormant: false },
          { name: 'user b', dormant: false },
        ],
      },
    ]);
    const roster: SeatRoster = {
      isActiveEmployee: () => true,
      matchActiveNames: () => (name) => name === 'user a',
    };

    const [item] = await getSidVendorInventoryItems('org-1', roster);

    expect(item.licensesCount).toBe(3);
    expect(item.activeUsers.map((user) => user.name)).toEqual([
      'user a',
      'user a',
    ]);
  });
});
