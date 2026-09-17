import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Task 2.2: `fetchContractHierarchy` in data/superuser/contracts.ts feeds every
 * lineage UI, so a billing edge leaking in re-roots real contracts. It resolves
 * its root from the org-wide relationship map and descends with its own query,
 * and both halves must see hierarchy edges only.
 *
 * The mocked query layer *honours* `.is('relationship_type', null)` rather than
 * just recording it: a billing edge is filtered out of the descent only when
 * that query really asks for it, so these tests fail against the unfiltered
 * code instead of passing vacuously. Root resolution gets the org's edges
 * untyped — `fetchAllRelationshipsForOrg` selects '*' — so the filtering under
 * test there is the map's.
 */

type RelationshipRow = {
  parent_contract_id?: number | null;
  child_contract_id?: number | null;
  relationship_type?: string | null;
  child_contracts?: { term_start_date: string | null } | null;
};

/** Edges keyed by the column the descent filters on, set per test. */
let edgesByParent: Map<number, RelationshipRow[]> = new Map();
/** Every edge `fetchAllRelationshipsForOrg` returns for the org, set per test. */
let orgEdges: RelationshipRow[] = [];

const CONTRACT_ROW = {
  contract_types: null,
  vendor_products_details: [],
  tos_urls: null,
};

const isUntyped = (row: RelationshipRow) => row.relationship_type == null;

/**
 * Chainable PostgREST stub. `.eq(parent_contract_id | parent_contract.
 * organization_id, v)` selects the row set; `.is('relationship_type', null)`
 * narrows it to untyped edges. Awaiting the builder resolves the filtered rows.
 */
function makeRelationshipBuilder() {
  let rows: RelationshipRow[] = [];
  let hierarchyOnly = false;
  const builder: Record<string, unknown> = {};

  const resolve = () => ({
    data: hierarchyOnly ? rows.filter(isUntyped) : rows,
    error: null,
  });

  const recordEq = (column: string, value: unknown) => {
    if (column === 'parent_contract_id') {
      rows = edgesByParent.get(value as number) ?? [];
    }
    // The org-wide fetch scopes through the parent embed and applies no type
    // filter, so it sees billing edges too.
    if (column === 'parent_contract.organization_id') rows = orgEdges;
    return builder;
  };

  const recordIs = (column: string, value: unknown) => {
    if (column === 'relationship_type' && value === null) hierarchyOnly = true;
    return builder;
  };

  Object.assign(builder, {
    select: () => builder,
    or: () => builder,
    eq: recordEq,
    is: recordIs,
    then: (fn: (v: unknown) => unknown) => fn(resolve()),
  });
  return builder;
}

/** `contracts` lookups resolve a bare row so buildHierarchy keeps descending. */
function makeContractsBuilder() {
  let contractId = 0;
  const builder: Record<string, unknown> = {};

  const recordEq = (_column: string, value: unknown) => {
    contractId = value as number;
    return builder;
  };
  const single = () =>
    Promise.resolve({ data: { ...CONTRACT_ROW, id: contractId }, error: null });

  Object.assign(builder, {
    select: () => builder,
    eq: recordEq,
    single,
    then: (fn: (v: unknown) => unknown) => fn({ data: [], error: null }),
  });
  return builder;
}

const mockSupabase = {
  from: (table: string) =>
    table === 'contract_relationships'
      ? makeRelationshipBuilder()
      : makeContractsBuilder(),
};

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => mockSupabase,
}));

jest.mock('next/cache', () => ({
  unstable_noStore: () => undefined,
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

import { fetchContractHierarchy } from '@/data/superuser/contracts';

const ORG_ID = 'org-1';
const INVOICE = 300;
const HIERARCHY_PARENT = 200;
const BILLING_PARENT = 100;
const GRANDPARENT = 50;
const SIBLING_CHILD = 400;

const orgEdge = (
  parent: number,
  child: number,
  relationshipType: string | null = null,
): RelationshipRow => ({
  parent_contract_id: parent,
  child_contract_id: child,
  relationship_type: relationshipType,
});
const childEdge = (child: number): RelationshipRow => ({
  child_contract_id: child,
  relationship_type: null,
  child_contracts: null,
});
const billingChildEdge = (child: number): RelationshipRow => ({
  child_contract_id: child,
  relationship_type: 'billing',
  child_contracts: null,
});

function resetStubs() {
  edgesByParent = new Map();
  orgEdges = [];
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
}

function childIds(node: { children?: Array<{ id: number }> } | null) {
  return (node?.children ?? []).map((child) => child.id);
}

describe('fetchContractHierarchy builds from hierarchy edges only', () => {
  beforeEach(resetStubs);

  it('does not graft a billing-linked invoice into the tree', async () => {
    // The descent is parent -> child, so the billing edge appears as a child of
    // the SO. Unfiltered, the invoice shows up under an SO it only shares line
    // items with.
    edgesByParent.set(HIERARCHY_PARENT, [
      childEdge(SIBLING_CHILD),
      billingChildEdge(INVOICE),
    ]);

    const { completeHierarchy } = await fetchContractHierarchy(
      HIERARCHY_PARENT,
      ORG_ID,
    );

    expect(childIds(completeHierarchy)).toEqual([SIBLING_CHILD]);
  });

  it('produces the same tree as if the billing edge were absent', async () => {
    edgesByParent.set(HIERARCHY_PARENT, [childEdge(SIBLING_CHILD)]);
    const without = await fetchContractHierarchy(HIERARCHY_PARENT, ORG_ID);

    edgesByParent.set(HIERARCHY_PARENT, [
      childEdge(SIBLING_CHILD),
      billingChildEdge(INVOICE),
    ]);
    const withBilling = await fetchContractHierarchy(HIERARCHY_PARENT, ORG_ID);

    expect(JSON.stringify(withBilling)).toEqual(JSON.stringify(without));
  });

  it('treats an absent relationship_type as a hierarchy edge', async () => {
    edgesByParent.set(HIERARCHY_PARENT, [
      { child_contract_id: SIBLING_CHILD, child_contracts: null },
    ]);

    const { completeHierarchy } = await fetchContractHierarchy(
      HIERARCHY_PARENT,
      ORG_ID,
    );

    expect(childIds(completeHierarchy)).toEqual([SIBLING_CHILD]);
  });
});

describe('fetchContractHierarchy roots on hierarchy edges only', () => {
  beforeEach(resetStubs);

  it('climbs to the hierarchy ancestor and ignores a billing parent', async () => {
    orgEdges = [
      orgEdge(BILLING_PARENT, HIERARCHY_PARENT, 'billing'),
      orgEdge(GRANDPARENT, HIERARCHY_PARENT),
    ];
    edgesByParent.set(GRANDPARENT, [childEdge(HIERARCHY_PARENT)]);

    const { completeHierarchy } = await fetchContractHierarchy(
      HIERARCHY_PARENT,
      ORG_ID,
    );

    expect(completeHierarchy?.id).toBe(GRANDPARENT);
    expect(childIds(completeHierarchy)).toEqual([HIERARCHY_PARENT]);
  });

  it('roots on the contract itself when its only parent edge is a billing edge', async () => {
    orgEdges = [orgEdge(BILLING_PARENT, INVOICE, 'billing')];

    const { completeHierarchy } = await fetchContractHierarchy(INVOICE, ORG_ID);

    expect(completeHierarchy?.id).toBe(INVOICE);
  });
});
