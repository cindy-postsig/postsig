import type { EnrichedProduct } from '@/lib/v2/core/types';
import { buildInventoryItem } from '@/lib/v2/inventory/transforms';
import type { SeatRoster } from '@/lib/v2/seats/types';

const sourceContract = {
  id: 1,
  status: 'active',
  currency: 'usd',
  term_start_date: [{ date: '2026-01-01' }],
  term_end_date: [{ date: '2026-12-31' }],
  vendor_products_details: [],
  vendor_products_users: [{ product_id: 100, number_of_users: 3 }],
  contract_users: [
    { id: 1, name: 'Ada', email: 'ada@x', product_id: 100, org_employee_id: 1 },
    { id: 2, name: 'Bob', email: 'bob@x', product_id: 100, org_employee_id: 2 },
    {
      id: 3,
      name: 'Legacy',
      email: 'l@x',
      product_id: 100,
      org_employee_id: null,
    },
    { id: 4, name: 'Other', email: 'o@x', product_id: 200, org_employee_id: 1 },
  ],
  contract_acl_group: [],
  folder_contracts: [],
} as never;

const product = {
  product_id: 100,
  name: 'Feed',
  vendor_id: 1,
  vendor_name: 'Acme',
  contract_id: 1,
  sourceContractId: 1,
  isSuperseded: false,
  isSuperseding: false,
  currentFee: 100,
  currency: 'USD',
  currentFeeUSD: 100,
  effectiveFeeUSD: 100,
} as EnrichedProduct;

const build = (roster: SeatRoster) =>
  buildInventoryItem({
    product,
    sourceContract,
    fiscalYearStartMonth: 1,
    contractsMap: new Map(),
    enrichedSourceContract: {
      priceHistory: { periods: [] },
      products: [],
    } as never,
    baseCurrency: 'USD',
    roster,
  });

const rosterOf = (activeIds: number[]): SeatRoster => ({
  isActiveEmployee: (id) => id !== null && activeIds.includes(id),
  matchActiveNames: () => () => true,
});

describe('buildInventoryItem active users', () => {
  it('counts the product’s seats whose holder the roster calls active', () => {
    const item = build(rosterOf([1]));

    expect(item.activeUsers.map((user) => user.name)).toEqual(['Ada']);
    expect(item.activeLicenses).toBe(1);
    expect(item.licensesCount).toBe(3);
  });

  it('counts every seat when the org has no roster to check', () => {
    const everyone: SeatRoster = {
      isActiveEmployee: () => true,
      matchActiveNames: () => () => true,
    };

    expect(build(everyone).activeUsers.map((user) => user.name)).toEqual([
      'Ada',
      'Bob',
      'Legacy',
    ]);
  });
});
