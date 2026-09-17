import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { contractTypes } from '@/app/lib/constants';

const getAmendmentChain = jest.fn<(id: number) => Promise<unknown>>();
jest.mock('@/lib/v2/contracts/amendments', () => ({
  getAmendmentChain: (id: number) => getAmendmentChain(id),
}));

import { getAmendmentChainHandler } from '@/app/api/v2/handlers/contracts/amendments';

/** SO (1) -> Invoice (2), Amendment (3) -> Invoice (4). SO's direct child list also carries the invoice. */
function chainFixture() {
  const invoice2 = { id: 2, type_id: contractTypes.Invoice };
  const amendment = { id: 3 };
  const invoice4 = { id: 4, type_id: contractTypes.Invoice };
  return {
    parentContract: null,
    currentContract: { id: 1 },
    childContracts: [invoice2, amendment],
    completeHierarchy: {
      id: 1,
      children: [{ id: 2 }, { id: 3, children: [{ id: 4 }] }],
    },
    allContractsInHierarchy: [{ id: 1 }, invoice2, amendment, invoice4],
  };
}

function fakeContext(contractId: number, cpmInvoicesEnabled: boolean) {
  const state: Record<string, unknown> = {
    userMetadata: { userId: 'user-1', cpmInvoicesEnabled },
  };
  return {
    get: (key: string) => state[key],
    req: { param: () => String(contractId) },
    json: (body: unknown) => body,
  } as never;
}

describe('getAmendmentChainHandler — invoices module gate', () => {
  beforeEach(() => {
    getAmendmentChain.mockReset().mockResolvedValue(chainFixture());
  });

  it('includes invoice nodes when the Invoices module is enabled', async () => {
    const result = (await getAmendmentChainHandler(
      fakeContext(1, true),
    )) as any;

    expect(
      result.allContractsInHierarchy.map((c: { id: number }) => c.id),
    ).toEqual([1, 2, 3, 4]);
    expect(result.childContracts.map((c: { id: number }) => c.id)).toEqual([
      2, 3,
    ]);
  });

  it('prunes invoice nodes from the tree, flat list and children when disabled', async () => {
    const result = (await getAmendmentChainHandler(
      fakeContext(1, false),
    )) as any;

    expect(
      result.allContractsInHierarchy.map((c: { id: number }) => c.id),
    ).toEqual([1, 3]);
    expect(result.childContracts.map((c: { id: number }) => c.id)).toEqual([3]);
    expect(
      result.completeHierarchy.children.map((c: { id: number }) => c.id),
    ).toEqual([3]);
  });

  it('never prunes the currently-viewed contract, even if it is itself an invoice', async () => {
    const result = (await getAmendmentChainHandler(
      fakeContext(2, false),
    )) as any;

    expect(
      result.allContractsInHierarchy.map((c: { id: number }) => c.id),
    ).toContain(2);
  });
});
