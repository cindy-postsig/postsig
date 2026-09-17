import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { contractTypes } from '@/app/lib/constants';

/**
 * `fetchLineageGraphExtras` orchestrates the lineage map's billing extension:
 * collect every billing edge touching the tree, resolve each linked chain
 * once, and merge via the pure `buildLineageGraphExtras`. The invariants
 * pinned here: both edge directions are collected, ids covered by an
 * already-resolved chain never trigger another chain fetch, and any fetch
 * failure degrades to no extras instead of a failed page.
 */

const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};
jest.mock('@/utils/pino', () => ({ __esModule: true, default: mockLogger }));

const fetchBillingChildren = jest.fn<() => Promise<unknown>>();
const fetchBillingParentsBatch = jest.fn<() => Promise<unknown>>();
jest.mock('@/data/superuser/contracts', () => ({
  fetchBillingChildrenByUserRoles: (...args: unknown[]) =>
    fetchBillingChildren(...(args as [])),
  fetchBillingParentsForContractsByUserRoles: (...args: unknown[]) =>
    fetchBillingParentsBatch(...(args as [])),
}));

const getAmendmentChain = jest.fn<(id: number) => Promise<unknown>>();
jest.mock('@/lib/v2', () => ({
  getAmendmentChain: (id: number) => getAmendmentChain(id),
}));

import { fetchLineageGraphExtras } from '@/lib/contracts/fetchLineageGraphExtras';

const USER_METADATA = {
  userId: 'user-a',
  userRole: 3,
  organizationId: 'org-1',
} as Parameters<typeof fetchLineageGraphExtras>[1];

const invoice = (id: number) => ({ id, type_id: contractTypes.Invoice });
const serviceOrder = (id: number) => ({ id, type_id: contractTypes.SO });

// A flat root-with-children tree: edge validation in buildLineageGraphExtras
// walks the hierarchy, so members must exist as tree nodes, not only records.
const chainOf = (rootId: number, memberIds: number[] = [rootId]) => ({
  completeHierarchy: {
    id: rootId,
    children: memberIds.filter((id) => id !== rootId).map((id) => ({ id })),
  },
  allContractsInHierarchy: memberIds.map((id) => ({ id })),
});

const billedInvoice = (id: number) => ({
  id,
  typeName: 'Invoice',
  productNames: [],
  isArchived: false,
});

const run = (
  treeContracts: Array<{ id: number; type_id?: number }>,
  invoicesEnabled = true,
) =>
  fetchLineageGraphExtras(
    {
      ...chainOf(
        treeContracts[0]?.id ?? 0,
        treeContracts.map((c) => c.id),
      ),
      allContractsInHierarchy: treeContracts,
    },
    USER_METADATA,
    treeContracts[0]?.id ?? 0,
    invoicesEnabled,
  );

describe('fetchLineageGraphExtras', () => {
  beforeEach(() => {
    fetchBillingChildren.mockReset().mockResolvedValue({});
    fetchBillingParentsBatch.mockReset().mockResolvedValue({});
    getAmendmentChain.mockReset();
    mockLogger.error.mockClear();
  });

  it('builds edges and chains from billing children of tree contracts', async () => {
    fetchBillingChildren.mockResolvedValue({ 40: [billedInvoice(45)] });
    getAmendmentChain.mockResolvedValue(chainOf(39, [39, 45]));

    const extras = await run([serviceOrder(40)]);

    expect(extras.billingEdges).toEqual([{ source: 40, target: 45 }]);
    expect(extras.additionalHierarchies.map((h) => h.id)).toEqual([39]);
    expect(getAmendmentChain).toHaveBeenCalledWith(45);
  });

  it('builds edges and chains from billing parents of tree invoices', async () => {
    fetchBillingParentsBatch.mockResolvedValue({
      45: [{ id: 40, typeName: null, productNames: [], isArchived: false }],
    });
    getAmendmentChain.mockResolvedValue(chainOf(40));

    const extras = await run([serviceOrder(39), invoice(45)]);

    expect(extras.billingEdges).toEqual([{ source: 40, target: 45 }]);
    expect(extras.additionalHierarchies.map((h) => h.id)).toEqual([40]);
    expect(getAmendmentChain).toHaveBeenCalledWith(40);
  });

  it('returns empty extras without chain fetches when there are no links', async () => {
    const extras = await run([serviceOrder(39), invoice(45)]);

    expect(extras).toEqual({
      additionalHierarchies: [],
      additionalContracts: [],
      billingEdges: [],
    });
    expect(getAmendmentChain).not.toHaveBeenCalled();
  });

  it('returns empty extras for an empty tree without any fetches', async () => {
    const extras = await run([]);

    expect(extras.billingEdges).toEqual([]);
    expect(fetchBillingChildren).not.toHaveBeenCalled();
    expect(fetchBillingParentsBatch).not.toHaveBeenCalled();
  });

  it('returns empty extras without any fetches when the Invoices module is off', async () => {
    fetchBillingChildren.mockResolvedValue({ 40: [billedInvoice(45)] });

    const extras = await run([serviceOrder(40)], false);

    expect(extras).toEqual({
      additionalHierarchies: [],
      additionalContracts: [],
      billingEdges: [],
    });
    expect(fetchBillingChildren).not.toHaveBeenCalled();
    expect(getAmendmentChain).not.toHaveBeenCalled();
  });

  it('resolves a shared external chain once, not once per linked invoice', async () => {
    // SO 40 pays two invoices living in the same external chain: the first
    // resolution covers both, so the second id must not refetch the chain.
    fetchBillingChildren.mockResolvedValue({
      40: [billedInvoice(45), billedInvoice(46)],
    });
    getAmendmentChain.mockResolvedValue(chainOf(39, [39, 45, 46]));

    const extras = await run([serviceOrder(40)]);

    expect(getAmendmentChain).toHaveBeenCalledTimes(1);
    expect(extras.billingEdges).toEqual([
      { source: 40, target: 45 },
      { source: 40, target: 46 },
    ]);
  });

  it('tolerates a linked chain that resolves to nothing', async () => {
    // getAmendmentChain degrades to an empty result on ACL failure; the id
    // stays uncovered but the merge must still stand and drop its edge.
    fetchBillingChildren.mockResolvedValue({ 40: [billedInvoice(45)] });
    getAmendmentChain.mockResolvedValue({
      completeHierarchy: null,
      allContractsInHierarchy: [],
    });

    const extras = await run([serviceOrder(40)]);

    expect(extras.additionalHierarchies).toEqual([]);
    expect(extras.billingEdges).toEqual([]);
  });

  it('degrades to empty extras when a billing fetch fails', async () => {
    fetchBillingChildren.mockRejectedValue(new Error('boom'));

    const extras = await run([serviceOrder(40)]);

    expect(extras).toEqual({
      additionalHierarchies: [],
      additionalContracts: [],
      billingEdges: [],
    });
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
