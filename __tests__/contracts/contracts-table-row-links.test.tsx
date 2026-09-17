/**
 * @jest-environment jsdom
 *
 * Row links must never be prefetched: on a grouped contracts list Next fires a
 * server render per visible row, and vendor group rows used to point at
 * /contracts/vendor-<id>, prefetching a 404 for every vendor on the page.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import type { ContractTableRow } from '@/lib/v2/core/types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    prefetch,
    children,
  }: {
    href: string;
    prefetch?: boolean;
    children: React.ReactNode;
  }) => (
    <a href={href} data-prefetch={String(prefetch)}>
      {children}
    </a>
  ),
}));

jest.mock('@/components/vendors/VendorIcon', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/contracts/ContractReplacementIndicator', () => ({
  __esModule: true,
  default: () => null,
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
// none of which these cells touch. Stubbed to the one helper they import.
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

const contractRow = {
  id: 7,
  vendor: 'Acme',
  vendorId: '3',
  vendorDomain: 'acme.com',
  contractStatus: 4,
  aiExtractionStatus: 'h_success',
  orderNumber: 'SO-1',
  product: [{ vendor_products: { id: 11, name: 'Acme Cloud' } }],
} as unknown as ContractTableRow;

const vendorGroupRow = {
  id: 'vendor-3',
  contract_id: 'vendor-3',
  vendor: 'Acme',
  vendorId: '3',
  vendorDomain: 'acme.com',
  contractStatus: 0,
  aiExtractionStatus: '',
  isGroup: true,
  product: [],
} as unknown as ContractTableRow;

const reportSubRow = {
  id: 'report-dora-7',
  contract_id: 7,
  isReportRow: true,
  vendor: 'Acme',
  vendorId: '3',
  vendorDomain: 'acme.com',
  product: [{ vendor_products: { id: 11, name: 'Acme Cloud' } }],
} as unknown as ContractTableRow;

const renderCell = (columnId: string, original: ContractTableRow) => {
  const column = (columns as ColumnDef<ContractTableRow>[]).find(
    (c) =>
      (c as { accessorKey?: string }).accessorKey === columnId ||
      c.id === columnId,
  );
  if (!column?.cell || typeof column.cell !== 'function') {
    throw new Error(`No renderable cell for column ${columnId}`);
  }

  const context = {
    row: {
      original,
      depth: 0,
      subRows: [],
      id: String(original.id),
      getIsExpanded: () => false,
      toggleExpanded: jest.fn(),
    },
    table: { options: { meta: { groupByVendor: true } } },
  };

  const { container } = render(<>{column.cell(context as never)}</>);
  return Array.from(container.querySelectorAll('a'));
};

describe.each(['vendor', 'vendorAndProduct', 'product'])(
  'the %s column',
  (columnId) => {
    it('opts every contract row link out of prefetching', () => {
      const anchors = renderCell(columnId, contractRow);

      expect(anchors.length).toBeGreaterThan(0);
      anchors.forEach((anchor) => {
        expect(anchor.getAttribute('data-prefetch')).toBe('false');
      });
    });
  },
);

// vendorAndProduct is excluded: no view pairs it with groupByVendor, so it
// never receives a group row.
describe.each(['vendor', 'product'])(
  'the %s column on a vendor group row',
  (columnId) => {
    it('never links the group at a contract url', () => {
      const anchors = renderCell(columnId, vendorGroupRow);

      anchors.forEach((anchor) => {
        expect(anchor.getAttribute('href')).not.toMatch(/^\/contracts\//);
        expect(anchor.getAttribute('data-prefetch')).toBe('false');
      });
    });
  },
);

it('never links a report sub-row at a contract url, but keeps its name visible', () => {
  const anchors = renderCell('product', reportSubRow);

  anchors.forEach((anchor) => {
    expect(anchor.getAttribute('href')).not.toMatch(/^\/contracts\//);
  });
  expect(screen.getByText('Acme Cloud').tagName).toBe('SPAN');
});

it('keeps the vendor group name visible without a contract link', () => {
  renderCell('product', {
    ...vendorGroupRow,
    product: [{ vendor_products: { id: 11, name: 'Acme Cloud' } }],
  } as unknown as ContractTableRow);

  expect(screen.getByText('Acme Cloud').tagName).toBe('SPAN');
});
