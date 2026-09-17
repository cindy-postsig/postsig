import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * `fetchBillingChildrenByUserRoles` feeds the sidebar tree's billing-child
 * rows: invoices linked to a tree contract by a `'billing'` edge, rendered as
 * leaf rows under their billing parent. Edges are qualified exactly as
 * `fetchBillingParents` qualifies them (active, not disabled, `'billing'`
 * type) so the parent-side and invoice-side surfaces never disagree about
 * which links are real.
 *
 * Access control mirrors the sidebar tree's permission fail-safe: the tree
 * prunes contracts the viewer's role cannot see, so a billing child must pass
 * the same ACL or an org member could read the name and products of a
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
let relationshipsQueried = false;
let contractsQueried = false;

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

import { fetchBillingChildrenByUserRoles } from '@/data/superuser/contracts';

const PARENT_IDS = [40, 41];
const USER_METADATA = {
  userId: 'user-a',
  userRole: 3,
  organizationId: 'org-1',
} as Parameters<typeof fetchBillingChildrenByUserRoles>[0]['userMetadata'];

const PRODUCT_ROWS = [
  { vendor_products: { name: 'Custom Index' } },
  { vendor_products: { name: 'Support' } },
];

function childRow(
  parentContractId: number,
  overrides: Record<string, unknown> = {},
) {
  const child = {
    id: 45,
    status: 'active',
    contract_types: { name: 'Invoice' },
    vendor_products_details: PRODUCT_ROWS,
    ...overrides,
  };
  return { parent_contract_id: parentContractId, child };
}

function run(parentContractIds: number[] = PARENT_IDS) {
  return fetchBillingChildrenByUserRoles({
    parentContractIds,
    userMetadata: USER_METADATA,
  });
}

describe('fetchBillingChildrenByUserRoles', () => {
  beforeEach(() => {
    relationshipResult = { data: [], error: null };
    contractsResult = { data: [{ id: 45 }], error: null };
    selectStrings = {};
    eqCalls = [];
    orCalls = [];
    inCalls = [];
    relationshipsQueried = false;
    contractsQueried = false;
    extendByUserRole.mockClear();
  });

  it('maps billing-edge children to a record grouped by parent', async () => {
    relationshipResult = { data: [childRow(40)], error: null };

    const byParent = await run();

    expect(byParent).toEqual({
      40: [
        {
          id: 45,
          typeName: 'Invoice',
          productNames: ['Custom Index', 'Support'],
          isArchived: false,
        },
      ],
    });
  });

  it('qualifies edges exactly as fetchBillingParents does', async () => {
    relationshipResult = { data: [childRow(40)], error: null };

    await run();

    expect(inCalls).toContainEqual(['parent_contract_id', PARENT_IDS]);
    expect(eqCalls).toContainEqual(['relationship_type', 'billing']);
    expect(eqCalls).toContainEqual(['active', true]);
    expect(orCalls).toContainEqual('disabled.is.null,disabled.eq.false');
  });

  it('scopes to the organization through an inner child join', async () => {
    // The service client bypasses RLS and the relationship row carries no
    // organization_id, so the org filter lives on the child embed — and
    // without `!inner` PostgREST nulls non-matching embeds instead of
    // dropping rows, turning this into a cross-org read.
    relationshipResult = { data: [childRow(40)], error: null };

    await run();

    expect(selectStrings['contract_relationships']).toContain('!inner');
    expect(eqCalls).toContainEqual(['child.organization_id', 'org-1']);
  });

  it('drops a billing child the viewer role cannot access', async () => {
    relationshipResult = {
      data: [childRow(40), childRow(41, { id: 46 })],
      error: null,
    };
    contractsResult = { data: [{ id: 46 }], error: null };

    const byParent = await run();

    expect(byParent).toEqual({
      41: [
        {
          id: 46,
          typeName: 'Invoice',
          productNames: ['Custom Index', 'Support'],
          isArchived: false,
        },
      ],
    });
  });

  it('deduplicates the accessibility check when one invoice has several billing parents', async () => {
    relationshipResult = {
      data: [childRow(40), childRow(41)],
      error: null,
    };

    const byParent = await run();

    expect(inCalls).toContainEqual(['id', [45]]);
    expect(Object.keys(byParent).sort()).toEqual(['40', '41']);
  });

  it('runs the accessibility check through the canonical ACL extender', async () => {
    relationshipResult = { data: [childRow(40)], error: null };

    await run();

    const [, , userId, userRole] = extendByUserRole.mock.calls[0];
    expect(userId).toBe('user-a');
    expect(userRole).toBe(3);
  });

  it('skips all queries when there are no parent ids', async () => {
    await expect(run([])).resolves.toEqual({});

    expect(relationshipsQueried).toBe(false);
    expect(contractsQueried).toBe(false);
  });

  it('skips the accessibility query when there are no billing children', async () => {
    relationshipResult = { data: [], error: null };

    await expect(run()).resolves.toEqual({});

    expect(contractsQueried).toBe(false);
    expect(extendByUserRole).not.toHaveBeenCalled();
  });

  it('returns archived children flagged, never filtered', async () => {
    relationshipResult = {
      data: [childRow(40, { status: 'inactive' })],
      error: null,
    };

    const byParent = await run();

    expect(byParent[40]).toHaveLength(1);
    expect(byParent[40][0].isArchived).toBe(true);
  });

  it('tolerates a child with no products or type', async () => {
    relationshipResult = {
      data: [
        childRow(40, { contract_types: null, vendor_products_details: null }),
      ],
      error: null,
    };

    const byParent = await run();

    expect(byParent).toEqual({
      40: [{ id: 45, typeName: null, productNames: [], isArchived: false }],
    });
  });

  it('throws on a billing-edge query error rather than rendering silently empty rows', async () => {
    relationshipResult = { data: null, error: { message: 'boom' } };

    await expect(run()).rejects.toThrow();
  });

  it('fails closed when the accessibility check errors', async () => {
    relationshipResult = { data: [childRow(40)], error: null };
    contractsResult = { data: null, error: { message: 'boom' } };

    await expect(run()).rejects.toThrow();
  });
});
