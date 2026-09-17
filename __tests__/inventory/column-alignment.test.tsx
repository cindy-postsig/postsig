/**
 * `meta.className` is the only thing the table applies to BOTH the <th> and the
 * <td> (InventoryTableClient), so a column that centres its cell body but omits
 * the class from meta leaves the header left-aligned against centred numbers —
 * invisible on a narrow column, glaring once hidden columns let `w-auto` grow.
 */
import React from 'react';
import type { CellContext } from '@tanstack/react-table';
import type { InventoryItem } from '@/lib/v2/inventory/types';

jest.mock('@/components/vendors/VendorIcon', () => ({
  __esModule: true,
  default: () => null,
}));

import { createInventoryColumns } from '@/app/(app)/(cpm)/inventory/columns';

const leafRow = {
  getCanExpand: () => false,
  getIsExpanded: () => false,
  original: {
    enterprise: false,
    licensesCount: 4,
    activeUsers: [{}, {}],
    cost: 100,
  },
} as unknown as CellContext<InventoryItem, unknown>['row'];

const cellClassName = (accessorKey: string): string => {
  const column = createInventoryColumns().find(
    (candidate) =>
      'accessorKey' in candidate && candidate.accessorKey === accessorKey,
  );
  if (!column?.cell || typeof column.cell !== 'function') {
    throw new Error(`No cell renderer for ${accessorKey}`);
  }
  const rendered = column.cell({ row: leafRow } as CellContext<
    InventoryItem,
    unknown
  >);
  return (
    (React.isValidElement<{ className?: string }>(rendered)
      ? rendered.props.className
      : '') ?? ''
  );
};

const metaClassName = (accessorKey: string): string => {
  const column = createInventoryColumns().find(
    (candidate) =>
      'accessorKey' in candidate && candidate.accessorKey === accessorKey,
  );
  return column?.meta?.className ?? '';
};

describe('inventory column alignment', () => {
  it.each(['licensesCount', 'activeUsers'])(
    '%s centres its header with its cell',
    (accessorKey) => {
      expect(cellClassName(accessorKey)).toContain('text-center');
      expect(metaClassName(accessorKey)).toContain('text-center');
    },
  );

  it('right-aligns the cost header with its cell', () => {
    expect(metaClassName('cost')).toContain('text-right');
  });
});
