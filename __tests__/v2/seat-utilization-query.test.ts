import { describe, expect, it } from '@jest/globals';
import {
  runSeatUtilizationQuery,
  filterByTag,
  filterByBusinessGroup,
  filterBySponsor,
} from '@/lib/v2/chat/tools/queries';

jest.mock('@/utils/pino', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

type ContractMock = Parameters<typeof runSeatUtilizationQuery>[0][number];

interface SeatAllocation {
  product_id: number;
  number_of_users: number;
  vendor_products?: { name: string };
}

interface UserAssignment {
  id: number;
  name: string;
  email: string;
  product_id: number;
  vendor_products?: { name: string };
}

interface ProductDef {
  product_id: number;
  name: string;
  currentFee: number;
  isSuperseded?: boolean;
}

function buildProduct(p: ProductDef, contractId: number, currency: string) {
  return {
    product_id: p.product_id,
    name: p.name,
    fees: p.currentFee,
    year: 2026,
    sourceContractId: contractId,
    isSuperseded: p.isSuperseded ?? false,
    isSuperseding: false,
    currentFee: p.currentFee,
    currency,
    currentFeeUSD: p.currentFee,
    effectiveFeeUSD: p.currentFee,
  };
}

interface TagRef {
  id: number;
  tag_id: number;
  user_tags?: { id: number; name: string } | null;
}

interface ContractOverrides {
  contractTags?: TagRef[];
  /** Owner-group names carried on the contract's owners embed. */
  businessGroups?: string[];
  /** Owner-sponsor display names carried on the same embed. */
  sponsors?: string[];
  ownerRows?: unknown[];
}

function ownerEmbedRows(
  groups: readonly string[] = [],
  sponsors: readonly string[] = [],
) {
  let id = 0;
  return [
    ...groups.map((name, index) => ({
      id: ++id,
      role: 'group',
      user_id: null,
      org_employee_id: null,
      label: null,
      org_unit_id: index + 1,
      org_units: { name, level: 'business_group', parent_id: null },
    })),
    ...sponsors.map((label) => ({
      id: ++id,
      role: 'sponsor',
      user_id: null,
      org_employee_id: null,
      label,
      org_unit_id: null,
    })),
  ];
}

function buildContractFields(
  overrides: ContractOverrides,
): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  if (overrides.contractTags !== undefined)
    extras.contract_tags = overrides.contractTags;
  if (overrides.ownerRows !== undefined) {
    extras.contract_owners = overrides.ownerRows;
  } else if (
    overrides.businessGroups !== undefined ||
    overrides.sponsors !== undefined
  ) {
    extras.contract_owners = ownerEmbedRows(
      overrides.businessGroups,
      overrides.sponsors,
    );
  }
  return extras;
}

function makeContract(
  id: number,
  seats: SeatAllocation[],
  users: UserAssignment[],
  products: ProductDef[],
  vendorName = 'TestVendor',
  currency = 'USD',
  overrides: ContractOverrides = {},
): ContractMock {
  const base = {
    id,
    vendors: { name: vendorName },
    type_id: 1,
    currency,
    vendor_products_users: seats,
    contract_users: users,
  };
  const contract = { ...base, ...buildContractFields(overrides) };
  return {
    id,
    vendor_id: 1,
    vendor_name: vendorName,
    contract,
    products: products.map((p) => buildProduct(p, id, currency)),
    priceHistory: null,
    isLinkedChildInvoice: false,
  } as ContractMock;
}

function makeUser(
  id: number,
  name: string,
  productId: number,
  productName: string,
): UserAssignment {
  return {
    id,
    name,
    email: `${name.toLowerCase()}@test.com`,
    product_id: productId,
    vendor_products: { name: productName },
  };
}

function makeSeat(
  productId: number,
  count: number,
  name: string,
): SeatAllocation {
  return {
    product_id: productId,
    number_of_users: count,
    vendor_products: { name },
  };
}

describe('runSeatUtilizationQuery', () => {
  it('excludes contracts without allocated seats', () => {
    const contracts = [
      makeContract(
        1,
        [makeSeat(10, 5, 'Product A')],
        [],
        [{ product_id: 10, name: 'Product A', currentFee: 1000 }],
      ),
      makeContract(
        2,
        [],
        [],
        [{ product_id: 20, name: 'Product B', currentFee: 500 }],
      ),
    ];

    const result = runSeatUtilizationQuery(contracts);
    expect(result.count).toBe(1);
    expect(result.contracts[0].id).toBe(1);
  });

  it('calculates correct utilization metrics', () => {
    const users = Array.from({ length: 6 }, (_, i) =>
      makeUser(i + 1, `User${i + 1}`, 10, 'Terminal'),
    );
    const contracts = [
      makeContract(1, [makeSeat(10, 10, 'Terminal')], users, [
        { product_id: 10, name: 'Terminal', currentFee: 10000 },
      ]),
    ];

    const result = runSeatUtilizationQuery(contracts);
    const c = result.contracts[0];
    expect(c.allocatedSeats).toBe(10);
    expect(c.usedSeats).toBe(6);
    expect(c.unusedSeats).toBe(4);
    expect(c.utilizationPercentage).toBe(60);
    expect(c.unusedSeatsValue).toBe(4000);
  });

  it('filters by productName (case-insensitive)', () => {
    const contracts = [
      makeContract(
        1,
        [makeSeat(10, 5, 'Bloomberg Terminal'), makeSeat(20, 3, 'Data Feed')],
        [makeUser(1, 'Alice', 10, 'Bloomberg Terminal')],
        [
          { product_id: 10, name: 'Bloomberg Terminal', currentFee: 5000 },
          { product_id: 20, name: 'Data Feed', currentFee: 3000 },
        ],
      ),
    ];

    const result = runSeatUtilizationQuery(contracts, 'bloomberg terminal');
    expect(result.count).toBe(1);
    const c = result.contracts[0];
    expect(c.productName).toBe('Bloomberg Terminal');
    expect(c.allocatedSeats).toBe(5);
    expect(c.usedSeats).toBe(1);
    expect(c.unusedSeats).toBe(4);
  });

  it('returns empty result when no contracts have seat allocations', () => {
    const contracts = [
      makeContract(1, [], [], []),
      makeContract(2, [], [], []),
    ];

    const result = runSeatUtilizationQuery(contracts);
    expect(result.count).toBe(0);
    expect(result.totalAllocatedSeats).toBe(0);
    expect(result.totalUsedSeats).toBe(0);
    expect(result.totalUnusedSeats).toBe(0);
    expect(result.overallUtilizationPercentage).toBe(0);
    expect(result.totalUnusedSeatsValue).toBe(0);
    expect(result.contracts).toEqual([]);
  });

  it('returns per-product breakdown for multi-product contracts', () => {
    const contracts = [
      makeContract(
        1,
        [makeSeat(10, 4, 'Product A'), makeSeat(20, 6, 'Product B')],
        [
          makeUser(1, 'Alice', 10, 'Product A'),
          makeUser(2, 'Bob', 20, 'Product B'),
          makeUser(3, 'Carol', 20, 'Product B'),
        ],
        [
          { product_id: 10, name: 'Product A', currentFee: 4000 },
          { product_id: 20, name: 'Product B', currentFee: 6000 },
        ],
      ),
    ];

    const result = runSeatUtilizationQuery(contracts);
    const c = result.contracts[0];
    expect(c.productName).toBeUndefined();
    expect(c.products).toHaveLength(2);

    const prodA = c.products!.find((p) => p.productName === 'Product A')!;
    expect(prodA.allocatedSeats).toBe(4);
    expect(prodA.usedSeats).toBe(1);
    expect(prodA.unusedSeats).toBe(3);

    const prodB = c.products!.find((p) => p.productName === 'Product B')!;
    expect(prodB.allocatedSeats).toBe(6);
    expect(prodB.usedSeats).toBe(2);
    expect(prodB.unusedSeats).toBe(4);
  });

  it('excludes contracts with no matching product when productName given', () => {
    const contracts = [
      makeContract(
        1,
        [makeSeat(10, 5, 'Product A')],
        [],
        [{ product_id: 10, name: 'Product A', currentFee: 1000 }],
      ),
    ];

    const result = runSeatUtilizationQuery(contracts, 'Nonexistent');
    expect(result.count).toBe(0);
    expect(result.contracts).toEqual([]);
  });

  it('computes correct aggregate totals across multiple contracts', () => {
    const contracts = [
      makeContract(
        1,
        [makeSeat(10, 10, 'P1')],
        [makeUser(1, 'A', 10, 'P1'), makeUser(2, 'B', 10, 'P1')],
        [{ product_id: 10, name: 'P1', currentFee: 5000 }],
      ),
      makeContract(
        2,
        [makeSeat(20, 8, 'P2')],
        [
          makeUser(3, 'C', 20, 'P2'),
          makeUser(4, 'D', 20, 'P2'),
          makeUser(5, 'E', 20, 'P2'),
        ],
        [{ product_id: 20, name: 'P2', currentFee: 4000 }],
      ),
    ];

    const result = runSeatUtilizationQuery(contracts);
    expect(result.count).toBe(2);
    expect(result.totalAllocatedSeats).toBe(18);
    expect(result.totalUsedSeats).toBe(5);
    expect(result.totalUnusedSeats).toBe(13);
    expect(result.overallUtilizationPercentage).toBe(28);
    // Contract 1: 8 unused * (5000/10) = 4000
    // Contract 2: 5 unused * (4000/8) = 2500
    expect(result.totalUnusedSeatsValue).toBe(6500);
  });

  it('excludes superseded products from seat counts', () => {
    const contracts = [
      makeContract(
        1,
        [makeSeat(10, 5, 'Old Product'), makeSeat(20, 8, 'New Product')],
        [makeUser(1, 'Alice', 20, 'New Product')],
        [
          {
            product_id: 10,
            name: 'Old Product',
            currentFee: 3000,
            isSuperseded: true,
          },
          { product_id: 20, name: 'New Product', currentFee: 5000 },
        ],
      ),
    ];

    const result = runSeatUtilizationQuery(contracts);
    expect(result.count).toBe(1);
    const c = result.contracts[0];
    // Only New Product should be counted (Old Product is superseded)
    expect(c.allocatedSeats).toBe(8);
    expect(c.usedSeats).toBe(1);
    expect(c.unusedSeats).toBe(7);
    expect(c.productName).toBe('New Product');
  });

  it('returns empty when all products are superseded', () => {
    const contracts = [
      makeContract(
        1,
        [makeSeat(10, 5, 'Old Product')],
        [],
        [
          {
            product_id: 10,
            name: 'Old Product',
            currentFee: 3000,
            isSuperseded: true,
          },
        ],
      ),
    ];

    const result = runSeatUtilizationQuery(contracts);
    // Seats exist at DB level but product is superseded, so no usage computed
    expect(result.count).toBe(0);
    expect(result.contracts).toEqual([]);
  });
});

function makeTag(id: number, tagId: number, name: string): TagRef {
  return { id, tag_id: tagId, user_tags: { id: tagId, name } };
}

function makeSimpleContract(
  id: number,
  vendorName: string,
  overrides: ContractOverrides = {},
): ContractMock {
  const seats = [makeSeat(id * 10, 5, 'Product')];
  const products = [{ product_id: id * 10, name: 'Product', currentFee: 1000 }];
  return makeContract(id, seats, [], products, vendorName, 'USD', overrides);
}

describe('filterByTag', () => {
  it('returns all contracts when tagName is undefined', () => {
    const contracts = [
      makeSimpleContract(1, 'V1'),
      makeSimpleContract(2, 'V2'),
    ];
    expect(filterByTag(contracts)).toHaveLength(2);
    expect(filterByTag(contracts, undefined)).toHaveLength(2);
  });

  it('matches exact tag name case-insensitively', () => {
    const contracts = [
      makeSimpleContract(1, 'V1', {
        contractTags: [makeTag(1, 10, 'Critical')],
      }),
      makeSimpleContract(2, 'V2', {
        contractTags: [makeTag(2, 20, 'Low Priority')],
      }),
    ];
    const result = filterByTag(contracts, 'critical');
    expect(result).toHaveLength(1);
    expect(result[0].contract.id).toBe(1);
  });

  it('does not match substrings (exact match only)', () => {
    const contracts = [
      makeSimpleContract(1, 'V1', {
        contractTags: [makeTag(1, 10, 'Critical Systems')],
      }),
    ];
    expect(filterByTag(contracts, 'Critical')).toHaveLength(0);
  });

  it('skips contracts without tags', () => {
    const contracts = [
      makeSimpleContract(1, 'V1', { contractTags: [] }),
      makeSimpleContract(2, 'V2'),
    ];
    expect(filterByTag(contracts, 'Anything')).toHaveLength(0);
  });
});

describe('filterByBusinessGroup', () => {
  it('returns all contracts when businessGroupName is undefined', () => {
    const contracts = [
      makeSimpleContract(1, 'V1'),
      makeSimpleContract(2, 'V2'),
    ];
    expect(filterByBusinessGroup(contracts)).toHaveLength(2);
  });

  it('matches an owner business group by substring (case-insensitive)', () => {
    const contracts = [
      makeSimpleContract(1, 'V1', { businessGroups: ['Equity Research'] }),
      makeSimpleContract(2, 'V2', { businessGroups: ['Fixed Income'] }),
    ];
    const result = filterByBusinessGroup(contracts, 'equity');
    expect(result).toHaveLength(1);
    expect(result[0].contract.id).toBe(1);
  });

  it('matches any group of a multi-group contract', () => {
    const contracts = [
      makeSimpleContract(1, 'V1', {
        businessGroups: ['Trading', 'Risk Management'],
      }),
    ];
    const result = filterByBusinessGroup(contracts, 'Risk');
    expect(result).toHaveLength(1);
  });

  it('returns empty when no groups match, and for a contract with no owners', () => {
    const contracts = [
      makeSimpleContract(1, 'V1', { businessGroups: ['Trading'] }),
      makeSimpleContract(2, 'V2'),
    ];
    expect(filterByBusinessGroup(contracts, 'Compliance')).toHaveLength(0);
  });
});

describe('filterBySponsor', () => {
  it('returns all contracts when sponsorName is undefined', () => {
    const contracts = [
      makeSimpleContract(1, 'V1'),
      makeSimpleContract(2, 'V2'),
    ];
    expect(filterBySponsor(contracts)).toHaveLength(2);
  });

  it("matches any of the contract's owner sponsors", () => {
    const contracts = [
      makeSimpleContract(1, 'V1', {
        sponsors: ['John Smith', 'Jane Doe'],
      }),
    ];
    expect(filterBySponsor(contracts, 'john')).toHaveLength(1);
    expect(filterBySponsor(contracts, 'Jane')).toHaveLength(1);
    expect(filterBySponsor(contracts, 'Bob')).toHaveLength(0);
  });

  it('matches a user sponsor on its display name', () => {
    const contracts = [
      makeSimpleContract(1, 'V1', {
        ownerRows: [
          {
            id: 1,
            role: 'sponsor',
            user_id: 'u-1',
            org_employee_id: null,
            label: null,
            org_unit_id: null,
            users: { name: 'Alice Wong', email: 'alice@example.com' },
          },
        ],
      }),
    ];
    expect(filterBySponsor(contracts, 'alice wong')).toHaveLength(1);
  });

  it('matches nothing when a contract has no owner sponsors', () => {
    const contracts = [
      makeSimpleContract(1, 'V1', { sponsors: [] }),
      makeSimpleContract(2, 'V2'),
    ];
    expect(filterBySponsor(contracts, 'anyone')).toHaveLength(0);
  });
});

describe('filter combination', () => {
  it('vendor + tag filters narrow results correctly', () => {
    const contracts = [
      makeSimpleContract(1, 'Bloomberg', {
        contractTags: [makeTag(1, 10, 'Critical')],
      }),
      makeSimpleContract(2, 'Bloomberg', {
        contractTags: [makeTag(2, 20, 'Low')],
      }),
      makeSimpleContract(3, 'MSCI', {
        contractTags: [makeTag(3, 10, 'Critical')],
      }),
    ];
    const byVendor = contracts.filter(
      (c) => c.contract.vendors?.name === 'Bloomberg',
    );
    const result = filterByTag(byVendor, 'Critical');
    expect(result).toHaveLength(1);
    expect(result[0].contract.id).toBe(1);
  });

  it('no-match filter returns empty seat utilization', () => {
    const contracts = [
      makeSimpleContract(1, 'Bloomberg', {
        contractTags: [makeTag(1, 10, 'Critical')],
      }),
    ];
    const filtered = filterByTag(contracts, 'NonexistentTag');
    const result = runSeatUtilizationQuery(filtered);
    expect(result.count).toBe(0);
    expect(result.totalAllocatedSeats).toBe(0);
    expect(result.totalUsedSeats).toBe(0);
    expect(result.totalUnusedSeats).toBe(0);
  });
});
