import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const getAmendmentChain = jest.fn<(id: number) => Promise<unknown>>();
const fetchConfirmedEventsForContracts =
  jest.fn<(args: unknown) => Promise<unknown[]>>();

jest.mock('@/lib/v2', () => ({
  getAmendmentChain: (id: number) => getAmendmentChain(id),
}));
jest.mock('@/data/superuser/productLineageEvents', () => ({
  fetchConfirmedEventsForContracts: (args: unknown) =>
    fetchConfirmedEventsForContracts(args),
}));
jest.mock('@/app/lib/mcp/context', () => ({
  requireMcpContext: () => ({
    userMetadata: { organizationId: 'org-1' },
  }),
}));
jest.mock('@/app/lib/mcp/guards', () => ({
  assertSameOrg: () => undefined,
}));
jest.mock('@/lib/v2/invoices/access', () => ({
  hasInvoicesAccess: () => Promise.resolve(true),
}));

import { lineageTools } from '@/app/lib/mcp/tools/cpm/lineage';

const handler = lineageTools[0].handler as (payload: {
  id: number;
}) => Promise<any>;

/** MSA (products Feed A, Feed B) with one addendum declaring a blanket replacement. */
function chainFixture() {
  const msa = {
    id: 1,
    localId: 'MSA-1',
    contract_name: 'Master Agreement',
    organization_id: 'org-1',
    term_start_date: [{ date: '2020-01-01' }],
    term_end_date: [{ date: '2024-12-31' }],
    vendor_products_details: [
      { product_id: 10, vendor_products: { id: 10, name: 'Feed A' } },
      { product_id: 11, vendor_products: { id: 11, name: 'Feed B' } },
    ],
  };
  const addendum = {
    id: 2,
    localId: 'ADD-1',
    contract_name: 'Addendum 1',
    organization_id: 'org-1',
    term_start_date: [{ date: '2023-01-01' }],
    term_end_date: null,
    vendor_products_details: [
      { product_id: 12, vendor_products: { id: 12, name: 'Feed C' } },
    ],
  };
  return {
    currentContract: msa,
    parentContract: null,
    childContracts: [addendum],
    completeHierarchy: { id: 1, children: [{ id: 2, children: [] }] },
    allContractsInHierarchy: [msa, addendum],
  };
}

const blanketEvent = {
  contract_id: 2,
  product_id: null,
  action: 'replace_all_prior',
  status: 'confirmed',
};

describe('get_contract_lineage — cancelled products', () => {
  beforeEach(() => {
    getAmendmentChain.mockReset();
    fetchConfirmedEventsForContracts.mockReset();
    getAmendmentChain.mockResolvedValue(chainFixture());
  });

  it('names cancelled products while keeping them listed', async () => {
    fetchConfirmedEventsForContracts.mockResolvedValue([blanketEvent]);

    const result = await handler({ id: 1 });

    expect(result.found).toBe(true);
    // Struck products stay in the full list AND are named as cancelled.
    expect(result.current.products).toEqual(['Feed A', 'Feed B']);
    expect(result.current.cancelledProducts).toEqual(['Feed A', 'Feed B']);
    // The declaring addendum's own products are untouched.
    expect(result.children[0].cancelledProducts).toEqual([]);
    // The ASCII fallback mentions the cancellation too.
    expect(result.treeAscii).toContain('(2 cancelled)');
  });

  it('reports nothing cancelled when no events are confirmed', async () => {
    fetchConfirmedEventsForContracts.mockResolvedValue([]);

    const result = await handler({ id: 1 });

    expect(result.current.cancelledProducts).toEqual([]);
    expect(result.treeAscii).not.toContain('cancelled');
  });

  it('degrades to no cancellation mentions when the fetch fails', async () => {
    fetchConfirmedEventsForContracts.mockRejectedValue(new Error('down'));

    const result = await handler({ id: 1 });

    expect(result.found).toBe(true);
    expect(result.current.cancelledProducts).toEqual([]);
  });
});
