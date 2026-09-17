jest.mock('@/app/lib/budget', () => ({
  __esModule: true,
  generatePriceHistory: jest.fn(() => ({ periods: [] })),
  extractBudgetFromPriceHistory: jest.fn(() => ({ currentProducts: [] })),
  calculateCompoundedProductFee: jest.fn(),
}));

import { enrichWithAmendments } from '@/lib/v2/core/amendments';
import type { RawContractOwnerRow } from '@/lib/v2/owners/types';

type AmendmentInput = Parameters<typeof enrichWithAmendments>[0][number];

function sponsorRow(id: number, label: string): RawContractOwnerRow {
  return {
    id,
    role: 'sponsor',
    user_id: null,
    org_employee_id: null,
    label,
    org_unit_id: null,
  };
}

function contract(
  id: number,
  type: string,
  sponsors: string[],
  frozenColumn: string[] | null,
): AmendmentInput {
  return {
    id,
    currency: 'USD',
    contract_types: { name: type },
    term_start_date: [{ date: '2024-01-01', updated_at: '2024-01-01' }],
    vendor_products_details: [
      {
        product_id: 1,
        year: 1,
        fees: 100,
        vendor_products: { id: 1, name: 'P1' },
      },
    ],
    business_sponsor: frozenColumn,
    contract_owners: sponsors.map((name, i) => sponsorRow(id * 10 + i, name)),
  } as unknown as AmendmentInput;
}

const enrich = (contracts: AmendmentInput[], edges: Array<[number, number]>) =>
  enrichWithAmendments(
    contracts,
    edges.map(([parent, child]) => ({
      parent_contract_id: parent,
      child_contract_id: child,
    })),
    1,
    { skipExchangeRates: true },
  );

describe('enrichWithAmendments — business_sponsor comes from owner rows', () => {
  it('reads the owner sponsors, not the frozen column, and never walks the embed', async () => {
    const [parent] = await enrich(
      [contract(1, 'MSA', ['Ada Lovelace'], ['Stale Column Name'])],
      [],
    );

    expect(parent.effectiveValues.business_sponsor).toEqual({
      value: ['Ada Lovelace'],
    });
    expect(parent.effectiveValues).not.toHaveProperty('contract_owners');
    expect(parent.amendments).toBeUndefined();
  });

  it("lets an amendment's own sponsors override the parent's, attributed to the amendment", async () => {
    const [parent] = await enrich(
      [
        contract(1, 'MSA', ['Ada Lovelace'], null),
        contract(2, 'Addendum', ['Grace Hopper'], ['Stale Column Name']),
      ],
      [[1, 2]],
    );

    expect(parent.effectiveValues.business_sponsor).toEqual({
      value: ['Grace Hopper'],
      sourceContractId: 2,
      sourceContractType: 'Addendum',
    });
    expect(parent.amendments?.business_sponsor).toEqual({
      original: ['Ada Lovelace'],
      amendedBy: { contractId: 2, contractType: 'Addendum' },
    });
  });

  it("keeps the parent's sponsors when the amendment has none, even if its frozen column has a value", async () => {
    const [parent] = await enrich(
      [
        contract(1, 'MSA', ['Ada Lovelace'], null),
        contract(2, 'Addendum', [], ['Stale Column Name']),
      ],
      [[1, 2]],
    );

    expect(parent.effectiveValues.business_sponsor).toEqual({
      value: ['Ada Lovelace'],
    });
    expect(parent.amendments?.business_sponsor).toBeUndefined();
  });

  it('reports no sponsors as an empty list when nobody in the family has any', async () => {
    const [parent] = await enrich(
      [contract(1, 'MSA', [], ['Stale Column Name'])],
      [],
    );

    expect(parent.effectiveValues.business_sponsor).toEqual({ value: [] });
  });
});
