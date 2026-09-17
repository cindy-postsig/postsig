/**
 * @jest-environment jsdom
 *
 * The replacement flag has to appear on BOTH vendor column specs. The list view
 * picks between them by layout (`vendor` vs `vendorAndProduct`), so a flag wired
 * into only one leaves half the customer's views silently unflagged — the exact
 * regression this file guards.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import type { ContractTableRow } from '@/lib/v2/core/types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock('@/components/vendors/VendorIcon', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/contracts/ContractReplacementIndicator', () => ({
  __esModule: true,
  default: () => <span data-testid="replacement-flag" />,
}));

jest.mock('@/hooks/useContractStatusUpdate', () => ({
  useContractStatusUpdate: () => ({ updateContractStatus: jest.fn() }),
}));

jest.mock('@/hooks/useInvoiceStatusUpdate', () => ({
  useInvoiceStatusUpdate: () => ({ updateInvoiceStatus: jest.fn() }),
}));

jest.mock('@/hooks/useBaseCurrency', () => ({
  useBaseCurrency: () => ({ baseCurrency: 'USD' }),
}));

// The budget barrel reaches next/cache through currency -> redis -> data/users,
// none of which the vendor cells touch. Stubbed to the one helper they import.
jest.mock('@/app/lib/budget', () => ({
  getProductYearLabel: () => '',
}));

// Same reason: the folder cell pulls a server-only data module into the graph.
jest.mock('@/components/contracts/FolderAssignmentCell', () => ({
  FolderAssignmentCell: () => null,
}));

// Pulls filepond's stylesheet, which ts-jest cannot parse.
jest.mock('@/components/contracts/UploadContractVersionButton', () => ({
  __esModule: true,
  default: () => null,
}));

import { columns } from '@/components/contracts/columns';

const CONTRACT_ID = 7;

const row = {
  id: String(CONTRACT_ID),
  vendor: 'Acme',
  vendorId: '3',
  vendorDomain: 'acme.com',
  contractStatus: 4,
  orderNumber: 'SO-1',
  product: [],
} as unknown as ContractTableRow;

/** The minimal TanStack row/table surface these two cells read. */
const renderCell = (
  columnId: string,
  flagged: readonly number[] | undefined,
) => {
  const column = (columns as ColumnDef<ContractTableRow>[]).find(
    (c) =>
      (c as { accessorKey?: string }).accessorKey === columnId ||
      c.id === columnId,
  );
  if (!column?.cell || typeof column.cell !== 'function') {
    throw new Error(`No renderable cell for column ${columnId}`);
  }

  const context = {
    row: { original: row, depth: 0, subRows: [], id: row.id },
    table: { options: { meta: { replacementFlaggedContractIds: flagged } } },
  };

  render(<>{column.cell(context as never)}</>);
};

describe.each(['vendor', 'vendorAndProduct'])(
  'the %s column renders the replacement flag',
  (columnId) => {
    it('flags a contract carrying a verified prompt', () => {
      renderCell(columnId, [CONTRACT_ID]);

      expect(screen.queryByTestId('replacement-flag')).not.toBeNull();
    });

    it('leaves an unflagged contract clean', () => {
      renderCell(columnId, [CONTRACT_ID + 1]);

      expect(screen.queryByTestId('replacement-flag')).toBeNull();
    });

    it('leaves every row clean when no flag list was resolved', () => {
      // The list fetch failed, or the view never opted in.
      renderCell(columnId, undefined);

      expect(screen.queryByTestId('replacement-flag')).toBeNull();
    });
  },
);
