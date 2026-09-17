/**
 * @jest-environment jsdom
 *
 * PSK-1947: the Invoices tab renders with reportType 'invoices-folder', not
 * 'invoices', but the product column only special-cased 'invoices' when
 * picking a renderer. A multi-product contract fell through to the standard
 * renderer, which has no expand-toggle affordance for invoice product
 * subrows — the expand control silently disappeared on that tab.
 *
 * The product column also mirrors the "All Contracts" tab's "Product +n"
 * format for multi-product rows, and renders empty for vendor-group rows
 * (multiple contracts collapsed under one vendor) — those get their expand
 * affordance from the left-hand expander column instead, since their
 * subRows are sibling contracts, not products.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

jest.mock('@/app/lib/budget', () => ({
  getProductYearLabel: () => '',
}));

jest.mock('@/components/contracts/FolderAssignmentCell', () => ({
  FolderAssignmentCell: () => null,
}));

jest.mock('@/components/contracts/UploadContractVersionButton', () => ({
  __esModule: true,
  default: () => null,
}));

import { columns } from '@/components/contracts/columns';

const CONTRACT_ID = 11;

// Shape produced by buildContractTableRows/buildProductSubRows for a
// multi-product contract: the parent row's own subRows are the per-product
// leaf rows (each carrying `vendor_products`), independent of reportType.
const multiProductRow = {
  id: String(CONTRACT_ID),
  vendor: 'Acme',
  contractStatus: 4,
  product: [{ vendor_products: { id: 1, name: 'Product A' } }],
  subRows: [
    { id: 'p1', vendor_products: { id: 1, name: 'Product A' } },
    { id: 'p2', vendor_products: { id: 2, name: 'Product B' } },
  ],
} as unknown as ContractTableRow;

// Shape produced by groupContractsByVendor for a vendor with more than one
// contract: subRows are sibling CONTRACT rows, not products.
const vendorGroupRow = {
  id: 'vendor-99',
  vendor: 'Acme',
  contractStatus: 4,
  product: [],
  subRows: [
    { id: '20', vendor: 'Acme' },
    { id: '21', vendor: 'Acme' },
  ],
} as unknown as ContractTableRow;

const renderProductCell = (
  reportType: string | undefined,
  original: ContractTableRow = multiProductRow,
) => {
  const column = (columns as ColumnDef<ContractTableRow>[]).find(
    (c) => c.id === 'product',
  );
  if (!column?.cell || typeof column.cell !== 'function') {
    throw new Error('No renderable cell for column product');
  }

  const toggleExpanded = jest.fn();
  const context = {
    row: {
      original,
      depth: 0,
      subRows: [],
      id: original.id,
      getIsExpanded: () => false,
      toggleExpanded,
    },
    table: { options: { meta: { reportType } } },
  };

  const { container } = render(<>{column.cell(context as never)}</>);
  return { toggleExpanded, container };
};

describe('product column renderer selection by reportType', () => {
  it('shows the first product name, remaining count, and expand toggle on the invoices-folder tab', () => {
    const { toggleExpanded } = renderProductCell('invoices-folder');

    expect(screen.getByText('Product A')).not.toBeNull();
    expect(screen.getByText('+1')).not.toBeNull();

    // The expand affordance itself is what PSK-1947 lost — assert it is
    // actually wired, not just that the text renders somewhere.
    const toggle = document.querySelector('svg.cursor-pointer');
    expect(toggle).not.toBeNull();
    fireEvent.click(toggle as Element);
    expect(toggleExpanded).toHaveBeenCalledTimes(1);
  });

  it('matches the existing invoices report behavior', () => {
    renderProductCell('invoices');

    expect(screen.getByText('Product A')).not.toBeNull();
    expect(screen.getByText('+1')).not.toBeNull();
    expect(document.querySelector('svg.cursor-pointer')).not.toBeNull();
  });

  it('renders an empty product cell for a vendor-group row with multiple contracts', () => {
    const { container } = renderProductCell('invoices-folder', vendorGroupRow);

    // The group's subRows are sibling contracts, not products — the product
    // column must not misread their count as a product count, and must not
    // duplicate the expand toggle the left-hand expander column already
    // shows for this row.
    expect(container.innerHTML).toBe('');
  });
});
