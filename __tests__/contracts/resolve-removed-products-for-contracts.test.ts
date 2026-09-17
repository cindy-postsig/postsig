import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { ChainContractInput } from '@/lib/contracts/productLineageResolution';

const fetchConfirmedEventsForContracts =
  jest.fn<(args: unknown) => Promise<unknown[]>>();
const logAlert = jest.fn();

jest.mock('@/data/superuser/productLineageEvents', () => ({
  fetchConfirmedEventsForContracts: (args: unknown) =>
    fetchConfirmedEventsForContracts(args),
}));
jest.mock('@/utils/logging/alert', () => ({
  logAlert: (...args: unknown[]) => logAlert(...args),
}));

import {
  resolveRemovedProductsAcrossChains,
  resolveRemovedProductsForContracts,
} from '@/lib/contracts/resolveRemovedProductsForContracts';

const ORG_ID = 'org-1';

/** MSA licenses products 1, 2; the addendum (dated later) declares a blanket replacement. */
const MSA = 10;
const ADDENDUM = 11;

const chain = (): ChainContractInput[] => [
  {
    contractId: MSA,
    termStartDate: [{ date: '2020-01-01' }],
    productIds: [1, 2],
  },
  {
    contractId: ADDENDUM,
    termStartDate: [{ date: '2023-01-01' }],
    productIds: [3],
  },
];

describe('resolveRemovedProductsForContracts', () => {
  beforeEach(() => {
    fetchConfirmedEventsForContracts.mockReset();
    logAlert.mockReset();
  });

  it('resolves confirmed events against the supplied chain', async () => {
    fetchConfirmedEventsForContracts.mockResolvedValue([
      {
        contract_id: ADDENDUM,
        product_id: null,
        action: 'replace_all_prior',
        status: 'confirmed',
      },
    ]);

    const removed = await resolveRemovedProductsForContracts({
      organizationId: ORG_ID,
      chainContracts: chain(),
    });

    expect(removed.get(MSA)).toEqual(new Set([1, 2]));
    expect(removed.has(ADDENDUM)).toBe(false);
  });

  it('derives the fetched contract ids from the chain contracts', async () => {
    fetchConfirmedEventsForContracts.mockResolvedValue([]);

    await resolveRemovedProductsForContracts({
      organizationId: ORG_ID,
      chainContracts: chain(),
    });

    expect(fetchConfirmedEventsForContracts).toHaveBeenCalledWith({
      contractIds: [MSA, ADDENDUM],
      organizationId: ORG_ID,
    });
  });

  it('short-circuits an empty chain without fetching', async () => {
    const removed = await resolveRemovedProductsForContracts({
      organizationId: ORG_ID,
      chainContracts: [],
    });

    expect(removed.size).toBe(0);
    expect(fetchConfirmedEventsForContracts).not.toHaveBeenCalled();
  });

  it('degrades a fetch failure to an empty map and pages a monitor', async () => {
    const failure = new Error('supabase down');
    fetchConfirmedEventsForContracts.mockRejectedValue(failure);

    const removed = await resolveRemovedProductsForContracts({
      organizationId: ORG_ID,
      chainContracts: chain(),
    });

    expect(removed.size).toBe(0);
    expect(logAlert).toHaveBeenCalledWith(
      'product-lineage-fetch-failure',
      failure,
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.any(String),
    );
  });

  it('lets no non-confirmed row through even if the data layer over-fetches', async () => {
    fetchConfirmedEventsForContracts.mockResolvedValue([
      {
        contract_id: ADDENDUM,
        product_id: null,
        action: 'replace_all_prior',
        status: 'pending',
      },
    ]);

    const removed = await resolveRemovedProductsForContracts({
      organizationId: ORG_ID,
      chainContracts: chain(),
    });

    expect(removed.size).toBe(0);
  });
});

describe('resolveRemovedProductsAcrossChains', () => {
  beforeEach(() => {
    fetchConfirmedEventsForContracts.mockReset();
    logAlert.mockReset();
  });

  const orgChain = (): ChainContractInput[] => [
    {
      contractId: MSA,
      termStartDate: [{ date: '2020-01-01' }],
      productIds: [1, 2],
    },
    {
      contractId: ADDENDUM,
      termStartDate: [{ date: '2023-01-01' }],
      productIds: [3],
    },
    {
      contractId: 99,
      termStartDate: [{ date: '2018-01-01' }],
      productIds: [9],
    },
  ];

  const edges = [{ parent_contract_id: MSA, child_contract_id: ADDENDUM }];

  it('resolves within chains but never across them', async () => {
    fetchConfirmedEventsForContracts.mockResolvedValue([
      {
        contract_id: ADDENDUM,
        product_id: null,
        action: 'replace_all_prior',
        status: 'confirmed',
      },
    ]);

    const removed = await resolveRemovedProductsAcrossChains({
      organizationId: ORG_ID,
      chainContracts: orgChain(),
      relationships: edges,
    });

    expect(removed.get(MSA)).toEqual(new Set([1, 2]));
    // Contract 99 predates the declaration but is a different chain.
    expect(removed.has(99)).toBe(false);
  });

  it('degrades a fetch failure to an empty map and pages a monitor', async () => {
    fetchConfirmedEventsForContracts.mockRejectedValue(new Error('down'));

    const removed = await resolveRemovedProductsAcrossChains({
      organizationId: ORG_ID,
      chainContracts: orgChain(),
      relationships: edges,
    });

    expect(removed.size).toBe(0);
    expect(logAlert).toHaveBeenCalledWith(
      'product-lineage-fetch-failure',
      expect.any(Error),
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.any(String),
    );
  });

  it('short-circuits an empty chain without fetching', async () => {
    const removed = await resolveRemovedProductsAcrossChains({
      organizationId: ORG_ID,
      chainContracts: [],
      relationships: edges,
    });

    expect(removed.size).toBe(0);
    expect(fetchConfirmedEventsForContracts).not.toHaveBeenCalled();
  });
});
