import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

jest.mock('@/utils/pino', () => ({ __esModule: true, default: mockLogger }));

const PGRST116 = {
  code: 'PGRST116',
  message: 'JSON object requested, multiple (or no) rows returned',
};

/**
 * Rows the stubbed `contract_relationships` lookup returns for the invoice
 * parentage check, plus the error it reports. Set per test.
 */
let relationshipRows: Array<{ id: number; relationship_type?: string | null }> =
  [];
let relationshipError: typeof PGRST116 | null = null;
/** Terminal methods the relationship query chain called, in order. */
let terminalCalls: string[] = [];
/** `.is(column, value)` filters the relationship chain recorded. */
let isFilters: Array<[string, unknown]> = [];

const EMPTY_RESULT = { data: [], error: null };
const NULL_ROW_RESULT = { data: null, error: null };
const MULTI_ROW_RESULT = { data: null, error: PGRST116 };

/** postgrest-js returns PGRST116 with a null row whenever the count isn't 1. */
function resolveSingular(rows: Array<{ id: number }>) {
  if (relationshipError) {
    return Promise.resolve({ data: null, error: relationshipError });
  }
  if (rows.length > 1) return Promise.resolve(MULTI_ROW_RESULT);
  return Promise.resolve({ data: rows[0] ?? null, error: null });
}

/**
 * Chainable PostgREST stub for the relationship lookup.
 *
 * The stub honours a recorded `limit`, so `.limit(1).maybeSingle()` sees one
 * row where a bare `.single()` would see two and fail — which is what makes the
 * multi-row test meaningful rather than tautological. It honours
 * `.is('relationship_type', null)` the same way, so a billing-only child is
 * only invisible to the gate if the query actually filters on the column.
 */
function makeRelationshipBuilder() {
  let limit: number | null = null;
  let hierarchyOnly = false;
  const builder: Record<string, unknown> = {};
  const rowsForTerminal = () => {
    const matching = hierarchyOnly
      ? relationshipRows.filter((row) => row.relationship_type == null)
      : relationshipRows;
    return limit === null ? matching : matching.slice(0, limit);
  };
  const chain = () => builder;
  const recordIs = (column: string, value: unknown) => {
    isFilters.push([column, value]);
    if (column === 'relationship_type' && value === null) hierarchyOnly = true;
    return builder;
  };
  const recordLimit = (n: number) => {
    terminalCalls.push('limit');
    limit = n;
    return builder;
  };
  const terminal = (name: string) => () => {
    terminalCalls.push(name);
    return resolveSingular(rowsForTerminal());
  };
  const thenable = (fn: (v: unknown) => unknown) => fn(EMPTY_RESULT);

  Object.assign(builder, {
    select: chain,
    eq: chain,
    in: chain,
    is: recordIs,
    not: chain,
    limit: recordLimit,
    single: terminal('single'),
    maybeSingle: terminal('maybeSingle'),
    then: thenable,
  });
  return builder;
}

/** Candidate `contracts` lookups resolve empty so the strategy reaches the check. */
function makeContractsBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  const nullRow = () => Promise.resolve(NULL_ROW_RESULT);
  const thenable = (fn: (v: unknown) => unknown) => fn(EMPTY_RESULT);

  Object.assign(builder, {
    select: chain,
    eq: chain,
    in: chain,
    is: chain,
    neq: chain,
    not: chain,
    single: nullRow,
    maybeSingle: nullRow,
    then: thenable,
  });
  return builder;
}

function makeBuilder(table: string) {
  return table === 'contract_relationships'
    ? makeRelationshipBuilder()
    : makeContractsBuilder();
}

const mockSupabase = { from: (table: string) => makeBuilder(table) };

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => mockSupabase,
}));

/**
 * The related-invoice lookup feeding `relationships.invoices` — the loop that
 * holds the parentage check. It must yield a row, or the branch under test
 * never executes and every assertion below passes vacuously.
 */
const RELATED_INVOICE = { id: 200, type_id: 6 };

const contractsDataMock = {
  findLinkedContract: jest.fn(async () => null),
  findContractsWithMatchingProducts: jest.fn(async () => [RELATED_INVOICE]),
  saveContractLineage: jest.fn(async () => 900),
  fetchContract: jest.fn(async () => null),
};

jest.mock('@/data/superuser/contracts', () => contractsDataMock);

const emailMock = { sendContractLineageEmail: jest.fn(async () => undefined) };

jest.mock('@/app/lib/emails/contract-lineage', () => emailMock);

const usersMock = { getAllOrgUsers: jest.fn(async () => ['user-a']) };

jest.mock('@/data/users', () => usersMock);

const vendorsMock = {
  expandVendorLineageIds: jest.fn(async (id: number) => [id]),
};

jest.mock('@/data/superuser/vendors', () => vendorsMock);

import { contractLineageStrategies } from '@/app/lib/actions/contract-lineage-strategies';
import { contractTypes } from '@/app/lib/constants';
import { buildContractHierarchyMap } from '@/lib/inventory/hierarchyUtils';

const ORG_ID = 'org-1';

const PRODUCT_DETAIL = {
  product_id: 7,
  vendor_products: { id: 7, name: 'Widget' },
};

const STRATEGY_PARAMS = {
  contract: {
    id: 100,
    type_id: contractTypes.MSA,
    vendor_products_details: [PRODUCT_DETAIL],
  },
  data: {},
  vendorId: 11,
  vendorIds: [11],
  organizationId: ORG_ID,
  contractId: 100,
};

/** Drives defaultStrategy through the invoice parentage-check branch. */
function runDefaultStrategy() {
  return contractLineageStrategies.default({ ...STRATEGY_PARAMS, data: {} });
}

describe('invoice parentage check tolerates multi-parent children', () => {
  beforeEach(() => {
    relationshipRows = [];
    relationshipError = null;
    terminalCalls = [];
    isFilters = [];
    mockLogger.error.mockClear();
    contractsDataMock.saveContractLineage.mockClear();
  });

  it('uses limit(1) + maybeSingle rather than a bare single()', async () => {
    // `.single()` sets Accept: vnd.pgrst.object+json, so a child with two
    // relationship rows comes back {data: null, error: PGRST116}. The old code
    // discarded that error and misread null as "no parent".
    await runDefaultStrategy();

    // Guards against a vacuous pass: if the invoice loop never ran, no terminal
    // was called and `not.toContain` would hold against the unfixed code too.
    expect(terminalCalls).toContain('maybeSingle');
    expect(terminalCalls).toContain('limit');
    expect(terminalCalls).not.toContain('single');
  });

  it('treats a child with multiple relationship rows as already parented', async () => {
    // The regression: PGRST116 -> data null -> "no parent" -> a second edge
    // written onto an already-parented invoice.
    relationshipRows = [{ id: 1 }, { id: 2 }];

    await runDefaultStrategy();

    expect(contractsDataMock.saveContractLineage).not.toHaveBeenCalled();
  });

  it('does not write a new edge when the parentage lookup errors', async () => {
    relationshipError = PGRST116;

    await runDefaultStrategy();

    expect(contractsDataMock.saveContractLineage).not.toHaveBeenCalled();
  });

  it('alerts with a stable code when the parentage lookup errors', async () => {
    // A skipped invoice is silent lineage loss — the same class the
    // saveContractLineage guardrails page on. Monitors match `alert`, not text.
    relationshipError = PGRST116;

    await runDefaultStrategy();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        alert: 'contract-relationship-invalid',
        invoiceId: RELATED_INVOICE.id,
      }),
      expect.any(String),
    );
  });

  it('scopes the parentage gate to hierarchy edges', async () => {
    await runDefaultStrategy();

    expect(isFilters).toContainEqual(['relationship_type', null]);
  });

  it('still links an invoice whose only edge is a billing edge', async () => {
    // A billing edge names an *additional* parent, so it is not parentage. Read
    // untyped, it would deny this invoice its hierarchy parent permanently.
    relationshipRows = [{ id: 1, relationship_type: 'billing' }];

    await runDefaultStrategy();

    expect(contractsDataMock.saveContractLineage).toHaveBeenCalled();
  });

  it('still skips an invoice that has a hierarchy edge alongside a billing edge', async () => {
    relationshipRows = [
      { id: 1, relationship_type: 'billing' },
      { id: 2, relationship_type: null },
    ];

    await runDefaultStrategy();

    expect(contractsDataMock.saveContractLineage).not.toHaveBeenCalled();
  });

  it('still links an invoice that genuinely has no parent', async () => {
    relationshipRows = [];

    await runDefaultStrategy();

    expect(contractsDataMock.saveContractLineage).toHaveBeenCalled();
  });
});

type Edge = {
  parent_contract_id: number | null;
  child_contract_id: number | null;
  relationship_type?: string | null;
};

const A: Edge = { parent_contract_id: 2, child_contract_id: 3 };
const B: Edge = { parent_contract_id: 1, child_contract_id: 3 };
const C: Edge = { parent_contract_id: 1, child_contract_id: 4 };

/**
 * All six orderings of the same three edges, written out rather than generated
 * so no single lucky shuffle can pass. Child 3 has two parents (1 and 2), and
 * `parents` is first-edge-wins — pre-fix the winner depended on whichever row
 * order Postgres happened to return.
 */
const EDGE_ORDERINGS: Edge[][] = [
  [A, B, C],
  [A, C, B],
  [B, A, C],
  [B, C, A],
  [C, A, B],
  [C, B, A],
];

const NULL_PARENT_EDGE: Edge = {
  parent_contract_id: null,
  child_contract_id: 3,
};
const NULL_CHILD_EDGE: Edge = {
  parent_contract_id: 1,
  child_contract_id: null,
};
const UNLOADED_EDGE: Edge = { parent_contract_id: 1, child_contract_id: 99 };
const SIMPLE_EDGE: Edge = { parent_contract_id: 1, child_contract_id: 2 };
const SECOND_LEVEL_EDGE: Edge = { parent_contract_id: 2, child_contract_id: 3 };

const CONTRACTS = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

function serialize(map: ReturnType<typeof buildContractHierarchyMap>) {
  const byKey = (a: [number, unknown], b: [number, unknown]) => a[0] - b[0];
  return {
    children: [...map.children.entries()].sort(byKey),
    parents: [...map.parents.entries()].sort(byKey),
  };
}

describe('buildContractHierarchyMap determinism', () => {
  it('yields an identical map for every input ordering of a multi-parent child', () => {
    const results = EDGE_ORDERINGS.map((ordering) =>
      serialize(buildContractHierarchyMap(CONTRACTS, ordering)),
    );

    results.forEach((result) => expect(result).toEqual(results[0]));
  });

  it('resolves a multi-parent child to the lowest parent id', () => {
    const map = buildContractHierarchyMap(CONTRACTS, [A, B]);

    expect(map.parents.get(3)).toBe(1);
  });

  it('does not mutate the caller-owned relationships array', () => {
    // The sort runs on the filtered copy; callers share `allRelationships`
    // across several builders, so reordering it in place would be a silent
    // cross-consumer side effect.
    const edges: Edge[] = [A, C];
    const snapshot = [...edges];

    buildContractHierarchyMap(CONTRACTS, edges);

    expect(edges).toEqual(snapshot);
  });

  it('still drops half-null edges and edges outside the loaded set', () => {
    const map = buildContractHierarchyMap(CONTRACTS, [
      NULL_PARENT_EDGE,
      NULL_CHILD_EDGE,
      UNLOADED_EDGE,
      SIMPLE_EDGE,
    ]);

    expect(map.parents.get(2)).toBe(1);
    expect(map.parents.size).toBe(1);
    expect(map.children.get(1)).toEqual([2]);
  });

  it('preserves single-parent chain behavior unchanged', () => {
    const map = buildContractHierarchyMap(CONTRACTS, [
      SIMPLE_EDGE,
      SECOND_LEVEL_EDGE,
    ]);

    expect(map.parents.get(2)).toBe(1);
    expect(map.parents.get(3)).toBe(2);
    expect(map.children.get(1)).toEqual([2]);
    expect(map.children.get(2)).toEqual([3]);
  });
});

const HIERARCHY_PARENT_EDGE: Edge = {
  parent_contract_id: 2,
  child_contract_id: 3,
  relationship_type: null,
};
/**
 * Parent id 1 sorts ahead of the hierarchy parent's 2, so under the
 * (parent, child) ascending order this edge wins first-edge-wins on id alone.
 * Only the type predicate keeps it out.
 */
const LOWER_ID_BILLING_EDGE: Edge = {
  parent_contract_id: 1,
  child_contract_id: 3,
  relationship_type: 'billing',
};

describe('buildContractHierarchyMap excludes non-hierarchy edges', () => {
  it('does not let a lower-id billing edge displace the hierarchy parent', () => {
    const map = buildContractHierarchyMap(CONTRACTS, [
      LOWER_ID_BILLING_EDGE,
      HIERARCHY_PARENT_EDGE,
    ]);

    expect(map.parents.get(3)).toBe(2);
    expect(map.children.get(1)).toBeUndefined();
  });

  it('produces the same map as if the billing edge were absent', () => {
    const withBilling = serialize(
      buildContractHierarchyMap(CONTRACTS, [
        HIERARCHY_PARENT_EDGE,
        LOWER_ID_BILLING_EDGE,
        SIMPLE_EDGE,
      ]),
    );
    const without = serialize(
      buildContractHierarchyMap(CONTRACTS, [
        HIERARCHY_PARENT_EDGE,
        SIMPLE_EDGE,
      ]),
    );

    expect(withBilling).toEqual(without);
  });

  it('excludes any future typed edge, not just billing', () => {
    // The predicate tests `!= null`, so a type added to the DB CHECK later is
    // tree-invisible by default rather than by being remembered here.
    const map = buildContractHierarchyMap(CONTRACTS, [
      { parent_contract_id: 1, child_contract_id: 3, relationship_type: 'x' },
    ]);

    expect(map.parents.size).toBe(0);
    expect(map.children.size).toBe(0);
  });

  it('treats an absent relationship_type as a hierarchy edge', () => {
    // Every pre-existing row predates the column; callers that select a narrow
    // column list omit the field entirely.
    const map = buildContractHierarchyMap(CONTRACTS, [SIMPLE_EDGE]);

    expect(map.parents.get(2)).toBe(1);
  });
});
