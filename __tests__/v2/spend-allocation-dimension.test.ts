import {
  querySpend,
  queryCommitments,
  EMPTY_LINEAGE,
  type SpendAllocationInput,
  type SpendContractInput,
  type SpendRateProvider,
} from '@/lib/v2/spend';
import { buildAllocationContext } from '@/lib/v2/cost-allocation/context';
import { resolveAllocations } from '@/lib/v2/cost-allocation/resolver';
import type {
  AllocationLineRow,
  AllocationRow,
} from '@/lib/v2/cost-allocation/types';
import type { OrgUnitNode } from '@/lib/v2/org-units';

const ASOF = new Date('2026-07-01T00:00:00Z');
const usd = { mode: 'preconverted-usd' } as const;

// One-Time contracts keep the fixtures to a single committed segment so every
// assertion is a whole-fee statement.
function makeContract(spec: {
  id: number;
  products?: Array<{ product_id: number; fees: number }>;
}): SpendContractInput {
  return {
    id: spec.id,
    vendor_id: 10,
    status: 'active',
    currency: 'usd',
    subscription_term: 12,
    renewal_type: 'One-Time',
    billing_frequency: 'Annually',
    will_not_renew: false,
    term_start_date: [{ date: '2026-01-01' }],
    term_end_date: [{ date: '2026-12-31' }],
    cancel_by_date: null,
    vendor_products_details: (
      spec.products ?? [{ product_id: 100 + spec.id, fees: 12000 }]
    ).map((product) => ({ ...product, year: 1 })),
  };
}

const NODES: OrgUnitNode[] = [
  { id: 1, level: 'business_group', name: 'Investment Bank', parent_id: null },
  { id: 2, level: 'department', name: 'Equity Sales', parent_id: 1 },
  { id: 3, level: 'business_group', name: 'Wealth', parent_id: null },
];

function allocationInput(
  contracts: SpendContractInput[],
  rows: Array<{
    contractId: number;
    productId?: number | null;
    lines: Array<{ orgUnitId: number; percent: number }>;
  }>,
): SpendAllocationInput {
  const allocations: AllocationRow[] = [];
  const lines: AllocationLineRow[] = [];
  let lineSeq = 1;
  rows.forEach((row, index) => {
    allocations.push({
      id: index + 1,
      contract_id: row.contractId,
      product_id: row.productId ?? null,
      mode: 'manual',
    });
    for (const line of row.lines) {
      lines.push({
        id: lineSeq++,
        allocation_id: index + 1,
        org_unit_id: line.orgUnitId,
        org_employee_id: null,
        percent: line.percent,
      });
    }
  });
  const ctx = buildAllocationContext({
    allocations,
    lines,
    units: NODES,
    employees: [],
    seats: [],
    relationships: [],
  });
  return {
    resolved: resolveAllocations(contracts, ctx),
    unitsById: ctx.unitsById,
  };
}

function items(
  contracts: SpendContractInput[],
  allocations: SpendAllocationInput,
  level: 'business_group' | 'department' = 'business_group',
) {
  return querySpend(
    contracts,
    {
      basis: 'committed',
      source: 'expected',
      window: { fiscalYear: 2026 },
      granularity: 'year',
      groupBy: { kind: 'allocation', level },
      currency: usd,
      fiscalConfig: { startMonth: 1 },
      asOf: ASOF,
    },
    EMPTY_LINEAGE,
    { allocations },
  ).items;
}

describe('groupBy allocation (psk-1846 phase 3)', () => {
  it('splits a whole-contract allocation across node keys by percent', () => {
    const contract = makeContract({ id: 1 });
    const allocations = allocationInput(
      [contract],
      [
        {
          contractId: 1,
          lines: [
            { orgUnitId: 1, percent: 75 },
            { orgUnitId: 3, percent: 25 },
          ],
        },
      ],
    );
    expect(items([contract], allocations)).toEqual([
      { period: 'FY2026', groupKey: 'unit:1', value: 9000 },
      { period: 'FY2026', groupKey: 'unit:3', value: 3000 },
    ]);
  });

  it('rolls a department-targeted line up to the requested level', () => {
    const contract = makeContract({ id: 1 });
    const allocations = allocationInput(
      [contract],
      [{ contractId: 1, lines: [{ orgUnitId: 2, percent: 100 }] }],
    );
    expect(items([contract], allocations)).toEqual([
      { period: 'FY2026', groupKey: 'unit:1', value: 12000 },
    ]);
    expect(items([contract], allocations, 'department')).toEqual([
      { period: 'FY2026', groupKey: 'unit:2', value: 12000 },
    ]);
  });

  it('splits product-scoped allocations per product, unscoped products staying unassigned', () => {
    const contract = makeContract({
      id: 1,
      products: [
        { product_id: 101, fees: 8000 },
        { product_id: 102, fees: 4000 },
      ],
    });
    const allocations = allocationInput(
      [contract],
      [
        {
          contractId: 1,
          productId: 101,
          lines: [
            { orgUnitId: 1, percent: 50 },
            { orgUnitId: 3, percent: 50 },
          ],
        },
      ],
    );
    expect(items([contract], allocations)).toEqual([
      { period: 'FY2026', groupKey: 'unassigned', value: 4000 },
      { period: 'FY2026', groupKey: 'unit:1', value: 4000 },
      { period: 'FY2026', groupKey: 'unit:3', value: 4000 },
    ]);
  });

  it("routes contracts with no allocation to 'unassigned'", () => {
    const contract = makeContract({ id: 1 });
    const allocations = allocationInput([contract], []);
    expect(items([contract], allocations)).toEqual([
      { period: 'FY2026', groupKey: 'unassigned', value: 12000 },
    ]);
  });

  it("routes a line that lands nowhere at the level to 'unassigned', not to its own name", () => {
    // Investment Bank is a business group; asked for departments it has no
    // node to land on. Its money reports as unassigned rather than posing as
    // a department, and none of it leaks to the department that did land.
    const contract = makeContract({ id: 1 });
    const allocations = allocationInput(
      [contract],
      [
        {
          contractId: 1,
          lines: [
            { orgUnitId: 1, percent: 50 },
            { orgUnitId: 2, percent: 50 },
          ],
        },
      ],
    );
    expect(items([contract], allocations, 'department')).toEqual([
      { period: 'FY2026', groupKey: 'unassigned', value: 6000 },
      { period: 'FY2026', groupKey: 'unit:2', value: 6000 },
    ]);
  });

  it('allocation buckets sum to the ungrouped total (additivity)', () => {
    const contracts = [
      makeContract({ id: 1, products: [{ product_id: 101, fees: 10001 }] }),
      makeContract({ id: 2, products: [{ product_id: 102, fees: 7000 }] }),
    ];
    const allocations = allocationInput(contracts, [
      {
        contractId: 1,
        lines: [
          { orgUnitId: 1, percent: 33.3334 },
          { orgUnitId: 2, percent: 33.3333 },
          { orgUnitId: 3, percent: 33.3333 },
        ],
      },
    ]);
    const grouped = items(contracts, allocations, 'department');
    const sum = grouped.reduce((acc, item) => acc + item.value, 0);
    expect(sum).toBe(10001 + 7000);
  });

  it('splits native-currency values over the same keys', () => {
    const rates: SpendRateProvider = {
      monthRate: () => 0.5,
      dateRate: () => 0.5,
    };
    const contract = makeContract({ id: 1 });
    const allocations = allocationInput(
      [contract],
      [
        {
          contractId: 1,
          lines: [
            { orgUnitId: 1, percent: 75 },
            { orgUnitId: 3, percent: 25 },
          ],
        },
      ],
    );
    const converted = querySpend(
      [contract],
      {
        basis: 'committed',
        source: 'expected',
        window: { fiscalYear: 2026 },
        granularity: 'year',
        groupBy: { kind: 'allocation', level: 'business_group' },
        currency: { mode: 'base', target: 'EUR', rates },
        fiscalConfig: { startMonth: 1 },
        asOf: ASOF,
      },
      EMPTY_LINEAGE,
      { allocations },
    ).items;
    expect(converted).toEqual([
      {
        period: 'FY2026',
        groupKey: 'unit:1',
        value: 4500,
        nativeValue: 9000,
        nativeCurrency: 'USD',
      },
      {
        period: 'FY2026',
        groupKey: 'unit:3',
        value: 1500,
        nativeValue: 3000,
        nativeCurrency: 'USD',
      },
    ]);
  });

  it('event queries accept the allocation dimension', () => {
    const contract = makeContract({ id: 1 });
    const allocations = allocationInput(
      [contract],
      [{ contractId: 1, lines: [{ orgUnitId: 3, percent: 100 }] }],
    );
    const { items: events } = queryCommitments(
      [contract],
      {
        window: { fiscalYear: 2026 },
        granularity: 'year',
        groupBy: { kind: 'allocation', level: 'business_group' },
        currency: usd,
        fiscalConfig: { startMonth: 1 },
        asOf: ASOF,
      },
      EMPTY_LINEAGE,
      { allocations },
    );
    expect(events).toEqual([
      { period: 'FY2026', groupKey: 'unit:3', value: 12000, kind: 'new' },
    ]);
  });

  it('fails fast when the resolved map was never provided', () => {
    const contract = makeContract({ id: 1 });
    expect(() =>
      querySpend(
        [contract],
        {
          basis: 'committed',
          source: 'expected',
          window: { fiscalYear: 2026 },
          granularity: 'year',
          groupBy: { kind: 'allocation', level: 'business_group' },
          currency: usd,
          fiscalConfig: { startMonth: 1 },
          asOf: ASOF,
        },
        EMPTY_LINEAGE,
      ),
    ).toThrow(/requires options\.allocations/);
  });
});
