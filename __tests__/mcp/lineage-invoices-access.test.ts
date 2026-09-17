import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { contractTypes } from '@/app/lib/constants';

const getAmendmentChain = jest.fn<(id: number) => Promise<unknown>>();
const hasInvoicesAccess = jest.fn<() => Promise<boolean>>();
const fetchConfirmedEventsForContracts =
  jest.fn<(args: unknown) => Promise<unknown[]>>();

jest.mock('@/lib/v2', () => ({
  getAmendmentChain: (id: number) => getAmendmentChain(id),
}));
jest.mock('@/lib/v2/invoices/access', () => ({
  hasInvoicesAccess: () => hasInvoicesAccess(),
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

import { lineageTools } from '@/app/lib/mcp/tools/cpm/lineage';

const handler = lineageTools[0].handler as (payload: {
  id: number;
}) => Promise<any>;

/** SO (1) -> Invoice (2), Amendment (3) -> Invoice (4). SO's direct child list also carries the invoice. */
function chainFixture() {
  const so = { id: 1, localId: 'SO-1', organization_id: 'org-1' };
  const invoice2 = {
    id: 2,
    localId: 'INV-1',
    organization_id: 'org-1',
    type_id: contractTypes.Invoice,
  };
  const amendment = { id: 3, localId: 'ADD-1', organization_id: 'org-1' };
  const invoice4 = {
    id: 4,
    localId: 'INV-2',
    organization_id: 'org-1',
    type_id: contractTypes.Invoice,
  };
  return {
    currentContract: so,
    parentContract: null,
    childContracts: [invoice2, amendment],
    completeHierarchy: {
      id: 1,
      children: [{ id: 2 }, { id: 3, children: [{ id: 4 }] }],
    },
    allContractsInHierarchy: [so, invoice2, amendment, invoice4],
  };
}

describe('get_contract_lineage — invoices module gate', () => {
  beforeEach(() => {
    getAmendmentChain.mockReset().mockResolvedValue(chainFixture());
    hasInvoicesAccess.mockReset();
    fetchConfirmedEventsForContracts.mockReset().mockResolvedValue([]);
  });

  it('includes invoice nodes when the Invoices module is enabled', async () => {
    hasInvoicesAccess.mockResolvedValue(true);

    const result = await handler({ id: 1 });

    expect(result.flat.map((c: { id: number }) => c.id)).toEqual([1, 2, 3, 4]);
    expect(result.children.map((c: { id: number }) => c.id)).toEqual([2, 3]);
  });

  it('prunes invoice nodes from the tree, flat list and children when disabled', async () => {
    hasInvoicesAccess.mockResolvedValue(false);

    const result = await handler({ id: 1 });

    expect(result.flat.map((c: { id: number }) => c.id)).toEqual([1, 3]);
    expect(result.children.map((c: { id: number }) => c.id)).toEqual([3]);
    expect(result.tree.children.map((c: { id: number }) => c.id)).toEqual([3]);
    expect(result.treeAscii).not.toContain('INV-1');
    expect(result.treeAscii).not.toContain('INV-2');
  });

  it('never prunes the currently-viewed contract, even if it is itself an invoice', async () => {
    hasInvoicesAccess.mockResolvedValue(false);

    const result = await handler({ id: 2 });

    expect(result.found).toBe(true);
    expect(result.flat.map((c: { id: number }) => c.id)).toContain(2);
  });
});
