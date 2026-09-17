import { nestContractRowsByLineage } from '@/lib/v2/contracts/lineageRows';
import { groupContractsByVendor } from '@/lib/v2/contracts/transforms';
import type { ContractTableRow } from '@/lib/v2/core/types';
import type { RelationshipEdge } from '@/lib/v2/spend';

type RowOverrides = Partial<ContractTableRow> & { id: string };

const row = ({ id, ...overrides }: RowOverrides): ContractTableRow =>
  ({
    id,
    contract_id: id,
    vendor: 'Acme',
    vendorId: 'v1',
    status: 'published',
    termStartDate: '2026-01-01',
    termEndDate: '2030-01-01',
    cancelByDate: null,
    ...overrides,
  }) as ContractTableRow;

const edge = (parent: number, child: number): RelationshipEdge => ({
  parent_contract_id: parent,
  child_contract_id: child,
});

/** Every id in the forest, in render order. */
const flatten = (rows: readonly ContractTableRow[]): string[] =>
  rows.flatMap((r) => [
    r.id,
    ...flatten((r.subRows ?? []) as ContractTableRow[]),
  ]);

describe('nestContractRowsByLineage', () => {
  it('nests a linear MSA → SO → amendment chain', () => {
    const { roots } = nestContractRowsByLineage(
      [row({ id: '1' }), row({ id: '2' }), row({ id: '3' })],
      [edge(1, 2), edge(2, 3)],
    );

    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe('1');
    expect(roots[0].lineageDepth).toBe(0);
    expect(roots[0].hasLineageChildren).toBe(true);

    const so = (roots[0].subRows as ContractTableRow[])[0];
    expect(so.id).toBe('2');
    expect(so.lineageDepth).toBe(1);
    expect(so.isLineageChild).toBe(true);

    const amendment = (so.subRows as ContractTableRow[])[0];
    expect(amendment.id).toBe('3');
    expect(amendment.lineageDepth).toBe(2);
  });

  it('orders siblings chronologically, archived last', () => {
    const { roots } = nestContractRowsByLineage(
      [
        row({ id: '1' }),
        row({ id: '2', termStartDate: '2026-06-01' }),
        row({ id: '3', termStartDate: '2026-02-01' }),
        row({ id: '4', termStartDate: '2026-01-15', status: 'inactive' }),
      ],
      [edge(1, 2), edge(1, 3), edge(1, 4)],
    );

    expect((roots[0].subRows as ContractTableRow[]).map((r) => r.id)).toEqual([
      '3',
      '2',
      '4',
    ]);
  });

  it('treats a child whose parent is not loaded as a root', () => {
    // This is the permission fail-safe: a contract the user cannot see never
    // hides its visible children.
    const { roots } = nestContractRowsByLineage(
      [row({ id: '2' }), row({ id: '3' })],
      [edge(1, 2), edge(2, 3)],
    );

    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe('2');
    expect(flatten(roots)).toEqual(['2', '3']);
  });

  it('tolerates a two-node cycle without throwing or looping', () => {
    const rows = [row({ id: '1' }), row({ id: '2' })];
    const result = nestContractRowsByLineage(rows, [edge(1, 2), edge(2, 1)]);

    expect(flatten(result.roots).sort()).toEqual(['1', '2']);
  });

  it('emits every node of a rootless cycle exactly once', () => {
    const rows = [row({ id: '1' }), row({ id: '2' }), row({ id: '3' })];
    const result = nestContractRowsByLineage(rows, [
      edge(1, 2),
      edge(2, 3),
      edge(3, 1),
    ]);

    expect(flatten(result.roots).sort()).toEqual(['1', '2', '3']);
  });

  it('places a contract claimed by two parents exactly once', () => {
    const rows = [row({ id: '1' }), row({ id: '2' }), row({ id: '3' })];
    const { roots } = nestContractRowsByLineage(rows, [edge(1, 3), edge(2, 3)]);

    const flat = flatten(roots);
    expect(flat.filter((id) => id === '3')).toHaveLength(1);
    expect(flat.sort()).toEqual(['1', '2', '3']);
  });

  it('ignores edges with a null endpoint', () => {
    const rows = [row({ id: '1' }), row({ id: '2' })];
    const { roots } = nestContractRowsByLineage(rows, [
      { parent_contract_id: null, child_contract_id: 2 },
      { parent_contract_id: 1, child_contract_id: null },
    ]);

    expect(roots.map((r) => r.id)).toEqual(['1', '2']);
  });

  it('emits every input row exactly once, whatever the edges', () => {
    // The invariant that protects `getRowId` — a duplicated contract would
    // collide on row id and tie two rows' selection and expansion together.
    const rows = ['1', '2', '3', '4', '5'].map((id) => row({ id }));
    const edges = [edge(1, 2), edge(2, 3), edge(3, 2), edge(4, 5), edge(5, 4)];

    const flat = flatten(nestContractRowsByLineage(rows, edges).roots);
    expect(flat).toHaveLength(rows.length);
    expect([...flat].sort()).toEqual(['1', '2', '3', '4', '5']);
  });

  it('replaces product sub-rows on a contract that gains lineage children', () => {
    const parent = row({ id: '1' });
    (parent as ContractTableRow).subRows = [
      { id: 'p1', isProductRow: true } as unknown as ContractTableRow,
    ];

    const { roots } = nestContractRowsByLineage(
      [parent, row({ id: '2' })],
      [edge(1, 2)],
    );

    expect((roots[0].subRows as ContractTableRow[]).map((r) => r.id)).toEqual([
      '2',
    ]);
  });

  it('rolls the earliest subtree dates up for sorting', () => {
    const { roots } = nestContractRowsByLineage(
      [
        row({ id: '1', termEndDate: '2031-01-01', cancelByDate: '2030-11-01' }),
        row({ id: '2', termEndDate: '2026-09-01', cancelByDate: '2026-08-01' }),
      ],
      [edge(1, 2)],
    );

    expect(roots[0].subtreeEarliestTermEndDate).toBe('2026-09-01');
    expect(roots[0].subtreeEarliestCancelByDate).toBe('2026-08-01');
    // Display values are untouched.
    expect(roots[0].termEndDate).toBe('2031-01-01');
  });

  it('leaves a childless row without a rollup', () => {
    const { roots } = nestContractRowsByLineage([row({ id: '1' })], []);
    expect(roots[0].subtreeEarliestTermEndDate).toBeUndefined();
  });

  it('reports every re-parented id in nestedIds', () => {
    // Callers that flatten the forest rely on this to avoid double-counting.
    const { nestedIds } = nestContractRowsByLineage(
      [row({ id: '1' }), row({ id: '2' }), row({ id: '3' }), row({ id: '4' })],
      [edge(1, 2), edge(2, 3)],
    );

    expect([...nestedIds].sort()).toEqual(['2', '3']);
    expect(nestedIds.has('1')).toBe(false);
    expect(nestedIds.has('4')).toBe(false);
  });

  it('stops nesting at the depth cap without dropping any row', () => {
    // A chain this deep means malformed data; the cap must degrade by
    // flattening the tail, never by losing contracts.
    const length = 40;
    const rows = Array.from({ length }, (_, index) =>
      row({ id: `${index + 1}` }),
    );
    const edges = Array.from({ length: length - 1 }, (_, index) =>
      edge(index + 1, index + 2),
    );

    const { roots } = nestContractRowsByLineage(rows, edges);
    const flat = flatten(roots);

    expect(flat).toHaveLength(length);
    expect(new Set(flat).size).toBe(length);

    const deepest = (node: ContractTableRow, depth = 0): number => {
      const children = (node.subRows ?? []) as ContractTableRow[];
      return children.length === 0
        ? depth
        : Math.max(...children.map((child) => deepest(child, depth + 1)));
    };
    expect(deepest(roots[0])).toBeLessThanOrEqual(32);
  });

  it('returns the rows untouched when there are no usable edges', () => {
    const rows = [row({ id: '1' }), row({ id: '2' })];
    const { roots, nestedIds } = nestContractRowsByLineage(rows, []);

    expect(roots).toEqual(rows);
    expect(nestedIds.size).toBe(0);
  });

  // psk-1930: a child keeps its FIRST parent and the fetch has no ORDER BY, so
  // an unfiltered billing edge would nest the invoice non-deterministically —
  // under its real parent or its payer, depending on row order.
  describe('billing edges', () => {
    const billing = (parent: number, child: number): RelationshipEdge =>
      ({
        parent_contract_id: parent,
        child_contract_id: child,
        relationship_type: 'billing',
      }) as RelationshipEdge;

    const rows = [row({ id: '1' }), row({ id: '2' }), row({ id: '3' })];

    it('never nests a row under its billing parent', () => {
      // Invoice 3 is structurally under 2 and billing-linked to 1.
      const { roots } = nestContractRowsByLineage(rows, [
        billing(1, 3),
        edge(2, 3),
      ]);

      expect(roots.map((r) => r.id).sort()).toEqual(['1', '2']);
      const under2 = roots.find((r) => r.id === '2');
      expect((under2?.subRows as ContractTableRow[]).map((r) => r.id)).toEqual([
        '3',
      ]);
      expect(roots.find((r) => r.id === '1')?.subRows ?? []).toHaveLength(0);
    });

    it('nests identically regardless of billing-edge order', () => {
      const first = nestContractRowsByLineage(rows, [
        billing(1, 3),
        edge(2, 3),
      ]);
      const second = nestContractRowsByLineage(rows, [
        edge(2, 3),
        billing(1, 3),
      ]);
      expect(flatten(first.roots)).toEqual(flatten(second.roots));
    });

    it('leaves a billing-only child as a root', () => {
      const { roots, nestedIds } = nestContractRowsByLineage(rows, [
        billing(1, 3),
      ]);
      expect(roots.map((r) => r.id).sort()).toEqual(['1', '2', '3']);
      expect(nestedIds.size).toBe(0);
    });
  });
});

describe('groupContractsByVendor with lineage edges', () => {
  const contract = (
    id: string,
    overrides: Partial<ContractTableRow> = {},
  ): ContractTableRow =>
    ({
      ...row({ id }),
      typeId: 1,
      currentBudget: 100,
      convertedCurrentBudget: 100,
      projectedBudget: 110,
      convertedProjectedBudget: 110,
      totalContractValue: 300,
      convertedTotalContractValue: 300,
      annualCost: 100,
      convertedAnnualCost: 100,
      currency: 'USD',
      ...overrides,
    }) as ContractTableRow;

  it('nests the group children without changing the group totals', () => {
    const rows = [contract('1'), contract('2'), contract('3')];

    const flat = groupContractsByVendor(rows) as ContractTableRow[];
    const nested = groupContractsByVendor(rows, [
      edge(1, 2),
      edge(2, 3),
    ]) as ContractTableRow[];

    expect(flat[0].isGroup).toBe(true);
    expect(nested[0].isGroup).toBe(true);

    // The whole point of nesting at the subRows assignment and nowhere
    // earlier: every aggregate is computed over the flat per-vendor list.
    expect(nested[0].currentBudget).toBe(flat[0].currentBudget);
    expect(nested[0].projectedBudget).toBe(flat[0].projectedBudget);
    expect(nested[0].totalContractValue).toBe(flat[0].totalContractValue);
    expect(nested[0].termEndDate).toBe(flat[0].termEndDate);

    // …but the children are now a chain rather than three siblings.
    expect((flat[0].subRows as ContractTableRow[]).map((r) => r.id)).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(flatten(nested[0].subRows as ContractTableRow[])).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(nested[0].subRows).toHaveLength(1);
  });
});
