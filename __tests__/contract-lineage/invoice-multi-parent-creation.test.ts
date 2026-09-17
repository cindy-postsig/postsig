import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Task 3.1: an invoice can bill against several agreements at once. Detection
 * used to keep only `potentialParentContracts[0]` and drop the rest, so the
 * discrepancy report read the invoice's remaining lines as unexpected.
 *
 * Every match is linked now: the first is the single NULL-type hierarchy
 * parent, each further match a `'billing'` edge naming an additional payer.
 * A second NULL-type parent is never written.
 */

const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

jest.mock('@/utils/pino', () => ({ __esModule: true, default: mockLogger }));

const EMPTY_RESULT = { data: [], error: null };

/** Every table lookup resolves empty — this path only needs the product match. */
function makeBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  const nullRow = () => Promise.resolve({ data: null, error: null });
  const thenable = (fn: (v: unknown) => unknown) => fn(EMPTY_RESULT);

  Object.assign(builder, {
    select: chain,
    eq: chain,
    in: chain,
    is: chain,
    neq: chain,
    not: chain,
    limit: chain,
    single: nullRow,
    maybeSingle: nullRow,
    then: thenable,
  });
  return builder;
}

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({ from: () => makeBuilder() }),
}));

/** Candidate parents returned by the product match, in lookup order. */
let matchingParents: Array<{ id: number; type_id: number }> = [];

const contractsDataMock = {
  findLinkedContract: jest.fn(async () => null),
  findContractsWithMatchingProducts: jest.fn(async () => matchingParents),
  saveContractLineage: jest.fn(
    async (
      parentId: number,
      childId: number,
      _metadata: unknown,
      relationshipType: string | null = null,
    ) => ({ id: 900 + parentId, relationship_type: relationshipType, childId }),
  ),
  fetchContract: jest.fn(async () => null),
};

jest.mock('@/data/superuser/contracts', () => contractsDataMock);

const emailMock = { sendContractLineageEmail: jest.fn(async () => undefined) };

jest.mock('@/app/lib/emails/contract-lineage', () => emailMock);

jest.mock('@/data/users', () => ({
  getAllOrgUsers: jest.fn(async () => ['user-a']),
}));

jest.mock('@/data/superuser/vendors', () => ({
  expandVendorLineageIds: jest.fn(async (id: number) => [id]),
}));

import {
  canHaveBillingEdge,
  contractLineageStrategies,
} from '@/app/lib/actions/contract-lineage-strategies';
import { contractTypes } from '@/app/lib/constants';

const ORG_ID = 'org-1';
const INVOICE_ID = 500;

const PRODUCT_DETAIL = {
  product_id: 7,
  vendor_products: { id: 7, name: 'Widget' },
};

const SO_A = { id: 10, type_id: contractTypes.SO };
const SO_B = { id: 20, type_id: contractTypes.SO };
const SO_C = { id: 30, type_id: contractTypes.SO };

/** Runs the strategy registered for `typeId` against one invoice. */
function runStrategy(typeId: number = contractTypes.Invoice) {
  return contractLineageStrategies[typeId]({
    contract: {
      id: INVOICE_ID,
      type_id: typeId,
      vendor_products_details: [PRODUCT_DETAIL],
    },
    data: {},
    vendorId: 11,
    vendorIds: [11],
    organizationId: ORG_ID,
    contractId: INVOICE_ID,
  });
}

/** [parentId, relationship_type] for each edge written, in call order. */
function writtenEdges(): Array<[number, string | null]> {
  return contractsDataMock.saveContractLineage.mock.calls.map((call) => [
    call[0] as number,
    (call[3] ?? null) as string | null,
  ]);
}

describe('invoiceStrategy links every matching parent', () => {
  beforeEach(() => {
    matchingParents = [];
    contractsDataMock.saveContractLineage.mockClear();
    emailMock.sendContractLineageEmail.mockClear();
  });

  it('writes one hierarchy edge and a billing edge per further parent', async () => {
    matchingParents = [SO_A, SO_B, SO_C];

    await runStrategy();

    expect(writtenEdges()).toEqual([
      [SO_A.id, null],
      [SO_B.id, 'billing'],
      [SO_C.id, 'billing'],
    ]);
  });

  it('never writes a second NULL-type parent', async () => {
    matchingParents = [SO_A, SO_B, SO_C];

    await runStrategy();

    const hierarchyEdges = writtenEdges().filter(([, type]) => type === null);
    expect(hierarchyEdges).toHaveLength(1);
  });

  it('keeps the single-match path byte-identical to before', async () => {
    matchingParents = [SO_A];

    const result = await runStrategy();

    expect(writtenEdges()).toEqual([[SO_A.id, null]]);
    expect(result).toEqual({
      parent_contract_id: SO_A.id,
      child_contract_id: INVOICE_ID,
      contract_relationship_id: 900 + SO_A.id,
    });
  });

  it('reports the hierarchy parent, not a billing parent, as the result', async () => {
    matchingParents = [SO_A, SO_B];

    const result = await runStrategy();

    expect(result?.parent_contract_id).toBe(SO_A.id);
  });

  it('notifies for every edge it writes', async () => {
    matchingParents = [SO_A, SO_B];

    await runStrategy();

    expect(emailMock.sendContractLineageEmail).toHaveBeenCalledTimes(2);
  });

  it('writes nothing when no parent matches', async () => {
    matchingParents = [];

    await runStrategy();

    expect(contractsDataMock.saveContractLineage).not.toHaveBeenCalled();
  });

  it('adds billing edges for an EA invoice too', async () => {
    // EAINV shares invoiceStrategy and isInvoiceType, so it bills the same way.
    matchingParents = [SO_A, SO_B];

    await runStrategy(contractTypes.EAINV);

    expect(writtenEdges()).toEqual([
      [SO_A.id, null],
      [SO_B.id, 'billing'],
    ]);
  });

  it('re-issues the same writes on a second pass, never extra edges', async () => {
    // Deduplication itself is the DB's (UNIQUE parent+child, ignoreDuplicates)
    // and is not exercised here — what this pins is that the strategy is
    // stateless across passes: the same parents produce the same two write
    // requests, not a third edge or a second hierarchy parent.
    matchingParents = [SO_A, SO_B];

    await runStrategy();
    const first = writtenEdges();
    contractsDataMock.saveContractLineage.mockClear();
    await runStrategy();

    expect(writtenEdges()).toEqual(first);
  });

  it('propagates a billing-edge write failure instead of reporting success', async () => {
    // saveContractLineage throws on a typed-edge duplicate (an upstream bug
    // picking a parent the pair already holds). The strategy must not swallow
    // it and hand back a hierarchy result as though the fan-out had completed.
    matchingParents = [SO_A, SO_B];
    const failure = new Error('the pair is already linked');
    contractsDataMock.saveContractLineage.mockImplementationOnce(
      async () => ({ id: 900 + SO_A.id }) as never,
    );
    contractsDataMock.saveContractLineage.mockImplementationOnce(async () => {
      throw failure;
    });

    await expect(runStrategy()).rejects.toThrow(failure);

    expect(writtenEdges()).toEqual([
      [SO_A.id, null],
      [SO_B.id, 'billing'],
    ]);
  });

  it('gates the billing writes on the invoice-only invariant', async () => {
    // The strategy is registered only for invoice types, so the guard cannot be
    // reached through the registry — this pins the two together, so relaxing
    // `canHaveBillingEdge` to a non-invoice type fails here rather than
    // silently writing typed edges no tree walk would ever read.
    matchingParents = [SO_A, SO_B];

    await runStrategy();

    const billingWrites = writtenEdges().filter(
      ([, type]) => type === 'billing',
    );
    expect(billingWrites.length > 0).toBe(
      canHaveBillingEdge(contractTypes.Invoice),
    );
  });
});

describe('canHaveBillingEdge', () => {
  it('admits invoice types', () => {
    expect(canHaveBillingEdge(contractTypes.Invoice)).toBe(true);
    expect(canHaveBillingEdge(contractTypes.EAINV)).toBe(true);
  });

  it('rejects every non-invoice type', () => {
    // A billing edge on these is excluded from every tree walk downstream, so
    // it would be a row that exists and does nothing.
    expect(canHaveBillingEdge(contractTypes.MSA)).toBe(false);
    expect(canHaveBillingEdge(contractTypes.SO)).toBe(false);
    expect(canHaveBillingEdge(contractTypes.Addendum)).toBe(false);
    expect(canHaveBillingEdge(contractTypes.NDA)).toBe(false);
    expect(canHaveBillingEdge(contractTypes.Operational)).toBe(false);
  });

  it('rejects a null type rather than assuming invoice', () => {
    expect(canHaveBillingEdge(null)).toBe(false);
  });
});
