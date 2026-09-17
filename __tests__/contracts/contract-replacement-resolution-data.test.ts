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

let recordedFilters: RecordedFilter[] = [];
let fromTables: string[] = [];
let selectedColumns: Array<string | undefined> = [];
let updatedRows: Array<Record<string, unknown>> = [];
let orderCalls: Array<{ column: string; options: unknown }> = [];
let limitCalls: number[] = [];
let queryError: PostgrestErrorLike | null = null;
let queryRows: Array<Record<string, unknown>> | null = [];

const resetState = () => {
  recordedFilters = [];
  fromTables = [];
  selectedColumns = [];
  updatedRows = [];
  orderCalls = [];
  limitCalls = [];
  queryError = null;
  queryRows = [];
};

const recordFilter = (op: string, column: string, value: unknown) => {
  recordedFilters.push({ op, column, value });
};

/** Every `status` filter the last call applied, in order. */
function statusFilters(): RecordedFilter[] {
  return recordedFilters.filter((f) => f.column === 'status');
}

/**
 * Chainable PostgREST stub. The builder is thenable, so awaiting a chain
 * resolves with the canned rows regardless of how many filters were applied.
 */
function makeBuilder() {
  const builder: Record<string, unknown> = {
    select: (columns?: string) => {
      selectedColumns.push(columns);
      return builder;
    },
    update: (row: Record<string, unknown>) => {
      updatedRows.push(row);
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
    order: (column: string, options: unknown) => {
      orderCalls.push({ column, options });
      return builder;
    },
    limit: (count: number) => {
      limitCalls.push(count);
      return builder;
    },
    // Resolves with the first canned row, mirroring PostgREST's maybeSingle.
    maybeSingle: () =>
      Promise.resolve({
        data: (queryRows ?? [])[0] ?? null,
        error: queryError,
      }),
    then: (fn: (v: unknown) => unknown) =>
      fn({ data: queryRows, error: queryError }),
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
  confirmReplacementEventsForArchivedContracts,
  fetchConfirmedEventForOldContract,
  fetchReplacementContractSummary,
  fetchVerifiedEventsForContracts,
  fetchVerifiedEventsForNewContract,
  resolveReplacementEvent,
} from '@/data/superuser/contractReplacementResolution';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const EVENT_COLUMNS = 'id, old_contract_id, new_contract_id, organization_id';

describe('fetchVerifiedEventsForContracts', () => {
  beforeEach(resetState);

  it('filters to verified events for the given contracts and org', async () => {
    await fetchVerifiedEventsForContracts({
      organizationId: ORG_ID,
      contractIds: [1, 2],
    });

    expect(fromTables).toEqual(['contract_lineage_events']);
    expect(recordedFilters).toContainEqual({
      op: 'in',
      column: 'old_contract_id',
      value: [1, 2],
    });
    expect(recordedFilters).toContainEqual({
      op: 'eq',
      column: 'organization_id',
      value: ORG_ID,
    });
  });

  it('never widens past the verified status', async () => {
    // Pending events have not passed extractor screening; confirmed/rejected
    // are already resolved. Neither may reach a customer surface.
    await fetchVerifiedEventsForContracts({
      organizationId: ORG_ID,
      contractIds: [1],
    });

    expect(statusFilters()).toEqual([
      { op: 'eq', column: 'status', value: 'verified' },
    ]);
  });

  it('matches on the old contract, never the new one', async () => {
    // The prompt belongs on the contract proposed for archiving.
    await fetchVerifiedEventsForContracts({
      organizationId: ORG_ID,
      contractIds: [1],
    });

    expect(recordedFilters.some((f) => f.column === 'new_contract_id')).toBe(
      false,
    );
  });

  it('selects only the resolution columns, keeping evidence out of the payload', async () => {
    // `evidence` holds verbatim contract quotes; it must never ride along into
    // the client component this data is serialized into.
    await fetchVerifiedEventsForContracts({
      organizationId: ORG_ID,
      contractIds: [1],
    });

    expect(selectedColumns).toEqual([EVENT_COLUMNS]);
  });

  it('returns the rows the query yields, stamped verified', async () => {
    queryRows = [
      {
        id: 5,
        old_contract_id: 1,
        new_contract_id: 2,
        organization_id: ORG_ID,
      },
    ];

    await expect(
      fetchVerifiedEventsForContracts({
        organizationId: ORG_ID,
        contractIds: [1],
      }),
    ).resolves.toEqual([
      {
        id: 5,
        old_contract_id: 1,
        new_contract_id: 2,
        organization_id: ORG_ID,
        status: 'verified',
      },
    ]);
  });

  it('returns an empty array when the query yields no rows', async () => {
    queryRows = null;

    await expect(
      fetchVerifiedEventsForContracts({
        organizationId: ORG_ID,
        contractIds: [1],
      }),
    ).resolves.toEqual([]);
  });

  it('short-circuits without querying when there are no contract ids', async () => {
    await expect(
      fetchVerifiedEventsForContracts({
        organizationId: ORG_ID,
        contractIds: [],
      }),
    ).resolves.toEqual([]);

    expect(fromTables).toEqual([]);
  });

  it('rethrows query errors', async () => {
    queryError = { code: '42501', message: 'permission denied' };

    await expect(
      fetchVerifiedEventsForContracts({
        organizationId: ORG_ID,
        contractIds: [1],
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('fetchVerifiedEventsForNewContract', () => {
  beforeEach(resetState);

  it('filters to verified events naming the contract as the NEW side', async () => {
    await fetchVerifiedEventsForNewContract({
      organizationId: ORG_ID,
      contractId: 8,
    });

    expect(fromTables).toEqual(['contract_lineage_events']);
    expect(recordedFilters).toContainEqual({
      op: 'eq',
      column: 'new_contract_id',
      value: 8,
    });
    expect(recordedFilters).toContainEqual({
      op: 'eq',
      column: 'organization_id',
      value: ORG_ID,
    });
    expect(statusFilters()).toEqual([
      { op: 'eq', column: 'status', value: 'verified' },
    ]);
    expect(recordedFilters.some((f) => f.column === 'old_contract_id')).toBe(
      false,
    );
  });

  it('selects only the resolution columns, keeping evidence out of the payload', async () => {
    await fetchVerifiedEventsForNewContract({
      organizationId: ORG_ID,
      contractId: 8,
    });

    expect(selectedColumns).toEqual([EVENT_COLUMNS]);
  });

  it('returns every matching event stamped verified', async () => {
    // One replacement can be proposed for several old contracts at once.
    queryRows = [
      {
        id: 5,
        old_contract_id: 1,
        new_contract_id: 8,
        organization_id: ORG_ID,
      },
      {
        id: 6,
        old_contract_id: 2,
        new_contract_id: 8,
        organization_id: ORG_ID,
      },
    ];

    await expect(
      fetchVerifiedEventsForNewContract({
        organizationId: ORG_ID,
        contractId: 8,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: 5, status: 'verified' }),
      expect.objectContaining({ id: 6, status: 'verified' }),
    ]);
  });

  it('returns an empty array when the query yields no rows', async () => {
    queryRows = null;

    await expect(
      fetchVerifiedEventsForNewContract({
        organizationId: ORG_ID,
        contractId: 8,
      }),
    ).resolves.toEqual([]);
  });

  it('rethrows query errors', async () => {
    queryError = { code: '42501', message: 'permission denied' };

    await expect(
      fetchVerifiedEventsForNewContract({
        organizationId: ORG_ID,
        contractId: 8,
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('fetchConfirmedEventForOldContract', () => {
  beforeEach(resetState);

  it('filters to a confirmed event on the old contract for the org', async () => {
    await fetchConfirmedEventForOldContract({
      organizationId: ORG_ID,
      contractId: 7,
    });

    expect(recordedFilters).toContainEqual({
      op: 'eq',
      column: 'old_contract_id',
      value: 7,
    });
    expect(recordedFilters).toContainEqual({
      op: 'eq',
      column: 'organization_id',
      value: ORG_ID,
    });
    expect(statusFilters()).toEqual([
      { op: 'eq', column: 'status', value: 'confirmed' },
    ]);
  });

  it('takes only the most recent event', async () => {
    await fetchConfirmedEventForOldContract({
      organizationId: ORG_ID,
      contractId: 7,
    });

    expect(orderCalls).toEqual([
      { column: 'id', options: { ascending: false } },
    ]);
    expect(limitCalls).toEqual([1]);
  });

  it('returns the event stamped confirmed', async () => {
    queryRows = [
      {
        id: 9,
        old_contract_id: 7,
        new_contract_id: 8,
        organization_id: ORG_ID,
      },
    ];

    await expect(
      fetchConfirmedEventForOldContract({
        organizationId: ORG_ID,
        contractId: 7,
      }),
    ).resolves.toMatchObject({ id: 9, status: 'confirmed' });
  });

  it('returns null when no confirmed event exists', async () => {
    queryRows = [];

    await expect(
      fetchConfirmedEventForOldContract({
        organizationId: ORG_ID,
        contractId: 7,
      }),
    ).resolves.toBeNull();
  });

  it('returns null when the query yields no data at all', async () => {
    queryRows = null;

    await expect(
      fetchConfirmedEventForOldContract({
        organizationId: ORG_ID,
        contractId: 7,
      }),
    ).resolves.toBeNull();
  });

  it('rethrows query errors', async () => {
    queryError = { code: '42501', message: 'permission denied' };

    await expect(
      fetchConfirmedEventForOldContract({
        organizationId: ORG_ID,
        contractId: 7,
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('resolveReplacementEvent', () => {
  beforeEach(resetState);

  it('stamps the resolving user and time alongside the new status', async () => {
    queryRows = [{ id: 3 }];

    await resolveReplacementEvent({
      eventId: 3,
      organizationId: ORG_ID,
      status: 'confirmed',
      userId: USER_ID,
    });

    expect(updatedRows).toHaveLength(1);
    expect(updatedRows[0]).toMatchObject({
      status: 'confirmed',
      resolved_by: USER_ID,
    });
    expect(typeof updatedRows[0].resolved_at).toBe('string');
  });

  it('guards the transition on the expected status', async () => {
    // Applied as a filter, not a read-then-write: two concurrent resolutions of
    // the same prompt must not both succeed.
    queryRows = [{ id: 3 }];

    await resolveReplacementEvent({
      eventId: 3,
      organizationId: ORG_ID,
      status: 'rejected',
      userId: USER_ID,
    });

    expect(statusFilters()).toEqual([
      { op: 'eq', column: 'status', value: 'verified' },
    ]);
  });

  it('scopes the update to the org so a foreign event id resolves nothing', async () => {
    // The service client bypasses RLS, so the org filter is the only guard.
    queryRows = [{ id: 3 }];

    await resolveReplacementEvent({
      eventId: 3,
      organizationId: ORG_ID,
      status: 'confirmed',
      userId: USER_ID,
    });

    expect(recordedFilters).toContainEqual({
      op: 'eq',
      column: 'organization_id',
      value: ORG_ID,
    });
    expect(recordedFilters).toContainEqual({
      op: 'eq',
      column: 'id',
      value: 3,
    });
  });

  it('reports resolved when a row matched', async () => {
    queryRows = [{ id: 3 }];

    await expect(
      resolveReplacementEvent({
        eventId: 3,
        organizationId: ORG_ID,
        status: 'confirmed',
        userId: USER_ID,
      }),
    ).resolves.toEqual({ resolved: true });
  });

  it('reports not resolved when the event is no longer verified', async () => {
    // A double-resolve, or an event still pending extractor screening.
    queryRows = [];

    await expect(
      resolveReplacementEvent({
        eventId: 3,
        organizationId: ORG_ID,
        status: 'confirmed',
        userId: USER_ID,
      }),
    ).resolves.toEqual({ resolved: false });
  });

  it('blocks the second of two identical resolutions', async () => {
    queryRows = [{ id: 3 }];
    const first = await resolveReplacementEvent({
      eventId: 3,
      organizationId: ORG_ID,
      status: 'confirmed',
      userId: USER_ID,
    });

    queryRows = [];
    const second = await resolveReplacementEvent({
      eventId: 3,
      organizationId: ORG_ID,
      status: 'confirmed',
      userId: USER_ID,
    });

    expect([first.resolved, second.resolved]).toEqual([true, false]);
  });

  it('rethrows update errors', async () => {
    queryError = { code: '23503', message: 'foreign key violation' };

    await expect(
      resolveReplacementEvent({
        eventId: 3,
        organizationId: ORG_ID,
        status: 'confirmed',
        userId: USER_ID,
      }),
    ).rejects.toMatchObject({ code: '23503' });
  });
});

const productDetail = (name: string | null) => ({
  vendor_products: name === null ? null : { name },
});

const dateEntries = (...dates: Array<string | null>) =>
  dates.map((date) => ({ date }));

const summaryRow = (overrides: Record<string, unknown> = {}) => ({
  id: 9,
  term_start_date: dateEntries('2026-05-01'),
  term_end_date: dateEntries('2027-04-30'),
  metadata: { lineage: { order_number: 'SO-1042' } },
  vendors: { name: 'Acme' },
  vendor_products_details: [productDetail('Seats')],
  ...overrides,
});

describe('fetchReplacementContractSummary', () => {
  beforeEach(resetState);

  const fetchSummary = () =>
    fetchReplacementContractSummary({ contractId: 9, organizationId: ORG_ID });

  it('scopes the lookup to the contract and the caller org', async () => {
    queryRows = [summaryRow()];

    await fetchSummary();

    expect(fromTables).toEqual(['contracts']);
    expect(recordedFilters).toContainEqual({
      op: 'eq',
      column: 'id',
      value: 9,
    });
    expect(recordedFilters).toContainEqual({
      op: 'eq',
      column: 'organization_id',
      value: ORG_ID,
    });
  });

  it('maps the vendor name, first product and order number', async () => {
    queryRows = [summaryRow()];

    await expect(fetchSummary()).resolves.toMatchObject({
      id: 9,
      vendorName: 'Acme',
      firstProductName: 'Seats',
      orderNumber: 'SO-1042',
    });
  });

  it('takes the earliest date from an array of date objects', async () => {
    // A later element is an extension, not the original start.
    const term_start_date = dateEntries(
      '2027-01-01',
      '2026-05-01',
      '2026-11-30',
    );
    queryRows = [summaryRow({ term_start_date })];

    await expect(fetchSummary()).resolves.toMatchObject({
      startDate: '2026-05-01',
    });
  });

  it('still reads a bare string date', async () => {
    queryRows = [summaryRow({ term_start_date: '2026-05-01' })];

    await expect(fetchSummary()).resolves.toMatchObject({
      startDate: '2026-05-01',
    });
  });

  it('reports a null start date when no usable date is present', async () => {
    queryRows = [summaryRow({ term_start_date: dateEntries(null) })];

    await expect(fetchSummary()).resolves.toMatchObject({ startDate: null });
  });

  it('takes the LATEST date from the end-date history', async () => {
    // An extension appends a later end date; the earlier one no longer says
    // when the contract runs out.
    const term_end_date = dateEntries('2027-04-30', '2028-04-30', '2027-10-31');
    queryRows = [summaryRow({ term_end_date })];

    await expect(fetchSummary()).resolves.toMatchObject({
      endDate: '2028-04-30',
    });
  });

  it('still reads a bare string end date', async () => {
    queryRows = [summaryRow({ term_end_date: '2027-04-30' })];

    await expect(fetchSummary()).resolves.toMatchObject({
      endDate: '2027-04-30',
    });
  });

  it('reports a null end date when no usable date is present', async () => {
    queryRows = [summaryRow({ term_end_date: dateEntries(null) })];

    await expect(fetchSummary()).resolves.toMatchObject({ endDate: null });
  });

  it('falls back to null when metadata carries no order number', async () => {
    queryRows = [summaryRow({ metadata: null })];

    await expect(fetchSummary()).resolves.toMatchObject({ orderNumber: null });
  });

  it('skips product rows with no name when picking the first product', async () => {
    const vendor_products_details = [
      productDetail(null),
      productDetail('Support'),
    ];
    queryRows = [summaryRow({ vendor_products_details })];

    await expect(fetchSummary()).resolves.toMatchObject({
      firstProductName: 'Support',
    });
  });

  it('returns null when no row matches', async () => {
    queryRows = [];

    await expect(fetchSummary()).resolves.toBeNull();
  });

  it('rethrows query errors', async () => {
    queryError = { code: '42501', message: 'permission denied' };

    await expect(fetchSummary()).rejects.toMatchObject({ code: '42501' });
  });
});

describe('confirmReplacementEventsForArchivedContracts', () => {
  beforeEach(resetState);

  const confirm = (contractIds: number[]) =>
    confirmReplacementEventsForArchivedContracts({
      organizationId: ORG_ID,
      contractIds,
      userId: USER_ID,
    });

  it('short-circuits without querying when nothing was archived', async () => {
    await expect(confirm([])).resolves.toEqual({ confirmedCount: 0 });

    expect(fromTables).toEqual([]);
  });

  it('confirms the verified event whose old contract was archived', async () => {
    queryRows = [{ id: 5, old_contract_id: 1, new_contract_id: 2 }];

    await expect(confirm([1])).resolves.toEqual({ confirmedCount: 1 });

    expect(updatedRows).toHaveLength(1);
    expect(updatedRows[0]).toMatchObject({
      status: 'confirmed',
      resolved_by: USER_ID,
    });
  });

  it('stamps the archiving user as the resolver', async () => {
    // Archiving IS the answer to the prompt, so the person who archived owns it.
    queryRows = [{ id: 5, old_contract_id: 1, new_contract_id: 2 }];

    await confirm([1]);

    expect(updatedRows[0].resolved_by).toBe(USER_ID);
    expect(typeof updatedRows[0].resolved_at).toBe('string');
  });

  it('resolves an event for every archived contract in a cascade', async () => {
    queryRows = [
      { id: 5, old_contract_id: 1, new_contract_id: 9 },
      { id: 6, old_contract_id: 2, new_contract_id: 9 },
    ];

    await expect(confirm([1, 2])).resolves.toEqual({ confirmedCount: 2 });
    expect(updatedRows).toHaveLength(2);
  });

  it('looks up only verified events, so a pending prompt is left alone', async () => {
    queryRows = [{ id: 5, old_contract_id: 1, new_contract_id: 2 }];

    await confirm([1]);

    expect(statusFilters()).toContainEqual({
      op: 'eq',
      column: 'status',
      value: 'verified',
    });
  });

  it('scopes both the lookup and the update to the caller org', async () => {
    // The service client bypasses RLS, so this filter is the only tenant guard.
    queryRows = [{ id: 5, old_contract_id: 1, new_contract_id: 2 }];

    await confirm([1]);

    const orgFilters = recordedFilters.filter(
      (f) => f.column === 'organization_id',
    );
    expect(orgFilters).toHaveLength(2);
    expect(orgFilters.every((f) => f.value === ORG_ID)).toBe(true);
  });

  it('writes nothing when the contract carries no verified prompt', async () => {
    queryRows = [];

    await expect(confirm([1])).resolves.toEqual({ confirmedCount: 0 });
    expect(updatedRows).toEqual([]);
  });

  it('rethrows so the caller can decide whether to swallow', async () => {
    queryError = { code: '42501', message: 'permission denied' };

    await expect(confirm([1])).rejects.toMatchObject({ code: '42501' });
  });
});
