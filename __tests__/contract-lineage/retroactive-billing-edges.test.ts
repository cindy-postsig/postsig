import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Task 3.2: `detectRetroactiveChildren` excluded every child that already held
 * a relationship row, so an invoice that found its first service order could
 * never pick up the second one retroactively — the same false-discrepancy the
 * creation path (Task 3.1) fixes forward.
 *
 * The exclusion now keys on *hierarchy* parentage: an already-parented invoice
 * stays a candidate and receives a `'billing'` edge, while every other type
 * keeps the original one-parent-only skip.
 */

const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

jest.mock('@/utils/pino', () => ({ __esModule: true, default: mockLogger }));

type Rel = {
  child_contract_id: number;
  parent_contract_id: number;
  relationship_type?: string | null;
  disabled?: boolean | null;
};

/** Rows the `contract_relationships` lookup returns. Set per test. */
let existingRels: Rel[] = [];
/** Error the `contract_relationships` lookup returns. Set per test. */
let relsLookupError: { message: string } | null = null;
/** Rows the `contracts` candidate lookup returns. Set per test. */
let candidateRows: unknown[] = [];

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  const rows = () => (table === 'contracts' ? candidateRows : existingRels);
  const thenable = (fn: (v: unknown) => unknown) =>
    table === 'contract_relationships' && relsLookupError
      ? fn({ data: null, error: relsLookupError })
      : fn({ data: rows(), error: null });

  Object.assign(builder, {
    select: chain,
    eq: chain,
    in: chain,
    is: chain,
    neq: chain,
    not: chain,
    limit: chain,
    single: () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: thenable,
  });
  return builder;
}

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({ from: (table: string) => makeBuilder(table) }),
}));

const PARENT_ID = 50;
const PRODUCT = { product_id: 7, vendor_products: { id: 7, name: 'Widget' } };

const contractsDataMock = {
  findLinkedContract: jest.fn(async () => null),
  findContractsWithMatchingProducts: jest.fn(async () => []),
  saveContractLineage: jest.fn(
    async (
      _parentId: number,
      _childId: number,
      _metadata: unknown,
      _relationshipType: string | null = null,
    ) => ({ id: 900 }),
  ),
  fetchContract: jest.fn(async () => ({
    id: PARENT_ID,
    type_id: 2,
    term_start_date: [{ date: '2024-01-01' }],
    vendor_products_details: [PRODUCT],
  })),
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

import { detectRetroactiveChildren } from '@/app/lib/actions/contract-lineage-strategies';
import { contractTypes } from '@/app/lib/constants';

const INVOICE_ID = 300;
const ADDENDUM_ID = 400;

const invoiceChild = {
  id: INVOICE_ID,
  type_id: contractTypes.Invoice,
  term_start_date: [{ date: '2024-01-01' }],
  metadata: {},
  vendor_products_details: [PRODUCT],
};

/** Shares the parent's start date, which is what makes a non-invoice link. */
const addendumChild = {
  id: ADDENDUM_ID,
  type_id: contractTypes.Addendum,
  term_start_date: [{ date: '2024-01-01' }],
  metadata: { lineage: { parent_agreement_date: '2024-01-01' } },
  vendor_products_details: [PRODUCT],
};

/** `detectRetroactiveChildren` runs as an SO parenting its candidates. */
function run() {
  return detectRetroactiveChildren({
    contractId: PARENT_ID,
    vendorId: 11,
    organizationId: 'org-1',
    contractTypeId: contractTypes.SO,
    startDate: '2024-01-01',
    products: [{ product_id: 7, product_name: 'Widget' }],
  });
}

/** [childId, relationship_type] for each edge written, in call order. */
function writtenEdges(): Array<[number, string | null]> {
  return contractsDataMock.saveContractLineage.mock.calls.map((call) => [
    call[1] as number,
    (call[3] ?? null) as string | null,
  ]);
}

describe('detectRetroactiveChildren adds billing edges to parented invoices', () => {
  beforeEach(() => {
    existingRels = [];
    relsLookupError = null;
    candidateRows = [];
    contractsDataMock.saveContractLineage.mockClear();
    emailMock.sendContractLineageEmail.mockClear();
    mockLogger.error.mockClear();
  });

  it('adds a billing edge to an invoice that already has a hierarchy parent', async () => {
    candidateRows = [invoiceChild];
    existingRels = [
      {
        child_contract_id: INVOICE_ID,
        parent_contract_id: 99,
        relationship_type: null,
      },
    ];

    await run();

    expect(writtenEdges()).toEqual([[INVOICE_ID, 'billing']]);
  });

  it('still writes a hierarchy edge for an unparented invoice', async () => {
    candidateRows = [invoiceChild];
    existingRels = [];

    await run();

    expect(writtenEdges()).toEqual([[INVOICE_ID, null]]);
  });

  it('adds nothing for an already-parented non-invoice child', async () => {
    // An addendum may hold exactly one parent — the original skip is unchanged.
    candidateRows = [addendumChild];
    existingRels = [
      {
        child_contract_id: ADDENDUM_ID,
        parent_contract_id: 99,
        relationship_type: null,
      },
    ];

    await run();

    expect(contractsDataMock.saveContractLineage).not.toHaveBeenCalled();
  });

  it('still links an unparented non-invoice child', async () => {
    candidateRows = [addendumChild];
    existingRels = [];

    await run();

    expect(writtenEdges()).toEqual([[ADDENDUM_ID, null]]);
  });

  it('does not re-link a pair this parent already bills', async () => {
    // Re-running detection must not re-notify, and saveContractLineage throws
    // on a duplicate typed edge rather than silently upserting a no-op.
    candidateRows = [invoiceChild];
    existingRels = [
      {
        child_contract_id: INVOICE_ID,
        parent_contract_id: 99,
        relationship_type: null,
      },
      {
        child_contract_id: INVOICE_ID,
        parent_contract_id: PARENT_ID,
        relationship_type: 'billing',
      },
    ];

    await run();

    expect(contractsDataMock.saveContractLineage).not.toHaveBeenCalled();
  });

  it('does not re-link a pair whose only row is disabled', async () => {
    // The UNIQUE (parent, child) row survives being disabled, so the upsert
    // would be swallowed and saveContractLineage's typed-edge guard would
    // throw. The pair is skipped on the row's existence, not its disabled flag.
    candidateRows = [invoiceChild];
    existingRels = [
      {
        child_contract_id: INVOICE_ID,
        parent_contract_id: 99,
        relationship_type: null,
      },
      {
        child_contract_id: INVOICE_ID,
        parent_contract_id: PARENT_ID,
        relationship_type: 'billing',
        disabled: true,
      },
    ];

    await run();

    expect(contractsDataMock.saveContractLineage).not.toHaveBeenCalled();
  });

  it('still supplies a hierarchy parent when the only parentage is disabled', async () => {
    // A disabled hierarchy edge to a DIFFERENT parent is not live parentage, so
    // this invoice still needs its structural parent from this pass.
    candidateRows = [invoiceChild];
    existingRels = [
      {
        child_contract_id: INVOICE_ID,
        parent_contract_id: 99,
        relationship_type: null,
        disabled: true,
      },
    ];

    await run();

    expect(writtenEdges()).toEqual([[INVOICE_ID, null]]);
  });

  it('treats an invoice holding only a billing edge as still needing its hierarchy parent', async () => {
    // A billing edge is not parentage, so this invoice has no structural parent
    // yet and the retroactive pass must supply it as a NULL-type edge.
    candidateRows = [invoiceChild];
    existingRels = [
      {
        child_contract_id: INVOICE_ID,
        parent_contract_id: 99,
        relationship_type: 'billing',
      },
    ];

    await run();

    expect(writtenEdges()).toEqual([[INVOICE_ID, null]]);
  });

  it('writes nothing when this parent already holds the invoice via a billing edge alone', async () => {
    // No hierarchy parent anywhere, so the pass wants to write a NULL edge —
    // but this exact pair already has a row, and a pair holds only one. Writing
    // would be a swallowed no-op that re-notifies; the pair is skipped instead.
    candidateRows = [invoiceChild];
    existingRels = [
      {
        child_contract_id: INVOICE_ID,
        parent_contract_id: PARENT_ID,
        relationship_type: 'billing',
      },
    ];

    await run();

    expect(contractsDataMock.saveContractLineage).not.toHaveBeenCalled();
    expect(emailMock.sendContractLineageEmail).not.toHaveBeenCalled();
  });

  it('alerts and writes nothing when the existing-relationship lookup errors', async () => {
    // With the lookup errored both dedupe sets read empty and every candidate
    // looks unlinked — writing on that assumption re-notifies or throws on the
    // typed-edge guard, so the pass fails closed.
    candidateRows = [invoiceChild];
    relsLookupError = { message: 'boom' };

    await run();

    expect(contractsDataMock.saveContractLineage).not.toHaveBeenCalled();
    expect(emailMock.sendContractLineageEmail).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ alert: 'contract-relationship-invalid' }),
      expect.any(String),
    );
  });

  it('notifies for the billing edge it writes', async () => {
    candidateRows = [invoiceChild];
    existingRels = [
      {
        child_contract_id: INVOICE_ID,
        parent_contract_id: 99,
        relationship_type: null,
      },
    ];

    await run();

    expect(emailMock.sendContractLineageEmail).toHaveBeenCalledTimes(1);
  });
});
