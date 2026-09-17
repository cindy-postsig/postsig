jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const fetchAllRelationshipsForOrg = jest.fn();
jest.mock('@/data/superuser/contracts', () => ({
  fetchAllRelationshipsForOrg: () => fetchAllRelationshipsForOrg(),
}));

import {
  loadAllocationContext,
  loadAllocationContextForContract,
} from '@/lib/v2/cost-allocation/context';
import { resolveAllocations } from '@/lib/v2/cost-allocation/resolver';
import { FAKE_ORG_ID as ORG, FakeDb } from './fake-db';

type LoaderClient = Parameters<typeof loadAllocationContext>[1];

const MSA = 100;
const SIBLING_MSA = 150;
const AMENDMENT = 200;
const INVOICE = 300;
const UNRELATED = 400;
const BILLING_PARENT = 500;

let db: FakeDb;
const client = () => db.client() as LoaderClient;
const id = (row: Record<string, unknown>) => row.id as number;

const resolveOne = (
  contractId: number,
  ctx: Awaited<ReturnType<typeof loadAllocationContext>>,
) => resolveAllocations([{ id: contractId }], ctx).get(contractId);

beforeEach(() => {
  db = new FakeDb();
  fetchAllRelationshipsForOrg.mockReset();
  fetchAllRelationshipsForOrg.mockResolvedValue([]);
});

describe('loadAllocationContext', () => {
  it('reads seats only for active_users contracts and employees only where referenced', async () => {
    const research = db.seedUnit('department', 'Research');
    const onLine = db.seedEmployee('Ada Lovelace', id(research));
    const onActiveSeat = db.seedEmployee('Grace Hopper', id(research));
    const onManualSeat = db.seedEmployee('Alan Turing', id(research));
    db.seedEmployee('Nobody Referenced', id(research));
    const manual = db.seedAllocation(MSA, 'manual');
    db.seedLine(id(manual), { orgEmployeeId: id(onLine) }, 100);
    db.seedAllocation(UNRELATED, 'active_users');
    db.seedSeat(MSA, id(onManualSeat));
    db.seedSeat(UNRELATED, id(onActiveSeat));
    db.seedSeat(UNRELATED, null);

    const ctx = await loadAllocationContext(ORG, client());

    expect([...ctx.employeesById.keys()].sort()).toEqual(
      [id(onLine), id(onActiveSeat)].sort(),
    );
    expect([...ctx.seatsByContractId.keys()]).toEqual([UNRELATED]);
    expect(resolveOne(UNRELATED, ctx)?.scopes[0]).toMatchObject({
      mode: 'active_users',
      unlinkedUserCount: 1,
      lines: [{ target: { kind: 'employee', name: 'Grace Hopper' } }],
    });
  });

  it('keeps a deleted employee resolvable through its line', async () => {
    const gone = db.seedEmployee('Left Company', null);
    Object.assign(gone, { deleted_at: '2026-01-01', status: 'departed' });
    const manual = db.seedAllocation(MSA, 'manual');
    db.seedLine(id(manual), { orgEmployeeId: id(gone) }, 100);

    const ctx = await loadAllocationContext(ORG, client());

    expect(resolveOne(MSA, ctx)?.scopes[0].lines[0].target).toMatchObject({
      kind: 'employee',
      id: id(gone),
      name: 'Left Company',
    });
  });

  it('fetches the org relationships unless the caller passes them', async () => {
    const research = db.seedUnit('department', 'Research');
    const manual = db.seedAllocation(MSA, 'manual');
    db.seedLine(id(manual), { orgUnitId: id(research) }, 100);
    fetchAllRelationshipsForOrg.mockResolvedValue([
      { parent_contract_id: MSA, child_contract_id: INVOICE },
    ]);

    const fetched = await loadAllocationContext(ORG, client());
    expect(resolveOne(INVOICE, fetched)?.scopes[0].sourceContractId).toBe(MSA);

    const given = await loadAllocationContext(ORG, client(), []);
    expect(resolveOne(INVOICE, given)?.scopes).toEqual([]);
    expect(fetchAllRelationshipsForOrg).toHaveBeenCalledTimes(1);
  });
});

describe('loadAllocationContextForContract', () => {
  it('walks the ancestor chain and loads only its allocations', async () => {
    const research = db.seedUnit('department', 'Research');
    const own = db.seedAllocation(MSA, 'manual');
    db.seedLine(id(own), { orgUnitId: id(research) }, 100);
    const other = db.seedAllocation(UNRELATED, 'manual');
    db.seedLine(id(other), { orgUnitId: id(research) }, 100);
    db.seedRelationship(MSA, AMENDMENT);
    db.seedRelationship(AMENDMENT, INVOICE);

    const ctx = await loadAllocationContextForContract(ORG, INVOICE, client());

    expect([...ctx.allocationsByContractId.keys()]).toEqual([MSA]);
    expect(ctx.hierarchy.parents.get(INVOICE)).toBe(AMENDMENT);
    expect(ctx.hierarchy.parents.get(AMENDMENT)).toBe(MSA);
    expect(resolveOne(INVOICE, ctx)?.scopes[0]).toMatchObject({
      sourceContractId: MSA,
      lines: [{ target: { kind: 'org_unit', name: 'Research' } }],
    });
  });

  it('follows the lowest-numbered parent of a multi-parent child, as the org-wide map does', async () => {
    const research = db.seedUnit('department', 'Research');
    const sibling = db.seedAllocation(SIBLING_MSA, 'manual');
    db.seedLine(id(sibling), { orgUnitId: id(research) }, 100);
    db.seedRelationship(SIBLING_MSA, INVOICE);
    db.seedRelationship(MSA, INVOICE);

    const unassigned = await loadAllocationContextForContract(
      ORG,
      INVOICE,
      client(),
    );
    expect(resolveOne(INVOICE, unassigned)?.scopes).toEqual([]);

    const own = db.seedAllocation(MSA, 'manual');
    db.seedLine(id(own), { orgUnitId: id(research) }, 100);
    const assigned = await loadAllocationContextForContract(
      ORG,
      INVOICE,
      client(),
    );
    expect(resolveOne(INVOICE, assigned)?.scopes[0].sourceContractId).toBe(MSA);
  });

  it('ignores billing, disabled, inactive, and cross-org edges', async () => {
    const research = db.seedUnit('department', 'Research');
    for (const contractId of [BILLING_PARENT, MSA, AMENDMENT, UNRELATED]) {
      const allocation = db.seedAllocation(contractId, 'manual');
      db.seedLine(id(allocation), { orgUnitId: id(research) }, 100);
    }
    db.seedRelationship(BILLING_PARENT, INVOICE, {
      relationship_type: 'billing',
    });
    db.seedRelationship(MSA, INVOICE, { disabled: true });
    db.seedRelationship(AMENDMENT, INVOICE, { active: false });
    db.seedRelationship(UNRELATED, INVOICE, {
      parent_contract: { organization_id: 'other-org' },
    });

    const ctx = await loadAllocationContextForContract(ORG, INVOICE, client());

    expect(ctx.allocationsByContractId.size).toBe(0);
    expect(resolveOne(INVOICE, ctx)?.scopes).toEqual([]);
  });

  it('always carries the contract’s own seats, whatever the mode', async () => {
    const ada = db.seedEmployee('Ada Lovelace', null);
    const research = db.seedUnit('department', 'Research');
    const own = db.seedAllocation(MSA, 'manual');
    db.seedLine(id(own), { orgUnitId: id(research) }, 100);
    db.seedRelationship(MSA, INVOICE);
    db.seedSeat(INVOICE, id(ada));
    db.seedSeat(INVOICE, null);

    const ctx = await loadAllocationContextForContract(ORG, INVOICE, client());

    expect(ctx.seatsByContractId.get(INVOICE)).toHaveLength(2);
    expect(ctx.employeesById.get(id(ada))?.name).toBe('Ada Lovelace');
  });

  it('loads the seats an inherited active_users source splits over', async () => {
    const ada = db.seedEmployee('Ada Lovelace', null);
    const grace = db.seedEmployee('Grace Hopper', null);
    db.seedAllocation(MSA, 'active_users');
    db.seedRelationship(MSA, INVOICE);
    db.seedSeat(MSA, id(ada));
    db.seedSeat(MSA, id(grace));

    const ctx = await loadAllocationContextForContract(ORG, INVOICE, client());

    expect(
      resolveOne(INVOICE, ctx)?.scopes[0].lines.map((l) => l.target.name),
    ).toEqual(['Ada Lovelace', 'Grace Hopper']);
  });

  it('stops walking on a cycle and leaves the resolver to report it', async () => {
    db.seedRelationship(MSA, AMENDMENT);
    db.seedRelationship(AMENDMENT, MSA);

    const ctx = await loadAllocationContextForContract(
      ORG,
      AMENDMENT,
      client(),
    );

    expect(() => resolveOne(AMENDMENT, ctx)).toThrow('Cycle detected');
  });
});
