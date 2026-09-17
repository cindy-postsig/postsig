import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Task 2.3: `processContractHierarchies` prefetches the ancestors and
 * descendants its hierarchy map needs by walking `contract_relationships` in
 * memory. Following a 'billing' edge there pulls an unrelated chain's
 * contracts into the dataset, and those contracts' products then get compared
 * as if they superseded each other.
 *
 * The walk has no return value, so the assertion is on the ids it asks
 * `fetchContractsById` for — the only place the widened set is observable.
 */

const fetchContractsById =
  jest.fn<(args: { ids: number[] }) => Promise<unknown[]>>();

jest.mock('@/app/lib/contracts/actions', () => ({
  __esModule: true,
  fetchContractsById: (args: { ids: number[] }) => fetchContractsById(args),
}));

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// The hierarchy/product machinery downstream of the prefetch is not under
// test; stub it so the fixtures stay minimal.
jest.mock('@/lib/amendments/productLineageUtils', () => ({
  __esModule: true,
  getDirectLineageWithSharedProducts: () => [],
}));
jest.mock('@/components/contracts/amendments/productComparisonUtils', () => ({
  __esModule: true,
  createProductComparison: () => ({ removedProducts: [] }),
}));
jest.mock('@/lib/contracts/hierarchyProductsData', () => ({
  __esModule: true,
  buildHierarchyProductsData: () => ({}),
}));

import { processContractHierarchies } from '@/lib/contracts/supersededProducts';

/** Ids the prefetch asked for, deduped and sorted. */
async function prefetchedIds(relationships: unknown[]): Promise<number[]> {
  // Contract 30 is the only one loaded; everything else must be pulled in by
  // the walk, if at all.
  await processContractHierarchies([{ id: 30, users: {} }], 1, relationships);
  const calls = fetchContractsById.mock.calls;
  if (calls.length === 0) return [];
  return Array.from(new Set(calls[0][0].ids)).sort((a, b) => a - b);
}

const hierarchy = (parent: number, child: number) => ({
  parent_contract_id: parent,
  child_contract_id: child,
  relationship_type: null,
});

const billing = (parent: number, child: number) => ({
  parent_contract_id: parent,
  child_contract_id: child,
  relationship_type: 'billing',
});

describe('processContractHierarchies ancestor/descendant prefetch', () => {
  beforeEach(() => {
    fetchContractsById.mockReset();
    fetchContractsById.mockResolvedValue([]);
  });

  it('does not pull in a chain reachable only over a billing edge', async () => {
    // 30 is an invoice under SO 20; SO 10 (with its own child 11) merely pays
    // for some of its lines.
    const ids = await prefetchedIds([
      hierarchy(20, 30),
      billing(10, 30),
      hierarchy(10, 11),
    ]);
    expect(ids).toEqual([20]);
    expect(ids).not.toContain(10);
    expect(ids).not.toContain(11);
  });

  it('prefetches the same set with and without the billing edge', async () => {
    const withBilling = await prefetchedIds([
      hierarchy(20, 30),
      billing(10, 30),
      hierarchy(10, 11),
    ]);
    fetchContractsById.mockReset();
    fetchContractsById.mockResolvedValue([]);
    const without = await prefetchedIds([hierarchy(20, 30), hierarchy(10, 11)]);
    expect(withBilling).toEqual(without);
  });

  it('still walks edges whose relationship_type is absent', async () => {
    const ids = await prefetchedIds([
      { parent_contract_id: 20, child_contract_id: 30 },
    ]);
    expect(ids).toEqual([20]);
  });
});
