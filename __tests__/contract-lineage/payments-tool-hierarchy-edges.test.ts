import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Task 2.3: the summarize_payment_terms chat tool groups contracts into
 * lineages from the embedded `contract_relationships` rows. A 'billing' edge
 * names an invoice's additional payer, so following it would report the
 * invoice's payment terms as governed by a contract that does not own it —
 * and, because the parent map is last-write-wins, could displace the invoice's
 * real parent.
 */

type Relationship = {
  parent_contract_id: number;
  relationship_type?: string | null;
};

const getContractsListForLineageAI =
  jest.fn<() => Promise<{ contracts: unknown[] }>>();

jest.mock('@/lib/v2/contracts/service', () => ({
  __esModule: true,
  getContractsListForLineageAI: () => getContractsListForLineageAI(),
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

import { createSummarizePaymentTermsTool } from '@/lib/v2/chat/tools/payments';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';

const CONTRACT_TYPE_MSA = 1;
const CONTRACT_TYPE_INVOICE = 6;

const contract = (
  id: number,
  typeId: number,
  relationships: Relationship[],
  paymentTerms: string | null = null,
) => ({
  contract: {
    id,
    type_id: typeId,
    vendors: { name: 'Acme' },
    payment_terms: paymentTerms,
    billing_frequency: null,
    currency: 'USD',
    term_start_date: [{ date: '2024-01-01' }],
    term_end_date: [{ date: '2024-12-31' }],
    contract_relationships: relationships,
  },
});

type ToolResult = {
  lineageGroups?: number;
  contracts?: Array<{ id: number; isRoot: boolean; governedBy?: number }>;
};

/**
 * The tool reports its grouping through the flat contract list: `isRoot` marks
 * a lineage root and `governedBy` names the contract whose payment terms the
 * group inherits. Both are what a billing edge would corrupt.
 */
async function lineage(contracts: unknown[]): Promise<{
  groupCount: number;
  rows: Array<[number, boolean, number | undefined]>;
}> {
  getContractsListForLineageAI.mockResolvedValue({ contracts });
  const tool = createSummarizePaymentTermsTool(
    { userId: 'u1', userRole: 'admin', organizationId: 1 } as never,
    new ChatToolCache(),
  );
  const result = (await tool.execute?.(
    { vendorName: 'Acme' },
    {} as never,
  )) as ToolResult;

  return {
    groupCount: result.lineageGroups ?? 0,
    rows: (result.contracts ?? [])
      .map(
        (c) =>
          [c.id, c.isRoot, c.governedBy] as [
            number,
            boolean,
            number | undefined,
          ],
      )
      .sort((a, b) => a[0] - b[0]),
  };
}

describe('summarize_payment_terms lineage grouping', () => {
  beforeEach(() => {
    getContractsListForLineageAI.mockReset();
  });

  // Invoice 30 is structurally under MSA 20 and billing-linked to MSA 10.
  const withBilling = () => [
    contract(10, CONTRACT_TYPE_MSA, [], 'Net 60'),
    contract(20, CONTRACT_TYPE_MSA, [], 'Net 30'),
    contract(30, CONTRACT_TYPE_INVOICE, [
      { parent_contract_id: 20, relationship_type: null },
      { parent_contract_id: 10, relationship_type: 'billing' },
    ]),
  ];

  const withoutBilling = () => [
    contract(10, CONTRACT_TYPE_MSA, [], 'Net 60'),
    contract(20, CONTRACT_TYPE_MSA, [], 'Net 30'),
    contract(30, CONTRACT_TYPE_INVOICE, [
      { parent_contract_id: 20, relationship_type: null },
    ]),
  ];

  it('does not govern an invoice by its billing parent', async () => {
    const { groupCount, rows } = await lineage(withBilling());
    // MSA 10 is its own group; invoice 30 sits under MSA 20 and inherits
    // 20's Net 30, never 10's Net 60.
    expect(groupCount).toBe(2);
    expect(rows).toEqual([
      [10, true, 10],
      [20, true, 20],
      [30, false, 20],
    ]);
  });

  it('groups identically with and without the billing edge', async () => {
    expect(await lineage(withBilling())).toEqual(
      await lineage(withoutBilling()),
    );
  });

  it('treats a billing-only invoice as its own root, not a child', async () => {
    const { rows } = await lineage([
      contract(10, CONTRACT_TYPE_MSA, [], 'Net 60'),
      contract(30, CONTRACT_TYPE_INVOICE, [
        { parent_contract_id: 10, relationship_type: 'billing' },
      ]),
    ]);
    // The invoice records no terms of its own and must not borrow 10's.
    expect(rows).toEqual([
      [10, true, 10],
      [30, true, undefined],
    ]);
  });

  it('still groups edges whose relationship_type is absent', async () => {
    const { rows } = await lineage([
      contract(20, CONTRACT_TYPE_MSA, [], 'Net 30'),
      contract(30, CONTRACT_TYPE_INVOICE, [{ parent_contract_id: 20 }]),
    ]);
    expect(rows).toEqual([
      [20, true, 20],
      [30, false, 20],
    ]);
  });

  // The relationships fetch issues no ORDER BY, so the same two hierarchy
  // parents can arrive in either sequence. Grouping must not depend on that.
  it('picks the same parent regardless of edge order', async () => {
    const parents = (order: number[]) => [
      contract(10, CONTRACT_TYPE_MSA, [], 'Net 60'),
      contract(20, CONTRACT_TYPE_MSA, [], 'Net 30'),
      contract(
        30,
        CONTRACT_TYPE_INVOICE,
        order.map((id) => ({
          parent_contract_id: id,
          relationship_type: null,
        })),
      ),
    ];

    const forward = await lineage(parents([10, 20]));
    const reversed = await lineage(parents([20, 10]));

    expect(forward).toEqual(reversed);
    // Lowest parent id wins, matching orderedEdges in lib/v2/spend/members.ts.
    expect(forward.rows).toEqual([
      [10, true, 10],
      [20, true, 20],
      [30, false, 10],
    ]);
  });

  it('is unaffected by a duplicate relationship row', async () => {
    const { rows } = await lineage([
      contract(20, CONTRACT_TYPE_MSA, [], 'Net 30'),
      contract(30, CONTRACT_TYPE_INVOICE, [
        { parent_contract_id: 20, relationship_type: null },
        { parent_contract_id: 20, relationship_type: null },
      ]),
    ]);
    expect(rows).toEqual([
      [20, true, 20],
      [30, false, 20],
    ]);
  });
});
