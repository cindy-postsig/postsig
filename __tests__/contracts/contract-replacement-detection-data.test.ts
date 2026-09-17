import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('server-only', () => ({}));

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
let singleRow: Record<string, unknown> | null = null;
let insertedRow: Record<string, unknown> | null = null;

const resetState = () => {
  insertedRows = [];
  recordedFilters = [];
  fromTables = [];
  selectedColumns = [];
  insertError = null;
  selectError = null;
  selectRows = [];
  singleRow = null;
  insertedRow = { id: EVENT_ID };
};

// Hoisted to module scope: inlining these thenables inside the builder literal
// pushes the file past the repo's brace-nesting cap.
const resolveSingle = (fn: (v: unknown) => unknown) =>
  fn({ data: singleRow, error: selectError });

const resolveList = (fn: (v: unknown) => unknown) =>
  fn({ data: selectRows, error: selectError });

const singleResult = () => ({ then: resolveSingle });

// `.insert(...)` returns the builder so the caller can chain `.select().single()`
// for the inserted row's id, as the real PostgREST client does.
const recordInsert = (
  row: Record<string, unknown>,
  builder: Record<string, unknown>,
) => {
  insertedRows.push(row);
  return builder;
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
    insert: (row: Record<string, unknown>) => recordInsert(row, builder),
    single: () => ({
      then: (fn: (v: unknown) => unknown) =>
        fn({ data: insertedRow, error: insertError ?? selectError }),
    }),
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
    neq: (column: string, value: unknown) => {
      recordFilter('neq', column, value);
      return builder;
    },
    or: (expression: string) => {
      recordFilter('or', 'or', expression);
      return builder;
    },
    returns: () => builder,
    maybeSingle: singleResult,
    then: resolveList,
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

import { contractStatuses } from '@/app/lib/constants';
import {
  createPendingReplacementEvent,
  fetchActiveContractsForVendors,
  fetchContractForReplacement,
  fetchExistingEventOldContractIds,
} from '@/data/superuser/contractReplacementDetection';

const ORG_ID = 'org-1';
const OLD_ID = 42;
const NEW_ID = 100;
const EVENT_ID = 5312;

const duplicateKeyError: PostgrestErrorLike = {
  code: '23505',
  message: 'duplicate key value violates unique constraint',
};

const connectionError: PostgrestErrorLike = {
  code: '08006',
  message: 'connection failure',
};

// Joined product shapes, hoisted so the assertions below stay flat enough for
// the repo's brace-nesting cap.
const productDetail = (name: string | null) => ({
  vendor_products: { name },
});

const TWO_PRODUCTS = [
  productDetail('Terminal Pro'),
  productDetail('Data Feed'),
];
const REPEATED_PRODUCT = [
  productDetail('Terminal Pro'),
  productDetail('Terminal Pro'),
];
const ONE_PRODUCT = [productDetail('Terminal Pro')];

const NEW_CONTRACT_ROW = {
  id: NEW_ID,
  vendor_id: 7,
  type_id: 2,
  status: 'active',
  term_start_date: [{ date: '2026-02-01' }],
  term_end_date: null,
  metadata: { lineage: { order_number: 'SO-1' } },
  vendor_products_details: TWO_PRODUCTS,
};

const OLD_CONTRACT_ROW = {
  id: OLD_ID,
  vendor_id: 7,
  type_id: 2,
  status: 'active',
  term_start_date: null,
  term_end_date: [{ date: '2026-01-31' }],
  metadata: { lineage: { order_number: 'SO-0' } },
  vendor_products_details: ONE_PRODUCT,
};

const EXPECTED_OLD_ROW = {
  id: OLD_ID,
  vendor_id: 7,
  type_id: 2,
  status: 'active',
  term_start_date: null,
  term_end_date: [{ date: '2026-01-31' }],
  metadata: { lineage: { order_number: 'SO-0' } },
  productNames: ['Terminal Pro'],
};

const createEvent = () =>
  createPendingReplacementEvent({
    oldContractId: OLD_ID,
    newContractId: NEW_ID,
    organizationId: ORG_ID,
  });

describe('createPendingReplacementEvent', () => {
  beforeEach(resetState);

  const EXPECTED_INSERT = {
    old_contract_id: OLD_ID,
    new_contract_id: NEW_ID,
    organization_id: ORG_ID,
    action: 'replace',
    source: 'ai',
    status: 'pending',
    evidence: null,
  };

  it('writes a pending ai replace event for the pair', async () => {
    const result = await createEvent();

    expect(result).toEqual({ created: true, eventId: EVENT_ID });
    expect(fromTables).toEqual(['contract_lineage_events']);
    expect(insertedRows).toEqual([EXPECTED_INSERT]);
  });

  it('always writes status pending so nothing skips extractor screening', async () => {
    await createPendingReplacementEvent({
      oldContractId: OLD_ID,
      newContractId: NEW_ID,
      organizationId: ORG_ID,
      source: 'human',
    });

    expect(insertedRows[0]).toMatchObject({ status: 'pending' });
  });

  it('stores the supplied evidence payload', async () => {
    const evidence = {
      matched_products: ['Terminal Pro'],
      date_delta_days: 1,
    };

    await createPendingReplacementEvent({
      oldContractId: OLD_ID,
      newContractId: NEW_ID,
      organizationId: ORG_ID,
      evidence,
    });

    expect(insertedRows[0].evidence).toEqual(evidence);
  });

  it('treats a duplicate pair as a no-op success', async () => {
    // Inngest retries the step; the full unique index makes the retry collide.
    insertError = duplicateKeyError;

    await expect(createEvent()).resolves.toEqual({
      created: false,
      eventId: null,
    });
  });

  it('rethrows any error that is not a duplicate key', async () => {
    insertError = { code: '42501', message: 'permission denied' };

    await expect(createEvent()).rejects.toMatchObject({ code: '42501' });
  });
});

describe('fetchExistingEventOldContractIds', () => {
  beforeEach(resetState);

  const fetchIds = () =>
    fetchExistingEventOldContractIds({
      newContractId: NEW_ID,
      organizationId: ORG_ID,
    });

  const pairedRow = (oldId: number, newId: number) => ({
    old_contract_id: oldId,
    new_contract_id: newId,
  });

  it('returns the old contract ids paired with this new contract', async () => {
    selectRows = [pairedRow(1, NEW_ID), pairedRow(2, NEW_ID)];

    await expect(fetchIds()).resolves.toEqual([1, 2]);
  });

  it('returns the peer id when this contract is the OLD side of a pair', async () => {
    // The dedupe index is on the ordered pair, so a rejected A->B does not
    // collide with B->A. Suppression has to look both ways itself.
    selectRows = [pairedRow(NEW_ID, 55)];

    await expect(fetchIds()).resolves.toEqual([55]);
  });

  it('suppresses peers found in either direction at once', async () => {
    selectRows = [pairedRow(1, NEW_ID), pairedRow(NEW_ID, 55)];

    await expect(fetchIds()).resolves.toEqual([1, 55]);
  });

  it('scopes the lookup to the organization and matches either direction', async () => {
    await fetchIds();

    expect(fromTables).toEqual(['contract_lineage_events']);
    expect(recordedFilters).toEqual([
      { op: 'eq', column: 'organization_id', value: ORG_ID },
      {
        op: 'or',
        column: 'or',
        value: `new_contract_id.eq.${NEW_ID},old_contract_id.eq.${NEW_ID}`,
      },
    ]);
  });

  it('filters on no status, so a rejected pair still suppresses re-detection', async () => {
    await fetchIds();

    expect(recordedFilters.map((f) => f.column)).not.toContain('status');
  });

  it('selects ids only, never the verbatim-quote evidence column', async () => {
    await fetchIds();

    expect(selectedColumns).toEqual(['old_contract_id, new_contract_id']);
  });

  it('returns an empty list when there are no events', async () => {
    selectRows = null;

    await expect(fetchIds()).resolves.toEqual([]);
  });

  it('throws when the lookup fails', async () => {
    selectError = connectionError;

    await expect(fetchIds()).rejects.toMatchObject({ code: '08006' });
  });
});

describe('fetchContractForReplacement', () => {
  beforeEach(resetState);

  const fetchOne = () =>
    fetchContractForReplacement({
      contractId: NEW_ID,
      organizationId: ORG_ID,
    });

  it('scopes the lookup to the organization, since the service client bypasses RLS', async () => {
    selectRows = [NEW_CONTRACT_ROW];

    await fetchOne();

    expect(recordedFilters).toContainEqual({
      op: 'eq',
      column: 'organization_id',
      value: ORG_ID,
    });
  });

  it('flattens the joined product names onto the row', async () => {
    selectRows = [NEW_CONTRACT_ROW];

    await expect(fetchOne()).resolves.toMatchObject({
      id: NEW_ID,
      vendor_id: 7,
      metadata: { lineage: { order_number: 'SO-1' } },
      productNames: ['Terminal Pro', 'Data Feed'],
    });
  });

  it('deduplicates repeated product names', async () => {
    selectRows = [{ id: NEW_ID, vendor_products_details: REPEATED_PRODUCT }];

    const row = await fetchOne();

    expect(row?.productNames).toEqual(['Terminal Pro']);
  });

  it.each([
    ['the join is null', null],
    ['a detail row is null', [null]],
    ['a detail has no product', [{ vendor_products: null }]],
    ['a product has no name', [productDetail(null)]],
  ])('yields no product names when %s', async (_label, details) => {
    selectRows = [{ id: NEW_ID, vendor_products_details: details }];

    const row = await fetchOne();

    expect(row?.productNames).toEqual([]);
  });

  it('returns null when the contract does not exist', async () => {
    selectRows = [];

    await expect(fetchOne()).resolves.toBeNull();
  });

  it('throws when the lookup fails', async () => {
    selectError = connectionError;

    await expect(fetchOne()).rejects.toMatchObject({ code: '08006' });
  });
});

describe('fetchActiveContractsForVendors', () => {
  beforeEach(resetState);

  const fetchForVendors = (vendorIds: number[]) =>
    fetchActiveContractsForVendors({
      vendorIds,
      organizationId: ORG_ID,
      excludeContractId: NEW_ID,
    });

  it('scopes to the vendor family, org and published status, excluding itself', async () => {
    await fetchForVendors([7, 8]);

    expect(fromTables).toEqual(['contracts']);
    expect(recordedFilters).toEqual([
      { op: 'in', column: 'vendor_id', value: [7, 8] },
      { op: 'eq', column: 'organization_id', value: ORG_ID },
      { op: 'eq', column: 'status', value: 'active' },
      { op: 'eq', column: 'status_id', value: contractStatuses.published },
      { op: 'neq', column: 'id', value: NEW_ID },
    ]);
  });

  it('short-circuits without querying when the vendor family is empty', async () => {
    await expect(fetchForVendors([])).resolves.toEqual([]);
    expect(fromTables).toEqual([]);
  });

  it('maps every row through the product-name flattening', async () => {
    selectRows = [OLD_CONTRACT_ROW];

    await expect(fetchForVendors([7])).resolves.toEqual([EXPECTED_OLD_ROW]);
  });

  it('returns an empty list when the query yields nothing', async () => {
    selectRows = null;

    await expect(fetchForVendors([7])).resolves.toEqual([]);
  });

  it('throws when the lookup fails', async () => {
    selectError = connectionError;

    await expect(fetchForVendors([7])).rejects.toMatchObject({ code: '08006' });
  });
});
