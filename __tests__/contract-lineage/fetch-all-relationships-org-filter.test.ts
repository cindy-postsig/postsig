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

let selectedColumns = '';
let recordedFilters: RecordedFilter[] = [];
let relationshipRows: Array<Record<string, unknown>> = [];

const recordSelect = (columns: string) => {
  selectedColumns = columns;
};

const recordFilter = (op: string, column: string, value: unknown) => {
  recordedFilters.push({ op, column, value });
};

/**
 * Chainable PostgREST stub. The builder is thenable, so awaiting the query chain
 * resolves with the canned rows regardless of how many filters were applied.
 */
function makeBuilder() {
  const builder: Record<string, unknown> = {
    select: (columns: string) => {
      recordSelect(columns);
      return builder;
    },
    eq: (column: string, value: unknown) => {
      recordFilter('eq', column, value);
      return builder;
    },
    or: (filter: string) => {
      recordFilter('or', filter, undefined);
      return builder;
    },
    then: (fn: (v: unknown) => unknown) =>
      fn({ data: relationshipRows, error: null }),
  };
  return builder;
}

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({ from: () => makeBuilder() }),
}));

jest.mock('@/data/superuser/vendors', () => ({
  expandVendorLineageIds: jest.fn(async (id: number) => [id]),
  getCurrentVendorsByOriginalVendorIds: jest.fn(async () => []),
}));

import { fetchAllRelationshipsForOrg } from '@/data/superuser/contracts';

const ORG_ID = 'org-1';

describe('fetchAllRelationshipsForOrg org filter', () => {
  beforeEach(() => {
    selectedColumns = '';
    recordedFilters = [];
    relationshipRows = [];
  });

  it('embeds the parent contract with !inner so the org filter drops rows', async () => {
    // Without `!inner`, PostgREST scopes `parent_contract.organization_id` to the
    // embedded resource and returns every relationship row with a null parent —
    // a full-table fetch on the service-role client. This is the regression pin.
    await fetchAllRelationshipsForOrg(ORG_ID);

    expect(selectedColumns).toContain('!inner');
    expect(selectedColumns).toContain(
      'contracts!contract_relationships_parent_contract_id_fkey!inner(organization_id)',
    );
  });

  it('filters on the embedded parent organization_id for the given org', async () => {
    await fetchAllRelationshipsForOrg(ORG_ID);

    expect(recordedFilters).toContainEqual({
      op: 'eq',
      column: 'parent_contract.organization_id',
      value: ORG_ID,
    });
  });

  it('still restricts to active, non-disabled relationships', async () => {
    await fetchAllRelationshipsForOrg(ORG_ID);

    expect(recordedFilters).toContainEqual({
      op: 'eq',
      column: 'active',
      value: true,
    });
    expect(recordedFilters).toContainEqual({
      op: 'or',
      column: 'disabled.is.null,disabled.eq.false',
      value: undefined,
    });
  });

  it('returns the rows the query yields', async () => {
    relationshipRows = [
      { id: 1, parent_contract_id: 10, child_contract_id: 11 },
    ];

    await expect(fetchAllRelationshipsForOrg(ORG_ID)).resolves.toEqual(
      relationshipRows,
    );
  });
});
