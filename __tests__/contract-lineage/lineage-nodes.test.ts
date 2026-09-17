import {
  buildLineageNodeMeta,
  collectHiddenArchivedIds,
  collectPathIds,
  filterHierarchyForInvoicesAccess,
  isArchivedStatus,
  orderArchivedLast,
} from '@/lib/contracts/lineageNodes';
import { contractTypes } from '@/app/lib/constants';

describe('isArchivedStatus', () => {
  it('treats only the inactive status as archived', () => {
    expect(isArchivedStatus('inactive')).toBe(true);
    expect(isArchivedStatus('active')).toBe(false);
    expect(isArchivedStatus('unconfirmed')).toBe(false);
    expect(isArchivedStatus(null)).toBe(false);
    expect(isArchivedStatus(undefined)).toBe(false);
  });
});

describe('buildLineageNodeMeta', () => {
  it('indexes records by stringified id', () => {
    const meta = buildLineageNodeMeta([
      { id: 3023, localId: 'MSA', status: 'active' },
    ]);

    expect(meta.get('3023')?.localId).toBe('MSA');
    expect(meta.get(3023 as unknown as string)).toBeUndefined();
  });

  it('resolves the archived flag, order number and invoice flag', () => {
    const meta = buildLineageNodeMeta([
      {
        id: 1,
        localId: 'SO-1',
        status: 'inactive',
        type_id: contractTypes.SO,
        metadata: { lineage: { order_number: ' 00768208 ' } },
      },
      {
        id: 2,
        localId: 'INV-1',
        status: 'active',
        type_id: contractTypes.Invoice,
        metadata: { lineage: { order_number: 'INV-2024-001' } },
      },
    ]);

    expect(meta.get('1')).toEqual({
      localId: 'SO-1',
      isArchived: true,
      orderNumber: '00768208',
      isInvoice: false,
    });
    expect(meta.get('2')).toEqual({
      localId: 'INV-1',
      isArchived: false,
      orderNumber: 'INV-2024-001',
      isInvoice: true,
    });
  });

  it('falls back to no order number when metadata is missing or unusable', () => {
    const meta = buildLineageNodeMeta([
      { id: 1, localId: 'MSA' },
      { id: 2, localId: 'SO-1', metadata: null },
      { id: 3, localId: 'SO-2', metadata: { lineage: null } },
      {
        id: 4,
        localId: 'SO-3',
        metadata: { lineage: { order_number: 'null' } },
      },
      { id: 5, localId: 'SO-4', metadata: 'not-an-object' },
    ]);

    expect(meta.get('1')?.orderNumber).toBeNull();
    expect(meta.get('2')?.orderNumber).toBeNull();
    expect(meta.get('3')?.orderNumber).toBeNull();
    expect(meta.get('4')?.orderNumber).toBeNull();
    expect(meta.get('5')?.orderNumber).toBeNull();
  });

  it('defaults localId to an empty string when absent', () => {
    const meta = buildLineageNodeMeta([{ id: 1 }]);
    expect(meta.get('1')?.localId).toBe('');
  });
});

describe('collectPathIds', () => {
  const hierarchy = {
    id: 1,
    children: [
      { id: 2, children: [{ id: 4 }] },
      { id: 3, children: [{ id: 5, children: [{ id: 6 }] }] },
    ],
  };

  it('returns the root-to-target path inclusive', () => {
    expect([...collectPathIds(hierarchy, 6)].sort()).toEqual([
      '1',
      '3',
      '5',
      '6',
    ]);
  });

  it('returns just the root when the root is the target', () => {
    expect([...collectPathIds(hierarchy, 1)]).toEqual(['1']);
  });

  it('matches numeric and string ids interchangeably', () => {
    expect([...collectPathIds(hierarchy, '4')].sort()).toEqual(['1', '2', '4']);
  });

  it('returns empty for a missing target or missing root', () => {
    expect(collectPathIds(hierarchy, 999).size).toBe(0);
    expect(collectPathIds(null, 1).size).toBe(0);
    expect(collectPathIds(hierarchy, undefined).size).toBe(0);
  });
});

describe('collectHiddenArchivedIds', () => {
  const archivedOf =
    (archived: Array<string | number>) =>
    (nodeId: string): boolean =>
      archived.map(String).includes(nodeId);

  it('hides an archived leaf', () => {
    const hierarchy = { id: 1, children: [{ id: 2 }, { id: 3 }] };

    expect([...collectHiddenArchivedIds(hierarchy, archivedOf([3]))]).toEqual([
      '3',
    ]);
  });

  it('hides a fully archived subtree including its descendants', () => {
    const hierarchy = {
      id: 1,
      children: [{ id: 2, children: [{ id: 4 }, { id: 5 }] }, { id: 3 }],
    };

    expect(
      [...collectHiddenArchivedIds(hierarchy, archivedOf([2, 4, 5]))].sort(),
    ).toEqual(['2', '4', '5']);
  });

  it('keeps an archived parent visible when a descendant is still active', () => {
    const hierarchy = {
      id: 1,
      children: [{ id: 2, children: [{ id: 4 }, { id: 5 }] }],
    };

    // 2 and 4 are archived but 5 is active, so 2 must stay reachable.
    expect([
      ...collectHiddenArchivedIds(hierarchy, archivedOf([2, 4])),
    ]).toEqual(['4']);
  });

  it('never hides kept ids and keeps their ancestors visible', () => {
    const hierarchy = {
      id: 1,
      children: [{ id: 2, children: [{ id: 3 }] }],
    };
    const keepIds = collectPathIds(hierarchy, 3);

    expect(
      collectHiddenArchivedIds(hierarchy, archivedOf([1, 2, 3]), keepIds).size,
    ).toBe(0);
  });

  it('hides archived siblings of a kept node', () => {
    const hierarchy = {
      id: 1,
      children: [{ id: 2 }, { id: 3 }],
    };
    const keepIds = collectPathIds(hierarchy, 2);

    expect([
      ...collectHiddenArchivedIds(hierarchy, archivedOf([2, 3]), keepIds),
    ]).toEqual(['3']);
  });

  it('returns empty for a missing hierarchy', () => {
    expect(collectHiddenArchivedIds(null, archivedOf([1])).size).toBe(0);
  });
});

describe('orderArchivedLast', () => {
  const archivedOf =
    (archived: Array<string | number>) =>
    (nodeId: string): boolean =>
      archived.map(String).includes(nodeId);

  it('moves archived nodes after active ones', () => {
    const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

    expect(
      orderArchivedLast(nodes, archivedOf([1, 3])).map((n) => n.id),
    ).toEqual([2, 4, 1, 3]);
  });

  it('preserves the incoming order within each group', () => {
    const nodes = [{ id: 5 }, { id: 1 }, { id: 9 }, { id: 3 }];

    expect(
      orderArchivedLast(nodes, archivedOf([5, 9])).map((n) => n.id),
    ).toEqual([1, 3, 5, 9]);
  });

  it('does not mutate the input array', () => {
    const nodes = [{ id: 1 }, { id: 2 }];
    orderArchivedLast(nodes, archivedOf([1]));

    expect(nodes.map((n) => n.id)).toEqual([1, 2]);
  });
});

describe('filterHierarchyForInvoicesAccess', () => {
  // SO-1 (1) -> Invoice (2), Amendment (3) -> Invoice (4)
  const hierarchy = {
    id: 1,
    children: [{ id: 2 }, { id: 3, children: [{ id: 4 }] }],
  };
  const allContracts = [
    { id: 1, type_id: contractTypes.SO },
    { id: 2, type_id: contractTypes.Invoice },
    { id: 3, type_id: contractTypes.MSA },
    { id: 4, type_id: contractTypes.Invoice },
  ];

  it('is a no-op when the Invoices module is enabled', () => {
    const result = filterHierarchyForInvoicesAccess(
      hierarchy,
      allContracts,
      true,
      1,
    );

    expect(result.hierarchy).toBe(hierarchy);
    expect(result.allContracts).toBe(allContracts);
  });

  it('prunes invoice nodes at any depth, and the flat list, when disabled', () => {
    const result = filterHierarchyForInvoicesAccess(
      hierarchy,
      allContracts,
      false,
      1,
    );

    expect(result.hierarchy).toEqual({
      id: 1,
      children: [{ id: 3, children: [] }],
    });
    expect(result.allContracts.map((c) => c.id)).toEqual([1, 3]);
  });

  it('never prunes the contract currently being viewed, even if it is an invoice', () => {
    const result = filterHierarchyForInvoicesAccess(
      hierarchy,
      allContracts,
      false,
      2,
    );

    // Node 2 survives as the current contract; node 4 (a different invoice)
    // is still pruned.
    expect(result.hierarchy).toEqual({
      id: 1,
      children: [
        { id: 2, children: [] },
        { id: 3, children: [] },
      ],
    });
    expect(result.allContracts.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it('returns null for a missing hierarchy without throwing', () => {
    const result = filterHierarchyForInvoicesAccess(
      null,
      allContracts,
      false,
      1,
    );

    expect(result.hierarchy).toBeNull();
  });
});
