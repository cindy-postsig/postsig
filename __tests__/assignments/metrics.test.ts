import {
  computeScopeMetrics,
  seatsInScope,
} from '@/lib/v2/assignments/metrics';
import { descendantIds } from '@/lib/v2/assignments/scope';
import type {
  AssignmentNode,
  AssignmentSeat,
  AssignmentUser,
  AssignmentsPayload,
} from '@/lib/v2/assignments/types';
import { FIRMWIDE } from '@/lib/v2/assignments/types';

function node(
  id: number,
  parentId: number | null,
  childIds: number[],
  memberIds: number[],
): AssignmentNode {
  return {
    id,
    name: `N${id}`,
    level: 'department',
    levelLabel: 'Department',
    parentId,
    childIds,
    memberIds,
    headcount: 0,
  };
}

function user(
  id: number,
  orgUnitId: number | null,
  over: Partial<AssignmentUser> = {},
): AssignmentUser {
  return {
    id,
    name: `U${id}`,
    email: null,
    employeeId: null,
    orgUnitId,
    status: 'active',
    costCenter: null,
    region: null,
    country: null,
    seatIds: [],
    monthlyCost: 0,
    ...over,
  };
}

function seat(
  id: number,
  orgEmployeeId: number | null,
  over: Partial<AssignmentSeat> = {},
): AssignmentSeat {
  return {
    id,
    contractId: 100,
    productId: 200,
    productName: 'Terminal',
    vendorId: 1,
    vendorName: 'Bloomberg',
    deliveryMethods: [],
    orgEmployeeId,
    holderName: `U${orgEmployeeId ?? 'x'}`,
    assignedDate: null,
    inactiveReasons: [],
    underused: false,
    monthlyCost: 0,
    ...over,
  };
}

function payloadOf(over: Partial<AssignmentsPayload>): AssignmentsPayload {
  return {
    window: { month: '2026-04', label: 'April 2026' },
    nodes: {},
    rootIds: [],
    users: {},
    seats: {},
    productDetails: {},
    empty: false,
    ...over,
  };
}

describe('computeScopeMetrics', () => {
  const base = payloadOf({
    nodes: {
      1: node(1, null, [2], [10]),
      2: node(2, 1, [], [11, 12]),
    },
    rootIds: [1],
    users: {
      10: user(10, 1, { seatIds: [1000], monthlyCost: 40 }),
      11: user(11, 2, { seatIds: [1001, 1002], monthlyCost: 60 }),
      12: user(12, 2),
      13: user(13, null),
    },
    seats: {
      1000: seat(1000, 10),
      1001: seat(1001, 11),
      1002: seat(1002, 11, { vendorId: 2, vendorName: 'LSEG' }),
    },
  });

  it('counts the seven figures for a node', () => {
    expect(computeScopeMetrics(base, 2)).toMatchObject({
      peopleInScope: 2,
      assignedUsers: 1,
      unassigned: 1,
      assignments: 2,
      monthlyCost: 60,
      underusedLicences: 0,
      vendorsInScope: 2,
    });
  });

  it('counts everyone at Firmwide, including people outside the tree', () => {
    const metrics = computeScopeMetrics(base, FIRMWIDE);
    expect(metrics.peopleInScope).toBe(4);
    expect(metrics.assignments).toBe(3);
    expect(metrics.monthlyCost).toBe(100);
  });

  it('leaves a departed holder out of headcount but counts their seat as underused', () => {
    const payload = payloadOf({
      ...base,
      users: {
        ...base.users,
        12: user(12, 2, { status: 'inactive', seatIds: [1003] }),
      },
      seats: { ...base.seats, 1003: seat(1003, 12, { underused: true }) },
    });
    const metrics = computeScopeMetrics(payload, 2);
    expect(metrics.peopleInScope).toBe(1);
    expect(metrics.underusedLicences).toBe(1);
    expect(metrics.assignments).toBe(3);
  });

  it('counts unlinked seats at Firmwide only, so no node total double-counts them', () => {
    const payload = payloadOf({
      ...base,
      seats: { ...base.seats, 1004: seat(1004, null, { underused: true }) },
    });
    expect(computeScopeMetrics(payload, FIRMWIDE).unlinkedSeats).toBe(1);
    expect(computeScopeMetrics(payload, FIRMWIDE).assignments).toBe(4);
    expect(computeScopeMetrics(payload, 1).unlinkedSeats).toBe(0);
    expect(computeScopeMetrics(payload, 1).assignments).toBe(3);
  });

  it('costs only what the people in scope carry, not the scope’s whole spend', () => {
    // Money allocated to the unit itself, to a cost centre, or sitting in a
    // contract with nothing allocated funds no seat and has no place here.
    expect(computeScopeMetrics(base, 2).monthlyCost).toBe(60);
    expect(computeScopeMetrics(base, FIRMWIDE).monthlyCost).toBe(100);
  });
});

describe('seatsInScope', () => {
  it('is empty for a scope nobody is in', () => {
    const payload = payloadOf({ nodes: { 9: node(9, null, [], []) } });
    expect(seatsInScope(payload, 9)).toEqual([]);
  });
});

describe('the rollup invariant', () => {
  // A seeded tree, so a failure is reproducible. Mirrors the invariant block
  // in the Cost Allocation Summary's own row tests.
  function seeded(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  it.each([1, 2, 3, 4, 5])(
    'a parent equals its child units plus its own people (seed %i)',
    (seed) => {
      const random = seeded(seed);
      const nodes: Record<number, AssignmentNode> = {};
      const users: Record<number, AssignmentUser> = {};
      const seats: Record<number, AssignmentSeat> = {};
      const rootIds: number[] = [];

      const NODE_COUNT = 14;
      for (let id = 1; id <= NODE_COUNT; id++) {
        const parentId =
          id === 1 ? null : Math.max(1, Math.floor(random() * (id - 1)) + 1);
        nodes[id] = node(id, parentId === id ? null : parentId, [], []);
        if (nodes[id].parentId === null) rootIds.push(id);
        else nodes[nodes[id].parentId as number].childIds.push(id);
      }

      let seatId = 1;
      for (let employeeId = 100; employeeId < 140; employeeId++) {
        const unitId = Math.floor(random() * NODE_COUNT) + 1;
        const seatIds: number[] = [];
        const count = Math.floor(random() * 3);
        for (let i = 0; i < count; i++) {
          const id = seatId++;
          seats[id] = seat(id, employeeId, {
            underused: random() < 0.25,
            vendorId: Math.floor(random() * 3) + 1,
          });
          seatIds.push(id);
        }
        users[employeeId] = user(employeeId, unitId, {
          seatIds,
          monthlyCost: Math.round(random() * 10000) / 100,
        });
        nodes[unitId].memberIds.push(employeeId);
      }

      const payload = payloadOf({ nodes, rootIds, users, seats });

      for (const parentId of Object.keys(nodes).map(Number)) {
        const parent = computeScopeMetrics(payload, parentId);
        const ownPeople = nodes[parentId].memberIds;
        const childTotals = nodes[parentId].childIds.reduce(
          (sum, childId) => {
            const child = computeScopeMetrics(payload, childId);
            return {
              people: sum.people + child.peopleInScope,
              assignments: sum.assignments + child.assignments,
              underused: sum.underused + child.underusedLicences,
              cost: sum.cost + child.monthlyCost,
            };
          },
          { people: 0, assignments: 0, underused: 0, cost: 0 },
        );

        const ownAssignments = ownPeople.reduce(
          (sum, id) => sum + users[id].seatIds.length,
          0,
        );
        const ownUnderused = ownPeople.reduce(
          (sum, id) =>
            sum + users[id].seatIds.filter((s) => seats[s].underused).length,
          0,
        );

        expect(parent.peopleInScope).toBe(
          childTotals.people + ownPeople.length,
        );
        expect(parent.assignments).toBe(
          childTotals.assignments + ownAssignments,
        );
        expect(parent.underusedLicences).toBe(
          childTotals.underused + ownUnderused,
        );

        // Cost rolls up too, now that it is summed off the member list rather
        // than read from a per-node total that included unit-allocated money.
        const ownCost = ownPeople.reduce(
          (sum, id) => sum + users[id].monthlyCost,
          0,
        );
        expect(parent.monthlyCost).toBeCloseTo(childTotals.cost + ownCost, 2);
      }

      // And the subtree walk itself stays consistent with the counts.
      const root = computeScopeMetrics(payload, rootIds[0]);
      const reachable = descendantIds(nodes, rootIds[0]);
      const expectedPeople = reachable.reduce(
        (sum, id) => sum + nodes[id].memberIds.length,
        0,
      );
      expect(root.peopleInScope).toBe(expectedPeople);
    },
  );
});
