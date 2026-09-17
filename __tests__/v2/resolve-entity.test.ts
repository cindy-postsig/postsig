import { describe, expect, it } from '@jest/globals';
import {
  resolveEntity,
  buildEntityIndexes,
} from '@/lib/v2/chat/tools/resolve-entity';

jest.mock('@/utils/pino', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

type ContractMock = Parameters<typeof resolveEntity>[0][number];

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
  vendorProductsDetails?: Array<{ vendor_products?: { name?: string } }>;
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

function buildExtras(overrides: ContractOverrides): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  if (overrides.contractTags !== undefined)
    extras.contract_tags = overrides.contractTags;
  if (
    overrides.businessGroups !== undefined ||
    overrides.sponsors !== undefined
  )
    extras.contract_owners = ownerEmbedRows(
      overrides.businessGroups,
      overrides.sponsors,
    );
  if (overrides.vendorProductsDetails !== undefined)
    extras.vendor_products_details = overrides.vendorProductsDetails;
  return extras;
}

function makeContract(
  id: number,
  vendorName: string,
  overrides: ContractOverrides = {},
): ContractMock {
  const contract = {
    id,
    vendors: { name: vendorName },
    type_id: 1,
    currency: 'USD',
    vendor_products_users: [],
    ...buildExtras(overrides),
  };

  return {
    id,
    vendor_id: 1,
    vendor_name: vendorName,
    contract,
    products: [],
    priceHistory: null,
    isLinkedChildInvoice: false,
  } as ContractMock;
}

function makeTag(id: number, tagId: number, name: string): TagRef {
  return { id, tag_id: tagId, user_tags: { id: tagId, name } };
}

function makeProductDetail(name: string) {
  return { vendor_products: { name } };
}

// -- Shared test fixtures (kept outside describe blocks to avoid nesting) --

const bloombergOverrides: ContractOverrides = {
  vendorProductsDetails: [makeProductDetail('Bloomberg Terminal')],
  contractTags: [makeTag(1, 10, 'Critical')],
  businessGroups: ['Trading'],
  sponsors: ['John Bloomberg'],
};

const msciOverrides: ContractOverrides = {
  vendorProductsDetails: [makeProductDetail('ESG Data')],
  contractTags: [makeTag(2, 20, 'ESG')],
  sponsors: ['Jane Smith'],
};

const bloombergFeedOverrides: ContractOverrides = {
  vendorProductsDetails: [makeProductDetail('Bloomberg Data Feed')],
};

function buildResolveFixtures(): ContractMock[] {
  return [
    makeContract(1, 'Bloomberg', bloombergOverrides),
    makeContract(2, 'MSCI', msciOverrides),
    makeContract(3, 'Bloomberg', bloombergFeedOverrides),
  ];
}

// -- Tests --

describe('buildEntityIndexes', () => {
  it('indexes vendor names with correct contract counts', () => {
    const contracts = [
      makeContract(1, 'Bloomberg'),
      makeContract(2, 'Bloomberg'),
      makeContract(3, 'MSCI'),
    ];
    const indexes = buildEntityIndexes(contracts);
    expect(indexes.vendors.size).toBe(2);
    expect(indexes.vendors.get('bloomberg')?.name).toBe('Bloomberg');
    expect(indexes.vendors.get('bloomberg')?.contractIds.size).toBe(2);
  });

  it('indexes product names from vendor_products_details', () => {
    const overrides: ContractOverrides = {
      vendorProductsDetails: [
        makeProductDetail('Terminal'),
        makeProductDetail('Data Feed'),
      ],
    };
    const indexes = buildEntityIndexes([
      makeContract(1, 'Bloomberg', overrides),
    ]);
    expect(indexes.products.size).toBe(2);
    expect(indexes.products.has('terminal')).toBe(true);
    expect(indexes.products.has('data feed')).toBe(true);
  });

  it('indexes tag names across contracts', () => {
    const contracts = [
      makeContract(1, 'V1', { contractTags: [makeTag(1, 10, 'Critical')] }),
      makeContract(2, 'V2', {
        contractTags: [makeTag(2, 10, 'Critical'), makeTag(3, 20, 'ESG')],
      }),
    ];
    const indexes = buildEntityIndexes(contracts);
    expect(indexes.tags.size).toBe(2);
    expect(indexes.tags.get('critical')?.contractIds.size).toBe(2);
    expect(indexes.tags.get('esg')?.contractIds.size).toBe(1);
  });

  it('indexes business groups from the owners embed', () => {
    const contracts = [
      makeContract(1, 'V1', {
        businessGroups: ['Equity Research'],
      }),
    ];
    const indexes = buildEntityIndexes(contracts);
    expect(indexes.businessGroups.has('equity research')).toBe(true);
  });

  it('indexes a sponsor name from the owners embed', () => {
    const contracts = [makeContract(1, 'V1', { sponsors: ['John Smith'] })];
    const indexes = buildEntityIndexes(contracts);
    expect(indexes.sponsors.has('john smith')).toBe(true);
  });

  it('indexes every sponsor on a contract', () => {
    const contracts = [
      makeContract(1, 'V1', { sponsors: ['Alice Wong', 'Bob Lee'] }),
    ];
    const indexes = buildEntityIndexes(contracts);
    expect(indexes.sponsors.size).toBe(2);
    expect(indexes.sponsors.has('alice wong')).toBe(true);
    expect(indexes.sponsors.has('bob lee')).toBe(true);
  });
});

describe('resolveEntity', () => {
  it('finds vendor match', () => {
    const result = resolveEntity(buildResolveFixtures(), 'MSCI');
    const match = result.matches.find((m) => m.type === 'vendor');
    expect(match?.name).toBe('MSCI');
    expect(match?.contractCount).toBe(1);
  });

  it('finds matches across multiple entity types', () => {
    const result = resolveEntity(buildResolveFixtures(), 'Bloomberg');
    const types = new Set(result.matches.map((m) => m.type));
    expect(types.has('vendor')).toBe(true);
    expect(types.has('product')).toBe(true);
    expect(types.has('sponsor')).toBe(true);
  });

  it('is case-insensitive', () => {
    const result = resolveEntity(buildResolveFixtures(), 'bloomberg');
    expect(result.matches.length).toBeGreaterThan(0);
    const match = result.matches.find((m) => m.type === 'vendor');
    expect(match?.name).toBe('Bloomberg');
  });

  it('performs substring matching', () => {
    const result = resolveEntity(buildResolveFixtures(), 'ESG');
    const tagMatch = result.matches.find((m) => m.type === 'tag');
    const productMatch = result.matches.find((m) => m.type === 'product');
    expect(tagMatch?.name).toBe('ESG');
    expect(productMatch?.name).toBe('ESG Data');
  });

  it('returns empty matches when nothing found', () => {
    const result = resolveEntity(buildResolveFixtures(), 'NonexistentThing');
    expect(result.matches).toEqual([]);
    expect(result.query).toBe('NonexistentThing');
  });

  it('sorts matches by contractCount descending', () => {
    const result = resolveEntity(buildResolveFixtures(), 'Bloomberg');
    const counts = result.matches.map((m) => m.contractCount);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });

  it('finds tag matches', () => {
    const result = resolveEntity(buildResolveFixtures(), 'Critical');
    const match = result.matches.find((m) => m.type === 'tag');
    expect(match?.name).toBe('Critical');
    expect(match?.contractCount).toBe(1);
  });

  it('finds business group matches', () => {
    const result = resolveEntity(buildResolveFixtures(), 'Trading');
    const match = result.matches.find((m) => m.type === 'businessGroup');
    expect(match?.name).toBe('Trading');
  });

  it('finds sponsor matches', () => {
    const result = resolveEntity(buildResolveFixtures(), 'Jane');
    const match = result.matches.find((m) => m.type === 'sponsor');
    expect(match?.name).toBe('Jane Smith');
  });

  it('returns correct query in result', () => {
    const result = resolveEntity(buildResolveFixtures(), 'Test2');
    expect(result.query).toBe('Test2');
  });

  it('deduplicates vendor names across contracts', () => {
    const result = resolveEntity(buildResolveFixtures(), 'Bloomberg');
    const vendorMatches = result.matches.filter((m) => m.type === 'vendor');
    expect(vendorMatches).toHaveLength(1);
    expect(vendorMatches[0].contractCount).toBe(2);
  });
});
