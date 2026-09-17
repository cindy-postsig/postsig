import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Pins the familyOf scope of getContractsList: enrichment and the returned
 * list cover only the contract's relationship family, while cutoff
 * resolution still reads the unfiltered base set — exactly the full run's
 * chain input, so a declaring addendum outside the family still strikes
 * products inside it.
 */

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const ORG_ID = 'org-1';

const row = (id: number) => ({
  id,
  status_id: 4,
  ai_extraction_status: 'success',
  term_start_date: [{ date: '2024-01-01' }],
  vendor_products_details: [{ product_id: 100 + id, fees: 100 }],
});

jest.mock('@/app/lib/contracts/actions', () => ({
  fetchContractsBase: jest.fn(async () => [row(1), row(2), row(3)]),
  fetchContracts: jest.fn(async () => []),
  fetchContractsById: jest.fn(async () => []),
  fetchContractsBaseForLineageAI: jest.fn(async () => []),
}));

jest.mock('@/data/superuser/contracts', () => ({
  fetchAllRelationshipsForOrg: jest.fn(async () => [
    { parent_contract_id: 1, child_contract_id: 2, relationship_type: null },
  ]),
}));

jest.mock('@/data/users', () => ({
  getUserMetadata: jest.fn(async () => ({
    organizationId: ORG_ID,
    organizationFY: 1,
    baseCurrency: 'USD',
  })),
  getEffectiveBaseCurrency: jest.fn(async () => 'USD'),
}));

const resolveProductFeeCutoffs = jest.fn<
  (args: unknown) => Promise<Map<number, Map<number, Date>>>
>(async () => new Map());
jest.mock('@/lib/contracts/resolveRemovedProductsForContracts', () => ({
  resolveProductFeeCutoffs: (args: unknown) => resolveProductFeeCutoffs(args),
}));

const enrichWithPricing = jest.fn<
  (contracts: unknown[], fy: number, options?: unknown) => Promise<unknown[]>
>(async (contracts) => contracts);
jest.mock('@/lib/v2/core/pricing', () => ({
  enrichWithPricing: (contracts: unknown[], _fy: number, options?: unknown) =>
    enrichWithPricing(contracts, _fy, options),
  enrichWithEffectiveFees: (contracts: unknown[]) => contracts,
}));

jest.mock('@/lib/v2/core/lineage', () => ({
  ...(jest.requireActual('@/lib/v2/core/lineage') as object),
  enrichWithLineage: (contracts: unknown[]) =>
    (contracts as Array<{ id: number }>).map((c) => ({
      id: c.id,
      contract: c,
      products: [],
    })),
}));

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: jest.fn(),
}));

import { filterToFamily, getContractsList } from '@/lib/v2/contracts/service';

describe('getContractsList — familyOf scope', () => {
  beforeEach(() => {
    resolveProductFeeCutoffs.mockClear();
    enrichWithPricing.mockClear();
  });

  it('enriches and returns only the family; cutoffs still read the unfiltered base', async () => {
    const { contracts } = await getContractsList({ familyOf: 2 });

    expect(contracts.map((c) => c.id).sort()).toEqual([1, 2]);
    const enrichedIds = (
      enrichWithPricing.mock.calls[0][0] as Array<{ id: number }>
    ).map((c) => c.id);
    expect(enrichedIds.sort()).toEqual([1, 2]);

    const args = resolveProductFeeCutoffs.mock.calls[0][0] as {
      chainContracts: Array<{ contractId: number }>;
    };
    expect(args.chainContracts.map((c) => c.contractId).sort()).toEqual([
      1, 2, 3,
    ]);
  });

  it('returns the full set without familyOf', async () => {
    const { contracts } = await getContractsList();
    expect(contracts.map((c) => c.id).sort()).toEqual([1, 2, 3]);
  });
});

describe('filterToFamily', () => {
  const rels = (
    ...pairs: Array<[number | null, number | null]>
  ): Array<{
    parent_contract_id: number | null;
    child_contract_id: number | null;
  }> =>
    pairs.map(([parent_contract_id, child_contract_id]) => ({
      parent_contract_id,
      child_contract_id,
    }));
  const ids = (contracts: Array<{ id: number }>) =>
    contracts.map((c) => c.id).sort();
  const all = [1, 2, 3, 4, 5].map((id) => ({ id }));

  it('walks the whole component in both directions, billing edges included', () => {
    expect(
      ids(filterToFamily(all, 3, rels([1, 2], [2, 3], [4, 3], [5, null]))),
    ).toEqual([1, 2, 3, 4]);
  });

  it('a lone contract is its own family; null endpoints carry no edge', () => {
    expect(ids(filterToFamily(all, 5, rels([1, 2], [null, 5])))).toEqual([5]);
  });
});
