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

interface RecordedQuery {
  table: string;
  filters: RecordedFilter[];
}

const recordedQueries: RecordedQuery[] = [];
let contractRows: Array<Record<string, unknown>> = [];

/**
 * Minimal chainable PostgREST stub. Every builder method records its filter and
 * returns itself; awaiting the builder resolves with the canned rows. Only the
 * `contracts` table returns data — relationship lookups resolve empty so the
 * strategy reaches the candidate query under test.
 */
function makeBuilder(table: string) {
  const record: RecordedQuery = { table, filters: [] };
  recordedQueries.push(record);
  const rows = table === 'contracts' ? contractRows : [];
  const push = (op: string) => (column: string, value: unknown) => {
    record.filters.push({ op, column, value });
    return builder;
  };
  const resolve = (fn: (v: unknown) => unknown) =>
    fn({ data: rows, error: null });
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: push('eq'),
    in: push('in'),
    is: push('is'),
    neq: push('neq'),
    not: push('not'),
    single: () => Promise.resolve({ data: null, error: null }),
    then: resolve,
  };
  return builder;
}

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({ from: (table: string) => makeBuilder(table) }),
}));

const mockExpandVendorLineageIds =
  jest.fn<(vendorId: number) => Promise<number[]>>();

jest.mock('@/data/superuser/vendors', () => ({
  expandVendorLineageIds: (vendorId: number) =>
    mockExpandVendorLineageIds(vendorId),
}));

/**
 * These two run their own `vendor_id`-filtered `contracts` queries inside the
 * data layer. They stay mocked (their internals are covered by their own
 * suites) but the mocks are spies, so this suite can assert the *vendor
 * argument* they receive — otherwise a scalar call site here would be
 * invisible to the recorded-query assertions below.
 */
const mockFindLinkedContract =
  jest.fn<(vendorIds: number[], ...rest: unknown[]) => Promise<unknown>>();
const mockFindContractsWithMatchingProducts =
  jest.fn<(vendorIds: number[], ...rest: unknown[]) => Promise<unknown[]>>();

jest.mock('@/data/superuser/contracts', () => ({
  findLinkedContract: (...args: [number[], ...unknown[]]) =>
    mockFindLinkedContract(...args),
  findContractsWithMatchingProducts: (...args: [number[], ...unknown[]]) =>
    mockFindContractsWithMatchingProducts(...args),
  saveContractLineage: jest.fn(async () => null),
  fetchContract: jest.fn(async () => null),
}));

jest.mock('@/app/lib/emails/contract-lineage', () => ({
  sendContractLineageEmail: jest.fn(async () => undefined),
}));

const mockGetAllOrgUsers = jest.fn<(orgId: string) => Promise<string[]>>();

jest.mock('@/data/users', () => ({
  getAllOrgUsers: (orgId: string) => mockGetAllOrgUsers(orgId),
}));

import {
  contractLineageStrategies,
  detectRetroactiveChildren,
} from '@/app/lib/actions/contract-lineage-strategies';
import { contractTypes } from '@/app/lib/constants';

const ORG_USER_IDS = ['user-a', 'user-b'];
const ORG_ID = 'org-1';

/** Vendor 11 (data.ai) merged into vendor 22 (Sensor Tower). */
const MERGED_LINEAGE = [11, 22];

/**
 * Every `contracts` query that filters on `vendor_id` — i.e. every candidate
 * lookup. Deliberately *all* of them, not the first: a single remaining scalar
 * call site is exactly the regression this suite exists to catch.
 */
function candidateQueries(): RecordedQuery[] {
  return recordedQueries.filter(
    (q) =>
      q.table === 'contracts' &&
      q.filters.some((f) => f.column === 'vendor_id'),
  );
}

/** The named filter from each candidate query, in query order. */
function candidateFilters(column: string): Array<RecordedFilter | undefined> {
  return candidateQueries().map((q) =>
    q.filters.find((f) => f.column === column),
  );
}

const inFilter = (column: string, value: unknown): RecordedFilter => ({
  op: 'in',
  column,
  value,
});

function runDefaultStrategy(vendorIds: number[]) {
  return contractLineageStrategies.default({
    contract: { id: 100, type_id: contractTypes.MSA },
    data: {},
    vendorId: 11,
    vendorIds,
    organizationId: ORG_ID,
    contractId: 100,
    // Drives the `findLinkedContract` parent-by-date branch.
    parent_agreement_date: '2026-01-01',
  });
}

const PRODUCT_DETAIL = {
  product_id: 7,
  vendor_products: { id: 7, name: 'Widget' },
};

function runInvoiceStrategy(vendorIds: number[]) {
  const contract = {
    id: 100,
    type_id: contractTypes.Invoice,
    vendor_products_details: [PRODUCT_DETAIL],
  };
  return contractLineageStrategies[String(contractTypes.Invoice)]({
    contract,
    data: {},
    vendorId: 11,
    vendorIds,
    organizationId: ORG_ID,
    contractId: 100,
  });
}

function runDetection() {
  return detectRetroactiveChildren({
    contractId: 100,
    vendorId: 22,
    organizationId: ORG_ID,
    contractTypeId: contractTypes.MSA,
    startDate: '2026-01-01',
    products: [],
  });
}

describe('merge-aware candidate lookup', () => {
  beforeEach(() => {
    recordedQueries.length = 0;
    contractRows = [];
    mockExpandVendorLineageIds.mockReset();
    mockExpandVendorLineageIds.mockResolvedValue(MERGED_LINEAGE);
    mockGetAllOrgUsers.mockReset();
    mockGetAllOrgUsers.mockResolvedValue(ORG_USER_IDS);
    mockFindLinkedContract.mockReset();
    mockFindLinkedContract.mockResolvedValue(null);
    mockFindContractsWithMatchingProducts.mockReset();
    mockFindContractsWithMatchingProducts.mockResolvedValue([]);
  });

  // Pre-fix both call sites used `.eq('vendor_id', <scalar>)`, so a contract
  // stored under a merged sibling id was invisible to the contract being
  // processed. Widening to `.in(...)` must not widen the org scope.
  it('defaultStrategy matches candidates across the whole vendor lineage', async () => {
    await runDefaultStrategy(MERGED_LINEAGE);

    const filters = candidateFilters('vendor_id');
    expect(filters.length).toBeGreaterThan(0);
    // Every candidate query, not just the first — one leftover `.eq` here is
    // the asymmetry (children found across the lineage, parents not) that
    // makes the merge fix silently partial.
    filters.forEach((filter) =>
      expect(filter).toEqual(inFilter('vendor_id', MERGED_LINEAGE)),
    );
  });

  it('defaultStrategy passes the lineage to the data-layer lookups', async () => {
    await runDefaultStrategy(MERGED_LINEAGE);

    expect(mockFindLinkedContract).toHaveBeenCalled();
    expect(mockFindLinkedContract.mock.calls[0][0]).toEqual(MERGED_LINEAGE);
    expect(mockFindContractsWithMatchingProducts).toHaveBeenCalled();
    expect(mockFindContractsWithMatchingProducts.mock.calls[0][0]).toEqual(
      MERGED_LINEAGE,
    );
  });

  it('invoiceStrategy matches parents across the whole vendor lineage', async () => {
    await runInvoiceStrategy(MERGED_LINEAGE);

    expect(mockFindContractsWithMatchingProducts).toHaveBeenCalled();
    expect(mockFindContractsWithMatchingProducts.mock.calls[0][0]).toEqual(
      MERGED_LINEAGE,
    );
  });

  it('defaultStrategy still restricts candidates to the org users', async () => {
    await runDefaultStrategy(MERGED_LINEAGE);

    candidateFilters('user_id').forEach((filter) =>
      expect(filter).toEqual(inFilter('user_id', ORG_USER_IDS)),
    );
  });

  it('defaultStrategy does not re-expand — it uses the ids handed to it', async () => {
    await runDefaultStrategy([11]);

    expect(mockExpandVendorLineageIds).not.toHaveBeenCalled();
    candidateFilters('vendor_id').forEach((filter) =>
      expect(filter?.value).toEqual([11]),
    );
    expect(mockFindLinkedContract.mock.calls[0][0]).toEqual([11]);
  });

  it('detectRetroactiveChildren expands once and matches the lineage', async () => {
    await runDetection();

    expect(mockExpandVendorLineageIds).toHaveBeenCalledTimes(1);
    expect(mockExpandVendorLineageIds).toHaveBeenCalledWith(22);
    const filters = candidateFilters('vendor_id');
    expect(filters.length).toBeGreaterThan(0);
    filters.forEach((filter) =>
      expect(filter).toEqual(inFilter('vendor_id', MERGED_LINEAGE)),
    );
  });

  it('detectRetroactiveChildren still restricts candidates to org users', async () => {
    await runDetection();

    candidateFilters('user_id').forEach((filter) =>
      expect(filter).toEqual(inFilter('user_id', ORG_USER_IDS)),
    );
  });

  it('detectRetroactiveChildren reaches a child under a sibling vendor id', async () => {
    contractRows = [{ id: 200, type_id: contractTypes.Invoice, metadata: {} }];

    await runDetection();

    // The row is only reachable because the filter spans both lineage ids.
    candidateFilters('vendor_id').forEach((filter) =>
      expect(filter?.value).toEqual(MERGED_LINEAGE),
    );
  });
});
