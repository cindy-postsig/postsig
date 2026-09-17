import {
  UNASSIGNED_KEY,
  allocationShares,
  splitByAllocation,
  splitEvenly,
} from '@/lib/v2/spend';
import type { ResolvedLine } from '@/lib/v2/cost-allocation';
import type { OrgUnitNode } from '@/lib/v2/org-units';

describe('splitByAllocation', () => {
  it('splits proportionally and preserves cents exactly', () => {
    const pieces = splitByAllocation(100, [
      ['a', 50],
      ['b', 30],
      ['c', 20],
    ]);
    expect(pieces).toEqual([
      ['a', 50],
      ['b', 30],
      ['c', 20],
    ]);
  });

  it('gives leftover cents to the largest remainders', () => {
    // 100.01 over 3 equal shares: 3333.666… cents each — floors 3333, two
    // leftover cents, remainders tie, so index order takes them.
    const pieces = splitByAllocation(100.01, [
      ['a', 33.3334],
      ['b', 33.3333],
      ['c', 33.3333],
    ]);
    expect(pieces.map(([, v]) => v).reduce((s, v) => s + v, 0)).toBeCloseTo(
      100.01,
      10,
    );
    expect(pieces).toEqual([
      ['a', 33.34],
      ['b', 33.34],
      ['c', 33.33],
    ]);
  });

  it('breaks exact remainder ties in input order', () => {
    expect(
      splitByAllocation(0.03, [
        ['a', 50],
        ['b', 50],
      ]),
    ).toEqual([
      ['a', 0.02],
      ['b', 0.01],
    ]);
  });

  it('normalizes by the actual percent sum, so tolerance drift loses nothing', () => {
    const pieces = splitByAllocation(200, [
      ['a', 49.995],
      ['b', 49.995],
    ]);
    expect(pieces).toEqual([
      ['a', 100],
      ['b', 100],
    ]);
  });

  it('reproduces splitEvenly cent for cent under equal shares, negatives included', () => {
    const keys = ['a', 'b', 'c'];
    const shares = keys.map((key) => [key, 1] as [string, number]);
    for (const value of [
      0, 0.01, 0.02, 0.1, 1, 99.99, 100.01, 1234.56, -0.05, -100.01, -1234.56,
    ]) {
      expect(splitByAllocation(value, shares)).toEqual(
        splitEvenly(value, keys),
      );
    }
  });

  it('rejects empty and zero-percent shares', () => {
    expect(() => splitByAllocation(100, [])).toThrow(/must not be empty/);
    expect(() => splitByAllocation(100, [['a', 0]])).toThrow(
      /positive percent/,
    );
  });
});

const NODES: OrgUnitNode[] = [
  { id: 1, level: 'business_group', name: 'Investment Bank', parent_id: null },
  { id: 2, level: 'division', name: 'Markets', parent_id: 1 },
  { id: 3, level: 'department', name: 'Equity Sales', parent_id: 2 },
  { id: 4, level: 'department', name: 'Advisory', parent_id: 2 },
];
const unitsById = new Map(NODES.map((node) => [node.id, node]));

const unitLine = (id: number, percent: number): ResolvedLine => {
  const node = NODES.find((n) => n.id === id);
  if (!node) throw new Error(`no fixture node ${id}`);
  return { target: { kind: 'org_unit', id, name: node.name }, percent };
};

const employeeLine = (
  orgUnitId: number | null,
  percent: number,
  id = 900,
): ResolvedLine => ({
  target: { kind: 'employee', id, name: 'Alice Aachen', orgUnitId },
  percent,
});

describe('allocationShares', () => {
  it('merges lines that roll up to the same node into one share', () => {
    const shares = allocationShares(
      [unitLine(3, 40), unitLine(4, 35), employeeLine(3, 25)],
      'business_group',
      unitsById,
    );
    expect(shares).toEqual([['unit:1', 100]]);
  });

  it("keys employees and units in disjoint spaces at the 'user' level", () => {
    const shares = allocationShares(
      [employeeLine(3, 60, 3), unitLine(3, 40)],
      'user',
      unitsById,
    );
    expect(shares).toEqual([
      ['user:3', 60],
      ['unit:3', 40],
    ]);
  });

  it('routes an empty scope to the unassigned bucket at 100%', () => {
    expect(allocationShares([], 'business_group', unitsById)).toEqual([
      ['unassigned', 100],
    ]);
  });

  it('routes a target with no ancestor at the level to the unassigned bucket', () => {
    const shares = allocationShares(
      [employeeLine(null, 100)],
      'department',
      unitsById,
    );
    expect(shares).toEqual([[UNASSIGNED_KEY, 100]]);
  });

  it('merges every landless line into one unassigned share, so no money moves', () => {
    // Dropping them instead would leave the sum at 50 and splitByAllocation
    // normalizes by the sum — Equity Sales would collect the whole contract.
    const shares = allocationShares(
      [employeeLine(3, 50), employeeLine(null, 30), unitLine(1, 20)],
      'department',
      unitsById,
    );
    expect(shares).toEqual([
      ['unit:3', 50],
      [UNASSIGNED_KEY, 50],
    ]);
    expect(splitByAllocation(1000, shares)).toEqual([
      ['unit:3', 500],
      [UNASSIGNED_KEY, 500],
    ]);
  });

  it('applies a custom key function (the monthly report keys by name)', () => {
    const shares = allocationShares(
      [unitLine(3, 100)],
      'business_group',
      unitsById,
      (target) => target.name,
    );
    expect(shares).toEqual([['Investment Bank', 100]]);
  });
});
