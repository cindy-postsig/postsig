import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

interface RecordedFilter {
  op: string;
  column: string;
  value: unknown;
}

interface PostgrestErrorLike {
  code: string;
  message: string;
}

let insertedRows: Array<Record<string, unknown>> = [];
let recordedFilters: RecordedFilter[] = [];
let fromTables: string[] = [];
let selectedColumns: Array<string | undefined> = [];
let insertError: PostgrestErrorLike | null = null;
let selectError: PostgrestErrorLike | null = null;
let selectRows: Array<Record<string, unknown>> | null = [];

const resetState = () => {
  insertedRows = [];
  recordedFilters = [];
  fromTables = [];
  selectedColumns = [];
  insertError = null;
  selectError = null;
  selectRows = [];
};

// Awaiting `.insert(...)` resolves to just an error slot; hoisted to module
// scope to stay inside the repo's brace-nesting cap.
const insertResult = () => ({
  then: (fn: (v: unknown) => unknown) => fn({ error: insertError }),
});

const recordInsert = (row: Record<string, unknown>) => {
  insertedRows.push(row);
  return insertResult();
};

const recordFilter = (op: string, column: string, value: unknown) => {
  recordedFilters.push({ op, column, value });
};

/**
 * Chainable PostgREST stub. The builder is thenable, so awaiting a select chain
 * resolves with the canned rows regardless of how many filters were applied.
 */
function makeBuilder() {
  const builder: Record<string, unknown> = {
    insert: recordInsert,
    select: (columns?: string) => {
      selectedColumns.push(columns);
      return builder;
    },
    eq: (column: string, value: unknown) => {
      recordFilter('eq', column, value);
      return builder;
    },
    in: (column: string, value: unknown) => {
      recordFilter('in', column, value);
      return builder;
    },
    then: (fn: (v: unknown) => unknown) =>
      fn({ data: selectRows, error: selectError }),
  };
  return builder;
}

const trackFrom = (table: string) => {
  fromTables.push(table);
  return makeBuilder();
};

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({ from: trackFrom }),
}));

import {
  createPendingProductLineageEvent,
  fetchConfirmedEventsForContracts,
} from '@/data/superuser/productLineageEvents';

const ORG_ID = 'org-1';
const CONTRACT_ID = 42;

const duplicateKeyError: PostgrestErrorLike = {
  code: '23505',
  message: 'duplicate key value violates unique constraint',
};

describe('createPendingProductLineageEvent', () => {
  beforeEach(resetState);

  it('creates a blanket replace_all_prior event as pending with no product', async () => {
    const result = await createPendingProductLineageEvent({
      contractId: CONTRACT_ID,
      organizationId: ORG_ID,
      action: 'replace_all_prior',
    });

    expect(result).toEqual({ created: true });
    expect(fromTables).toEqual(['vendor_product_lineage_events']);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      contract_id: CONTRACT_ID,
      organization_id: ORG_ID,
      action: 'replace_all_prior',
      product_id: null,
      source: 'ai',
      status: 'pending',
    });
  });

  it('always writes status pending so nothing reaches the view unconfirmed', async () => {
    await createPendingProductLineageEvent({
      contractId: CONTRACT_ID,
      organizationId: ORG_ID,
      action: 'cancel_product',
      productId: 7,
      source: 'human',
    });

    expect(insertedRows[0]).toMatchObject({ status: 'pending' });
  });

  it('keeps the product on a cancel_product event', async () => {
    await createPendingProductLineageEvent({
      contractId: CONTRACT_ID,
      organizationId: ORG_ID,
      action: 'cancel_product',
      productId: 7,
    });

    expect(insertedRows[0]).toMatchObject({
      action: 'cancel_product',
      product_id: 7,
    });
  });

  it('drops a product id passed alongside replace_all_prior', async () => {
    // The DB check constraint would reject this row; nulling it here keeps a
    // caller mistake from turning into a failed Inngest step.
    await createPendingProductLineageEvent({
      contractId: CONTRACT_ID,
      organizationId: ORG_ID,
      action: 'replace_all_prior',
      productId: 7,
    });

    expect(insertedRows[0]).toMatchObject({ product_id: null });
  });

  it('stores evidence and the creating user when provided', async () => {
    const evidence = { quotes: ['all prior products are cancelled'] };

    await createPendingProductLineageEvent({
      contractId: CONTRACT_ID,
      organizationId: ORG_ID,
      action: 'replace_all_prior',
      evidence,
      createdBy: 'user-1',
    });

    expect(insertedRows[0]).toMatchObject({
      evidence,
      created_by: 'user-1',
    });
  });

  it('is a no-op when a non-rejected duplicate already exists', async () => {
    // Inngest retries the extraction step; one declaration must stay one row.
    insertError = duplicateKeyError;

    const result = await createPendingProductLineageEvent({
      contractId: CONTRACT_ID,
      organizationId: ORG_ID,
      action: 'replace_all_prior',
    });

    expect(result).toEqual({ created: false });
  });

  it('reports created exactly once across a retried double-create', async () => {
    const first = await createPendingProductLineageEvent({
      contractId: CONTRACT_ID,
      organizationId: ORG_ID,
      action: 'replace_all_prior',
    });

    insertError = duplicateKeyError;
    const second = await createPendingProductLineageEvent({
      contractId: CONTRACT_ID,
      organizationId: ORG_ID,
      action: 'replace_all_prior',
    });

    expect([first.created, second.created]).toEqual([true, false]);
  });

  it('rethrows errors that are not duplicate-key violations', async () => {
    insertError = { code: '23503', message: 'foreign key violation' };

    await expect(
      createPendingProductLineageEvent({
        contractId: CONTRACT_ID,
        organizationId: ORG_ID,
        action: 'replace_all_prior',
      }),
    ).rejects.toMatchObject({ code: '23503' });
  });
});

describe('fetchConfirmedEventsForContracts', () => {
  beforeEach(resetState);

  it('filters to confirmed events for the given contracts and org', async () => {
    await fetchConfirmedEventsForContracts({
      contractIds: [1, 2],
      organizationId: ORG_ID,
    });

    expect(recordedFilters).toContainEqual({
      op: 'in',
      column: 'contract_id',
      value: [1, 2],
    });
    expect(recordedFilters).toContainEqual({
      op: 'eq',
      column: 'organization_id',
      value: ORG_ID,
    });
    expect(recordedFilters).toContainEqual({
      op: 'eq',
      column: 'status',
      value: 'confirmed',
    });
  });

  it('selects only the resolution columns, keeping evidence out of the payload', async () => {
    // `evidence` holds verbatim contract quotes; it must never ride along into
    // the client component this data is serialized into.
    await fetchConfirmedEventsForContracts({
      contractIds: [1],
      organizationId: ORG_ID,
    });

    expect(selectedColumns).toEqual([
      'contract_id, product_id, action, status',
    ]);
  });

  it('never widens past the confirmed status', async () => {
    // Pending and rejected events must stay inert in the UI.
    await fetchConfirmedEventsForContracts({
      contractIds: [1],
      organizationId: ORG_ID,
    });

    const statusFilters = recordedFilters.filter((f) => f.column === 'status');
    expect(statusFilters).toEqual([
      { op: 'eq', column: 'status', value: 'confirmed' },
    ]);
  });

  it('returns the rows the query yields', async () => {
    selectRows = [{ id: 1, contract_id: 1, action: 'replace_all_prior' }];

    await expect(
      fetchConfirmedEventsForContracts({
        contractIds: [1],
        organizationId: ORG_ID,
      }),
    ).resolves.toEqual(selectRows);
  });

  it('returns an empty array when the query yields no rows', async () => {
    selectRows = null;

    await expect(
      fetchConfirmedEventsForContracts({
        contractIds: [1],
        organizationId: ORG_ID,
      }),
    ).resolves.toEqual([]);
  });

  it('short-circuits without querying when there are no contract ids', async () => {
    await expect(
      fetchConfirmedEventsForContracts({
        contractIds: [],
        organizationId: ORG_ID,
      }),
    ).resolves.toEqual([]);

    expect(fromTables).toEqual([]);
  });

  it('rethrows query errors', async () => {
    selectError = { code: '42501', message: 'permission denied' };

    await expect(
      fetchConfirmedEventsForContracts({
        contractIds: [1],
        organizationId: ORG_ID,
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
