import {
  buildProductRows,
  buildUnderusedRows,
  buildUserRows,
  underusedMonthlyAtRisk,
} from '@/lib/v2/assignments/rows';
import type {
  AssignmentNode,
  AssignmentSeat,
  AssignmentUser,
  AssignmentsPayload,
} from '@/lib/v2/assignments/types';
import { FIRMWIDE } from '@/lib/v2/assignments/types';

const node = (id: number, memberIds: number[]): AssignmentNode => ({
  id,
  name: `N${id}`,
  level: 'department',
  levelLabel: 'Department',
  parentId: null,
  childIds: [],
  memberIds,
  headcount: memberIds.length,
});

const user = (
  id: number,
  seatIds: number[],
  over: Partial<AssignmentUser> = {},
): AssignmentUser => ({
  id,
  name: `User ${id}`,
  email: `u${id}@example.com`,
  employeeId: `E${id}`,
  orgUnitId: 1,
  status: 'active',
  costCenter: null,
  region: null,
  country: null,
  seatIds,
  monthlyCost: 0,
  ...over,
});

const seat = (
  id: number,
  orgEmployeeId: number,
  over: Partial<AssignmentSeat> = {},
): AssignmentSeat => ({
  id,
  contractId: 100,
  productId: 200,
  productName: 'Terminal',
  vendorId: 1,
  vendorName: 'Bloomberg',
  deliveryMethods: ['Desktop'],
  orgEmployeeId,
  holderName: `User ${orgEmployeeId}`,
  assignedDate: null,
  inactiveReasons: [],
  underused: false,
  monthlyCost: 10,
  ...over,
});

const payload = (over: Partial<AssignmentsPayload>): AssignmentsPayload => ({
  window: { month: '2026-04', label: 'April 2026' },
  nodes: {},
  rootIds: [],
  users: {},
  seats: {},
  productDetails: {},
  empty: false,
  ...over,
});

describe('buildProductRows', () => {
  const base = payload({
    nodes: { 1: node(1, [10, 11]) },
    rootIds: [1],
    users: { 10: user(10, [1, 2]), 11: user(11, [3]) },
    seats: {
      1: seat(1, 10),
      2: seat(2, 10, {
        productId: 300,
        productName: 'Workspace',
        vendorId: 2,
        vendorName: 'LSEG',
        monthlyCost: 30,
      }),
      3: seat(3, 11, { underused: true, monthlyCost: 5 }),
    },
  });

  it('groups by vendor and totals users, inactive seats and cost', () => {
    const groups = buildProductRows(base, FIRMWIDE);
    const lseg = groups.find((g) => g.vendorName === 'LSEG');
    const bloomberg = groups.find((g) => g.vendorName === 'Bloomberg');

    expect(lseg?.monthlyCost).toBe(30);
    expect(bloomberg?.products[0]).toMatchObject({
      productName: 'Terminal',
      userCount: 2,
      inactiveCount: 1,
      monthlyCost: 15,
    });
  });

  it('puts the biggest spend first', () => {
    expect(buildProductRows(base, FIRMWIDE).map((g) => g.vendorName)).toEqual([
      'LSEG',
      'Bloomberg',
    ]);
  });

  it('collects the de-duplicated union of a product’s delivery methods', () => {
    const spread = payload({
      ...base,
      seats: {
        ...base.seats,
        3: {
          ...base.seats[3],
          deliveryMethods: ['Desktop', 'Mobile'],
        },
      },
    });
    const terminal = buildProductRows(spread, FIRMWIDE)
      .flatMap((g) => g.products)
      .find((p) => p.productName === 'Terminal');
    expect(terminal?.deliveryMethods).toEqual(['Desktop', 'Mobile']);
  });

  it('folds exchange entitlements into the product’s cost and names their share', () => {
    const entitled = payload({
      ...base,
      seats: {
        ...base.seats,
        1: seat(1, 10, {
          monthlyCost: 2062.6,
          entitlements: { exchanges: [], monthlyCost: 43.7 },
        }),
      },
    });
    const terminal = buildProductRows(entitled, FIRMWIDE)
      .flatMap((g) => g.products)
      .find((p) => p.productName === 'Terminal');
    expect(terminal).toMatchObject({
      userCount: 2,
      monthlyCost: 2067.6,
      entitlementsMonthlyCost: 43.7,
      entitledSeatCount: 1,
    });
  });

  it('costs the inactive seats separately, for the panel’s Inactive tab', () => {
    const groups = buildProductRows(base, FIRMWIDE);
    const terminal = groups
      .flatMap((g) => g.products)
      .find((p) => p.productName === 'Terminal');
    expect(terminal?.monthlyCost).toBe(15);
    expect(terminal?.inactiveMonthlyCost).toBe(5);
  });

  it('carries the contract terms when every seat sits on one contract', () => {
    const withDetail = payload({
      ...base,
      productDetails: {
        '100:200': {
          contractId: 100,
          orderNumber: 'CTR-1',
          contractType: 'Order Form',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          annualIncrease: 3,
          ratePerLicence: 900,
          licences: 4,
        },
      },
    });
    const terminal = buildProductRows(withDetail, FIRMWIDE)
      .flatMap((g) => g.products)
      .find((p) => p.productName === 'Terminal');
    expect(terminal?.detail?.orderNumber).toBe('CTR-1');
  });

  it('carries none when the seats span several contracts', () => {
    // Naming one contract's start date out of several is worse than silence.
    const spread = payload({
      ...base,
      seats: { ...base.seats, 3: { ...base.seats[3], contractId: 999 } },
      productDetails: {
        '100:200': {
          contractId: 100,
          orderNumber: 'CTR-1',
          contractType: 'Order Form',
          startDate: null,
          endDate: null,
          annualIncrease: null,
          ratePerLicence: null,
          licences: null,
        },
      },
    });
    const terminal = buildProductRows(spread, FIRMWIDE)
      .flatMap((g) => g.products)
      .find((p) => p.productName === 'Terminal');
    expect(terminal?.contractIds).toHaveLength(2);
    expect(terminal?.detail).toBeNull();
  });

  it('says nothing rather than showing an empty table for an unassigned scope', () => {
    expect(buildProductRows(payload({ nodes: { 2: node(2, []) } }), 2)).toEqual(
      [],
    );
  });
});

describe('product chips', () => {
  it('shows one chip per product, counting repeats rather than repeating the name', () => {
    const rows = buildUserRows(
      payload({
        nodes: { 1: node(1, [10]) },
        users: { 10: user(10, [1, 2, 3]) },
        seats: {
          1: seat(1, 10, { productName: 'LNBloomberg' }),
          2: seat(2, 10, { productName: 'LNBloomberg' }),
          3: seat(3, 10, { productName: 'Terminal' }),
        },
      }),
      1,
    );
    expect(rows[0].products).toEqual([
      { name: 'LNBloomberg', count: 2, underused: false },
      { name: 'Terminal', count: 1, underused: false },
    ]);
    expect(rows[0].assignmentCount).toBe(3);
  });

  it('names the chips in order, whatever order the seats came in', () => {
    const rows = buildUserRows(
      payload({
        nodes: { 1: node(1, [10]) },
        users: { 10: user(10, [1, 2]) },
        seats: {
          1: seat(1, 10, { productName: 'Terminal' }),
          2: seat(2, 10, { productName: 'Aladdin' }),
        },
      }),
      1,
    );
    expect(rows[0].products.map((p) => p.name)).toEqual([
      'Aladdin',
      'Terminal',
    ]);
  });

  it('marks the chip underused when any of its seats is', () => {
    const rows = buildUserRows(
      payload({
        nodes: { 1: node(1, [10]) },
        users: { 10: user(10, [1, 2]) },
        seats: {
          1: seat(1, 10, { productName: 'LNBloomberg' }),
          2: seat(2, 10, { productName: 'LNBloomberg', underused: true }),
        },
      }),
      1,
    );
    expect(rows[0].products).toEqual([
      { name: 'LNBloomberg', count: 2, underused: true },
    ]);
  });
});

describe('buildUserRows', () => {
  it('defaults to most assignments first', () => {
    const rows = buildUserRows(
      payload({
        nodes: { 1: node(1, [10, 11, 12]) },
        users: { 10: user(10, [1]), 11: user(11, [2, 3]), 12: user(12, []) },
        seats: { 1: seat(1, 10), 2: seat(2, 11), 3: seat(3, 11) },
      }),
      1,
    );
    expect(rows.map((r) => r.assignmentCount)).toEqual([2, 1, 0]);
  });

  it('breaks the long run of equal counts by name', () => {
    const rows = buildUserRows(
      payload({
        nodes: { 1: node(1, [10, 11, 12]) },
        users: {
          10: user(10, [1], { name: 'Zoe' }),
          11: user(11, [2], { name: 'Ada' }),
          12: user(12, [3], { name: 'Mia' }),
        },
        seats: { 1: seat(1, 10), 2: seat(2, 11), 3: seat(3, 12) },
      }),
      1,
    );
    expect(rows.map((r) => r.name)).toEqual(['Ada', 'Mia', 'Zoe']);
  });

  it('reads the HR path off the tree, which the payload no longer copies per person', () => {
    const rows = buildUserRows(
      payload({
        nodes: {
          1: {
            ...node(1, []),
            name: 'Markets',
            level: 'entity',
            childIds: [2],
          },
          2: { ...node(2, [10]), name: 'Rates', parentId: 1 },
        },
        rootIds: [1],
        users: { 10: user(10, [1], { orgUnitId: 2 }) },
        seats: { 1: seat(1, 10) },
      }),
      FIRMWIDE,
    );
    expect(rows[0].path).toEqual(['Markets', 'Rates']);
    expect(rows[0].pathByLevel).toEqual({
      entity: 'Markets',
      department: 'Rates',
    });
  });

  it('leaves the path empty for someone outside the tree', () => {
    const rows = buildUserRows(
      payload({
        nodes: { 1: node(1, []) },
        users: { 10: user(10, [1], { orgUnitId: null }) },
        seats: { 1: seat(1, 10) },
      }),
      FIRMWIDE,
    );
    expect(rows[0].path).toEqual([]);
    expect(rows[0].pathByLevel).toEqual({});
  });

  it('does not list every employee when the scope has no assigned users', () => {
    const rows = buildUserRows(
      payload({
        nodes: { 1: node(1, [10, 11]) },
        users: { 10: user(10, []), 11: user(11, []) },
      }),
      1,
    );
    expect(rows).toEqual([]);
  });
});

describe('buildUnderusedRows', () => {
  const base = payload({
    nodes: { 1: { ...node(1, [10, 11]), name: 'Rates' } },
    rootIds: [1],
    users: {
      10: user(10, [1, 2]),
      11: user(11, [3], { status: 'inactive' }),
    },
    seats: {
      1: seat(1, 10),
      2: seat(2, 10, {
        productName: 'Workspace',
        vendorName: 'LSEG',
        inactiveReasons: ['leaver', 'dormant'],
        underused: true,
        monthlyCost: 780,
      }),
      3: seat(3, 11, {
        inactiveReasons: ['leaver'],
        underused: true,
        monthlyCost: 42,
      }),
    },
  });

  it('lists only underused seats, dearest first', () => {
    const rows = buildUnderusedRows(base, FIRMWIDE);
    expect(rows.map((r) => r.productName)).toEqual(['Workspace', 'Terminal']);
    expect(rows[0].monthlyCost).toBe(780);
  });

  it('carries the holder’s department and id so a row can open their profile', () => {
    const [row] = buildUnderusedRows(base, FIRMWIDE);
    expect(row.employeeId).toBe(10);
    expect(row.department).toBe('Rates');
  });

  it('carries every reason the seat was flagged for', () => {
    expect(buildUnderusedRows(base, FIRMWIDE)[0].inactiveReasons).toEqual([
      'leaver',
      'dormant',
    ]);
  });

  it('leaves last used empty until the vendor feed supplies it', () => {
    expect(buildUnderusedRows(base, FIRMWIDE)[0].lastUsed).toBeNull();
  });

  it('totals what is at risk each month', () => {
    expect(underusedMonthlyAtRisk(buildUnderusedRows(base, FIRMWIDE))).toBe(
      822,
    );
  });

  it('names an unlinked seat without offering a profile to open', () => {
    const orphan = payload({
      nodes: { 1: node(1, []) },
      users: {},
      seats: {
        9: seat(9, 0, {
          orgEmployeeId: null,
          holderName: 'Legacy Seat',
          underused: true,
        }),
      },
    });
    const [row] = buildUnderusedRows(orphan, FIRMWIDE);
    expect(row.userName).toBe('Legacy Seat');
    expect(row.employeeId).toBeNull();
  });
});
