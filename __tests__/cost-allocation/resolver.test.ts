jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import {
  isFullyUnallocated,
  loadAllocationContext,
  resolveAllocations,
  type ResolvedScope,
} from '@/lib/v2/cost-allocation';
import type { ContractRelationship } from '@/lib/inventory/hierarchyUtils';
import { FAKE_ORG_ID as ORG, FakeDb } from './fake-db';

type LoaderClient = Parameters<typeof loadAllocationContext>[1];

const ROOT = 100;
const SECOND_PARENT = 150;
const AMENDMENT = 200;
const INVOICE = 300;
const REPLACEMENT = 400;

let db: FakeDb;

beforeEach(() => {
  db = new FakeDb();
});

const loadCtx = (relationships: ContractRelationship[] = []) =>
  loadAllocationContext(ORG, db.client() as LoaderClient, relationships);

const edge = (
  parent: number,
  child: number,
  type: string | null = null,
): ContractRelationship => ({
  parent_contract_id: parent,
  child_contract_id: child,
  relationship_type: type,
});

const resolveOne = async (
  contractId: number,
  relationships: ContractRelationship[] = [],
) => {
  const resolved = resolveAllocations(
    [{ id: contractId }],
    await loadCtx(relationships),
  );
  const allocation = resolved.get(contractId);
  if (!allocation) throw new Error(`contract ${contractId} not resolved`);
  return allocation;
};

const unitTargets = (scope: ResolvedScope) =>
  scope.lines.map((line) => ({ id: line.target.id, percent: line.percent }));

describe('loadAllocationContext', () => {
  it('fails loudly on an org unit level the tree does not know', async () => {
    db.seedUnit('squad', 'Growth');

    await expect(loadCtx()).rejects.toThrow('Unknown org unit level "squad"');
  });
});

describe('resolveAllocations precedence', () => {
  it('resolves a contract from its own manual lines', async () => {
    const unit = db.seedUnit('department', 'Research');
    const allocation = db.seedAllocation(ROOT, 'manual');
    db.seedLine(allocation.id as number, { orgUnitId: unit.id as number }, 100);

    const { scopes } = await resolveOne(ROOT);

    expect(scopes).toHaveLength(1);
    expect(scopes[0]).toMatchObject({
      productId: null,
      mode: 'manual',
      sourceContractId: ROOT,
      unlinkedUserCount: 0,
    });
    expect(scopes[0].lines).toEqual([
      {
        target: { kind: 'org_unit', id: unit.id, name: 'Research' },
        percent: 100,
      },
    ]);
  });

  it('own row beats an allocated ancestor', async () => {
    const parentUnit = db.seedUnit('department', 'Ops');
    const ownUnit = db.seedUnit('department', 'Research');
    const parentAllocation = db.seedAllocation(ROOT, 'manual');
    db.seedLine(
      parentAllocation.id as number,
      { orgUnitId: parentUnit.id as number },
      100,
    );
    const ownAllocation = db.seedAllocation(AMENDMENT, 'manual');
    db.seedLine(
      ownAllocation.id as number,
      { orgUnitId: ownUnit.id as number },
      100,
    );

    const { scopes } = await resolveOne(AMENDMENT, [edge(ROOT, AMENDMENT)]);

    expect(scopes[0].sourceContractId).toBe(AMENDMENT);
    expect(unitTargets(scopes[0])).toEqual([{ id: ownUnit.id, percent: 100 }]);
  });

  it("an invoice takes the nearest allocated ancestor: a middle amendment's override, not the root", async () => {
    const rootUnit = db.seedUnit('department', 'Ops');
    const amendmentUnit = db.seedUnit('department', 'Research');
    const rootAllocation = db.seedAllocation(ROOT, 'manual');
    db.seedLine(
      rootAllocation.id as number,
      { orgUnitId: rootUnit.id as number },
      100,
    );
    const amendmentAllocation = db.seedAllocation(AMENDMENT, 'manual');
    db.seedLine(
      amendmentAllocation.id as number,
      { orgUnitId: amendmentUnit.id as number },
      100,
    );

    const { scopes } = await resolveOne(INVOICE, [
      edge(ROOT, AMENDMENT),
      edge(AMENDMENT, INVOICE),
    ]);

    expect(scopes[0].sourceContractId).toBe(AMENDMENT);
    expect(unitTargets(scopes[0])).toEqual([
      { id: amendmentUnit.id, percent: 100 },
    ]);
  });

  it('walks past an unallocated middle record to the root allocation', async () => {
    const rootUnit = db.seedUnit('department', 'Ops');
    const rootAllocation = db.seedAllocation(ROOT, 'manual');
    db.seedLine(
      rootAllocation.id as number,
      { orgUnitId: rootUnit.id as number },
      100,
    );

    const { scopes } = await resolveOne(INVOICE, [
      edge(ROOT, AMENDMENT),
      edge(AMENDMENT, INVOICE),
    ]);

    expect(scopes[0].sourceContractId).toBe(ROOT);
  });

  it('never inherits through a billing edge', async () => {
    const unit = db.seedUnit('department', 'Ops');
    const allocation = db.seedAllocation(ROOT, 'manual');
    db.seedLine(allocation.id as number, { orgUnitId: unit.id as number }, 100);

    const { scopes } = await resolveOne(INVOICE, [
      edge(ROOT, INVOICE, 'billing'),
    ]);

    expect(scopes).toEqual([]);
  });

  it('a billing parent never shadows the hierarchy parent', async () => {
    const billingUnit = db.seedUnit('department', 'Ops');
    const hierarchyUnit = db.seedUnit('department', 'Research');
    const billingAllocation = db.seedAllocation(ROOT, 'manual');
    db.seedLine(
      billingAllocation.id as number,
      { orgUnitId: billingUnit.id as number },
      100,
    );
    const hierarchyAllocation = db.seedAllocation(AMENDMENT, 'manual');
    db.seedLine(
      hierarchyAllocation.id as number,
      { orgUnitId: hierarchyUnit.id as number },
      100,
    );

    // The billing parent has the lower contract id; only the hierarchy edge counts.
    const { scopes } = await resolveOne(INVOICE, [
      edge(ROOT, INVOICE, 'billing'),
      edge(AMENDMENT, INVOICE),
    ]);

    expect(scopes[0].sourceContractId).toBe(AMENDMENT);
  });

  it('a multi-parent child takes the lowest-numbered parent regardless of edge order', async () => {
    const lowUnit = db.seedUnit('department', 'Ops');
    const highUnit = db.seedUnit('department', 'Research');
    const lowAllocation = db.seedAllocation(ROOT, 'manual');
    db.seedLine(
      lowAllocation.id as number,
      { orgUnitId: lowUnit.id as number },
      100,
    );
    const highAllocation = db.seedAllocation(SECOND_PARENT, 'manual');
    db.seedLine(
      highAllocation.id as number,
      { orgUnitId: highUnit.id as number },
      100,
    );

    const { scopes } = await resolveOne(INVOICE, [
      edge(SECOND_PARENT, INVOICE),
      edge(ROOT, INVOICE),
    ]);

    expect(scopes[0].sourceContractId).toBe(ROOT);
    expect(unitTargets(scopes[0])).toEqual([{ id: lowUnit.id, percent: 100 }]);
  });

  it('inherits product-scoped allocations by vendor_products id', async () => {
    const unitA = db.seedUnit('department', 'Ops');
    const unitB = db.seedUnit('department', 'Research');
    const productA = db.seedAllocation(ROOT, 'manual', 7);
    db.seedLine(productA.id as number, { orgUnitId: unitA.id as number }, 100);
    const productB = db.seedAllocation(ROOT, 'manual', 8);
    db.seedLine(productB.id as number, { orgUnitId: unitB.id as number }, 100);

    const { scopes } = await resolveOne(INVOICE, [edge(ROOT, INVOICE)]);

    expect(
      scopes.map((scope) => ({
        productId: scope.productId,
        sourceContractId: scope.sourceContractId,
        targets: unitTargets(scope),
      })),
    ).toEqual([
      {
        productId: 7,
        sourceContractId: ROOT,
        targets: [{ id: unitA.id, percent: 100 }],
      },
      {
        productId: 8,
        sourceContractId: ROOT,
        targets: [{ id: unitB.id, percent: 100 }],
      },
    ]);
  });

  it('a contract replaced through lineage events has no edge and stays unassigned', async () => {
    const unit = db.seedUnit('department', 'Ops');
    const allocation = db.seedAllocation(ROOT, 'manual');
    db.seedLine(allocation.id as number, { orgUnitId: unit.id as number }, 100);

    // contract_lineage_events record replacements without relationship edges.
    const { scopes } = await resolveOne(REPLACEMENT, [edge(ROOT, AMENDMENT)]);

    expect(scopes).toEqual([]);
  });
});

describe('resolveAllocations active_users mode', () => {
  it('splits equally over current linked seats, resolving employee refs', async () => {
    const unit = db.seedUnit('team', 'Risk Arb');
    const alice = db.seedEmployee('Alice Aachen', unit.id as number);
    const bob = db.seedEmployee('Bob Berlin');
    db.seedAllocation(ROOT, 'active_users');
    db.seedSeat(ROOT, alice.id as number);
    db.seedSeat(ROOT, bob.id as number);

    const { scopes } = await resolveOne(ROOT);

    expect(scopes[0].mode).toBe('active_users');
    expect(scopes[0].unlinkedUserCount).toBe(0);
    expect(scopes[0].lines).toEqual([
      {
        target: {
          kind: 'employee',
          id: alice.id,
          name: 'Alice Aachen',
          orgUnitId: unit.id,
          costCenterUnitId: null,
        },
        percent: 50,
      },
      {
        target: {
          kind: 'employee',
          id: bob.id,
          name: 'Bob Berlin',
          orgUnitId: null,
          costCenterUnitId: null,
        },
        percent: 50,
      },
    ]);
  });

  it('scopes the split per product when the allocation is product-scoped', async () => {
    const alice = db.seedEmployee('Alice Aachen');
    const bob = db.seedEmployee('Bob Berlin');
    const cara = db.seedEmployee('Cara Cork');
    db.seedAllocation(ROOT, 'active_users', 7);
    db.seedAllocation(ROOT, 'active_users', 8);
    db.seedSeat(ROOT, alice.id as number, 7);
    db.seedSeat(ROOT, bob.id as number, 7);
    db.seedSeat(ROOT, cara.id as number, 8);

    const { scopes } = await resolveOne(ROOT);

    const byProduct = new Map(scopes.map((scope) => [scope.productId, scope]));
    expect(
      byProduct.get(7)?.lines.map((line) => [line.target.id, line.percent]),
    ).toEqual([
      [alice.id, 50],
      [bob.id, 50],
    ]);
    expect(
      byProduct.get(8)?.lines.map((line) => [line.target.id, line.percent]),
    ).toEqual([[cara.id, 100]]);
  });

  it('excludes unlinked and released seats, surfacing the unlinked count', async () => {
    const alice = db.seedEmployee('Alice Aachen');
    const bob = db.seedEmployee('Bob Berlin');
    db.seedAllocation(ROOT, 'active_users');
    db.seedSeat(ROOT, alice.id as number);
    db.seedSeat(ROOT, null);
    db.seedSeat(ROOT, null);
    db.seedSeat(ROOT, bob.id as number, null, '2026-08-01');

    const { scopes } = await resolveOne(ROOT);

    expect(scopes[0].unlinkedUserCount).toBe(2);
    expect(scopes[0].lines).toHaveLength(1);
    expect(scopes[0].lines[0]).toMatchObject({
      target: { id: alice.id },
      percent: 100,
    });
  });

  it('excludes seat holders who are no longer active employees', async () => {
    // Departure does not release a seat, so `released_at is null` alone would
    // keep splitting the contract's cost onto people who have left. Only
    // status 'active' counts, the rule the picker offers targets by.
    const alice = db.seedEmployee('Alice Aachen');
    const departed = db.seedEmployee('Cy Departed', null, null, {
      status: 'inactive',
    });
    const onLeave = db.seedEmployee('Dee OnLeave', null, null, {
      status: 'on_leave',
    });
    const deleted = db.seedEmployee('Eve Deleted', null, null, {
      deleted_at: '2026-08-01',
    });
    db.seedAllocation(ROOT, 'active_users');
    for (const employee of [alice, departed, onLeave, deleted]) {
      db.seedSeat(ROOT, employee.id as number);
    }

    const { scopes } = await resolveOne(ROOT);

    expect(scopes[0].lines).toEqual([
      expect.objectContaining({
        target: expect.objectContaining({ id: alice.id }),
        percent: 100,
      }),
    ]);
    // Not unlinked — those seats carry an employee, they just are not active.
    expect(scopes[0].unlinkedUserCount).toBe(0);
  });

  it('resolves to no lines when every seat holder has left, routing to unassigned', async () => {
    const departed = db.seedEmployee('Cy Departed', null, null, {
      status: 'inactive',
    });
    db.seedAllocation(ROOT, 'active_users');
    db.seedSeat(ROOT, departed.id as number);

    const { scopes } = await resolveOne(ROOT);

    expect(scopes[0].lines).toEqual([]);
  });

  it('resolves to no lines when no linked seats remain, routing to unassigned', async () => {
    db.seedAllocation(ROOT, 'active_users');
    db.seedSeat(ROOT, null);

    const { scopes } = await resolveOne(ROOT);

    expect(scopes[0].lines).toEqual([]);
    expect(scopes[0].unlinkedUserCount).toBe(1);
  });

  it("an inherited active_users allocation splits over the source contract's seats", async () => {
    const alice = db.seedEmployee('Alice Aachen');
    const bob = db.seedEmployee('Bob Berlin');
    db.seedAllocation(ROOT, 'active_users');
    db.seedSeat(ROOT, alice.id as number);
    db.seedSeat(ROOT, bob.id as number);

    const { scopes } = await resolveOne(INVOICE, [edge(ROOT, INVOICE)]);

    expect(scopes[0]).toMatchObject({
      mode: 'active_users',
      sourceContractId: ROOT,
    });
    expect(
      scopes[0].lines.map((line) => [line.target.id, line.percent]),
    ).toEqual([
      [alice.id, 50],
      [bob.id, 50],
    ]);
  });
});

describe('isFullyUnallocated', () => {
  it('is true for a contract the resolver never reached, and for one with no scopes', async () => {
    expect(isFullyUnallocated(undefined)).toBe(true);
    expect(isFullyUnallocated(await resolveOne(ROOT))).toBe(true);
  });

  it('is false once a whole-contract scope resolves a line', async () => {
    const unit = db.seedUnit('department', 'Research');
    const allocation = db.seedAllocation(ROOT, 'manual');
    db.seedLine(allocation.id as number, { orgUnitId: unit.id as number }, 100);

    expect(isFullyUnallocated(await resolveOne(ROOT))).toBe(false);
  });

  it('is true for an active_users whole-contract scope with no seat left to split over', async () => {
    // The scope exists, so `scopes.length === 0` would call this allocated;
    // the engine hands its empty line list to allocationShares, which merges
    // nothing and books the whole contract to `unassigned`.
    const departed = db.seedEmployee('Cy Departed', null, null, {
      status: 'inactive',
    });
    db.seedAllocation(ROOT, 'active_users');
    db.seedSeat(ROOT, departed.id as number);

    const resolved = await resolveOne(ROOT);
    expect(resolved.scopes).toHaveLength(1);
    expect(isFullyUnallocated(resolved)).toBe(true);
  });

  it('is true for product scopes only when not one of them resolved a line', async () => {
    const unit = db.seedUnit('department', 'Research');
    db.seedAllocation(ROOT, 'active_users', 7);
    db.seedAllocation(ROOT, 'active_users', 8);

    expect(isFullyUnallocated(await resolveOne(ROOT))).toBe(true);

    const allocated = db.seedAllocation(ROOT, 'manual', 9);
    db.seedLine(allocated.id as number, { orgUnitId: unit.id as number }, 100);

    // Products 7 and 8 still book to `unassigned`, but 9's spend reaches a
    // target: the contract is no longer fully unallocated.
    expect(isFullyUnallocated(await resolveOne(ROOT))).toBe(false);
  });

  it('is true when an empty whole-contract scope shadows an allocated product scope', async () => {
    // The engine prefers a whole-contract scope outright (spend/pipeline.ts,
    // `if (whole || scopes.length === 0)`), so product 7's line never books:
    // every cent still lands in `unassigned`.
    const unit = db.seedUnit('department', 'Research');
    db.seedAllocation(ROOT, 'active_users');
    const product = db.seedAllocation(ROOT, 'manual', 7);
    db.seedLine(product.id as number, { orgUnitId: unit.id as number }, 100);

    const resolved = await resolveOne(ROOT);
    expect(resolved.scopes).toHaveLength(2);
    expect(
      resolved.scopes.find((scope) => scope.productId === 7)?.lines,
    ).toEqual([
      {
        target: { kind: 'org_unit', id: unit.id, name: 'Research' },
        percent: 100,
      },
    ]);
    expect(isFullyUnallocated(resolved)).toBe(true);
  });

  it('counts a line that lands nowhere above its level: the rule is lines, not shares', async () => {
    // Bob sits outside the org tree, so rollupToLevel routes him to
    // `unassigned` in the Departments view — yet the Users view names him, so
    // the contract is allocated.
    const bob = db.seedEmployee('Bob Berlin');
    db.seedAllocation(ROOT, 'active_users');
    db.seedSeat(ROOT, bob.id as number);

    const resolved = await resolveOne(ROOT);
    expect(resolved.scopes[0].lines[0].target).toMatchObject({
      kind: 'employee',
      orgUnitId: null,
    });
    expect(isFullyUnallocated(resolved)).toBe(false);
  });

  it('is false for a child inheriting an allocated ancestor', async () => {
    const unit = db.seedUnit('department', 'Research');
    const allocation = db.seedAllocation(ROOT, 'manual');
    db.seedLine(allocation.id as number, { orgUnitId: unit.id as number }, 100);

    expect(
      isFullyUnallocated(await resolveOne(INVOICE, [edge(ROOT, INVOICE)])),
    ).toBe(false);
  });
});
