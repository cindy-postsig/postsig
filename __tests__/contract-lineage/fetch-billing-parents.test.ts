import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * `fetchBillingParentsByUserRoles` feeds the sidebar's "Also billed under"
 * section: the *additional* payers of an invoice, qualified exactly as the
 * discrepancy report qualifies them (active, not disabled) so the two
 * surfaces never disagree about which parents are real. Archived parents are
 * returned, not filtered — the report still counts their products, so hiding
 * them here would contradict it.
 *
 * Access control mirrors the sidebar tree's permission fail-safe: the tree
 * prunes contracts the viewer's role cannot see, so a billing parent must
 * pass the same ACL or an org member could read the name and products of a
 * contract the tree deliberately hides.
 */

const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

jest.mock('@/utils/pino', () => ({ __esModule: true, default: mockLogger }));

/** Rows the billing-edge query resolves with. Set per test. */
let relationshipResult: { data: unknown[] | null; error: unknown } = {
  data: [],
  error: null,
};
/** Rows the ACL accessibility query resolves with. Set per test. */
let contractsResult: { data: unknown[] | null; error: unknown } = {
  data: [],
  error: null,
};

/** Filters applied per table, captured for assertion. */
let selectStrings: Record<string, string> = {};
let eqCalls: Array<[string, unknown]> = [];
let orCalls: string[] = [];
let inCalls: Array<[string, unknown]> = [];
let contractsQueried = false;
let relationshipsQueried = false;

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const result = () =>
    table === 'contracts' ? contractsResult : relationshipResult;
  if (table === 'contracts') contractsQueried = true;
  if (table === 'contract_relationships') relationshipsQueried = true;

  Object.assign(builder, {
    select: (s: string) => {
      selectStrings[table] = s;
      return builder;
    },
    eq: (column: string, value: unknown) => {
      eqCalls.push([column, value]);
      return builder;
    },
    or: (clause: string) => {
      orCalls.push(clause);
      return builder;
    },
    in: (column: string, value: unknown) => {
      inCalls.push([column, value]);
      return builder;
    },
    then: (fn: (v: unknown) => unknown) => fn(result()),
  });
  return builder;
}

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({ from: (table: string) => makeBuilder(table) }),
}));

jest.mock('@/data/users', () => ({
  getAllOrgUsers: jest.fn(async () => ['user-a']),
  getUserMetadata: jest.fn(async () => null),
  getUserProfile: jest.fn(async () => null),
}));

/** Pass-through ACL extender; invocations captured to pin the role wiring. */
const extendByUserRole = jest.fn(
  async (
    _supabase: unknown,
    query: unknown,
    _userId: unknown,
    _userRole: unknown,
  ) => query,
);

jest.mock('@/data/utils', () => ({
  extendSupabaseQueryByUserRole: extendByUserRole,
}));

import {
  fetchBillingParentsByUserRoles,
  fetchBillingParentsForContractsByUserRoles,
} from '@/data/superuser/contracts';

const INVOICE_ID = 300;
const USER_METADATA = {
  userId: 'user-a',
  userRole: 3,
  organizationId: 'org-1',
} as Parameters<typeof fetchBillingParentsByUserRoles>[0]['userMetadata'];

const PRODUCT_ROWS = [
  { vendor_products: { name: 'Analytics Platform' } },
  { vendor_products: { name: 'Support' } },
];

function parentRow(overrides: Record<string, unknown> = {}) {
  const parent = {
    id: 20,
    status: 'active',
    contract_types: { name: 'ServiceOrder' },
    vendor_products_details: PRODUCT_ROWS,
    ...overrides,
  };
  return { parent };
}

function run() {
  return fetchBillingParentsByUserRoles({
    childContractId: INVOICE_ID,
    userMetadata: USER_METADATA,
  });
}

describe('fetchBillingParentsByUserRoles', () => {
  beforeEach(() => {
    relationshipResult = { data: [], error: null };
    contractsResult = { data: [{ id: 20 }], error: null };
    selectStrings = {};
    eqCalls = [];
    orCalls = [];
    inCalls = [];
    contractsQueried = false;
    relationshipsQueried = false;
    extendByUserRole.mockClear();
  });

  it('maps billing-edge parents to plain serializable rows', async () => {
    relationshipResult = { data: [parentRow()], error: null };

    const parents = await run();

    expect(parents).toEqual([
      {
        id: 20,
        typeName: 'ServiceOrder',
        productNames: ['Analytics Platform', 'Support'],
        isArchived: false,
      },
    ]);
  });

  it('qualifies edges exactly as the discrepancy report does', async () => {
    relationshipResult = { data: [parentRow()], error: null };

    await run();

    expect(eqCalls).toContainEqual(['child_contract_id', INVOICE_ID]);
    expect(eqCalls).toContainEqual(['relationship_type', 'billing']);
    expect(eqCalls).toContainEqual(['active', true]);
    expect(orCalls).toContainEqual('disabled.is.null,disabled.eq.false');
  });

  it('scopes to the organization through an inner parent join', async () => {
    // The service client bypasses RLS and the relationship row carries no
    // organization_id, so the org filter lives on the parent embed — and
    // without `!inner` PostgREST nulls non-matching embeds instead of
    // dropping rows, turning this into a cross-org read.
    relationshipResult = { data: [parentRow()], error: null };

    await run();

    expect(selectStrings['contract_relationships']).toContain('!inner');
    expect(eqCalls).toContainEqual(['parent.organization_id', 'org-1']);
  });

  it('drops a billing parent the viewer role cannot access', async () => {
    // The tree prunes inaccessible contracts (filterHierarchyByAccessible-
    // Contracts); a billing parent must not leak what the tree hides.
    relationshipResult = {
      data: [parentRow(), parentRow({ id: 21 })],
      error: null,
    };
    contractsResult = { data: [{ id: 21 }], error: null };

    const parents = await run();

    expect(parents.map((p) => p.id)).toEqual([21]);
  });

  it('runs the accessibility check through the canonical ACL extender', async () => {
    relationshipResult = { data: [parentRow()], error: null };

    await run();

    expect(inCalls).toContainEqual(['id', [20]]);
    const [, , userId, userRole] = extendByUserRole.mock.calls[0];
    expect(userId).toBe('user-a');
    expect(userRole).toBe(3);
  });

  it('skips the accessibility query when there are no billing parents', async () => {
    relationshipResult = { data: [], error: null };

    await expect(run()).resolves.toEqual([]);

    expect(contractsQueried).toBe(false);
    expect(extendByUserRole).not.toHaveBeenCalled();
  });

  it('returns archived parents flagged, never filtered', async () => {
    relationshipResult = {
      data: [parentRow({ status: 'inactive' })],
      error: null,
    };

    const parents = await run();

    expect(parents).toHaveLength(1);
    expect(parents[0].isArchived).toBe(true);
  });

  it('tolerates a parent with no products or type', async () => {
    relationshipResult = {
      data: [
        parentRow({ contract_types: null, vendor_products_details: null }),
      ],
      error: null,
    };

    const parents = await run();

    expect(parents).toEqual([
      { id: 20, typeName: null, productNames: [], isArchived: false },
    ]);
  });

  it('throws on a billing-edge query error rather than rendering a silently empty section', async () => {
    relationshipResult = { data: null, error: { message: 'boom' } };

    await expect(run()).rejects.toThrow();
  });

  it('fails closed when the accessibility check errors', async () => {
    // An ACL check that errored proves nothing about access; showing the
    // parents anyway would leak on exactly the failure path.
    relationshipResult = { data: [parentRow()], error: null };
    contractsResult = { data: null, error: { message: 'boom' } };

    await expect(run()).rejects.toThrow();
  });
});

// The batched variant behind the lineage graph: one edge query + one ACL
// check for a whole chain's invoices, instead of two queries per invoice.
function batchRow(childContractId: number, parentId = 20) {
  return { child_contract_id: childContractId, ...parentRow({ id: parentId }) };
}

function runBatch(childContractIds: number[] = [300, 301]) {
  return fetchBillingParentsForContractsByUserRoles({
    childContractIds,
    userMetadata: USER_METADATA,
  });
}

const twoParentRows = [batchRow(300), batchRow(301, 21)];
const sharedParentRows = [batchRow(300), batchRow(301)];
const bothAccessible = [{ id: 20 }, { id: 21 }];
const onlyId21Accessible = [{ id: 21 }];

describe('fetchBillingParentsForContractsByUserRoles', () => {
  beforeEach(() => {
    relationshipResult = { data: [], error: null };
    contractsResult = { data: bothAccessible, error: null };
    selectStrings = {};
    eqCalls = [];
    orCalls = [];
    inCalls = [];
    contractsQueried = false;
    relationshipsQueried = false;
    extendByUserRole.mockClear();
  });

  it('groups billing parents by invoice in one query', async () => {
    relationshipResult = { data: twoParentRows, error: null };
    contractsResult = { data: bothAccessible, error: null };

    const byInvoice = await runBatch();

    expect(inCalls).toContainEqual(['child_contract_id', [300, 301]]);
    expect(Object.keys(byInvoice).sort()).toEqual(['300', '301']);
    expect(byInvoice[300][0].id).toBe(20);
    expect(byInvoice[301][0].id).toBe(21);
  });

  it('scopes to the organization through an inner parent join', async () => {
    relationshipResult = { data: [batchRow(300)], error: null };

    await runBatch();

    expect(selectStrings['contract_relationships']).toContain('!inner');
    expect(eqCalls).toContainEqual(['parent.organization_id', 'org-1']);
    expect(eqCalls).toContainEqual(['relationship_type', 'billing']);
    expect(eqCalls).toContainEqual(['active', true]);
    expect(orCalls).toContainEqual('disabled.is.null,disabled.eq.false');
  });

  it('drops parents the viewer role cannot access', async () => {
    relationshipResult = { data: twoParentRows, error: null };
    contractsResult = { data: onlyId21Accessible, error: null };

    const byInvoice = await runBatch();

    expect(Object.keys(byInvoice)).toEqual(['301']);
  });

  it('checks accessibility once for a parent paying several invoices', async () => {
    relationshipResult = { data: sharedParentRows, error: null };

    await runBatch();

    expect(inCalls).toContainEqual(['id', [20]]);
  });

  it('skips all queries when there are no invoice ids', async () => {
    await expect(runBatch([])).resolves.toEqual({});

    expect(relationshipsQueried).toBe(false);
    expect(contractsQueried).toBe(false);
    expect(extendByUserRole).not.toHaveBeenCalled();
  });
});
