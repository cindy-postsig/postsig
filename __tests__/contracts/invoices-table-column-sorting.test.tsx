/**
 * @jest-environment jsdom
 *
 * PSK-997 follow-up: several InvoicesTable columns (Product, Invoice
 * Validation, Due Date, Tags, Status) rendered a clickable sort header via
 * ColumnHeader but had no accessorKey/accessorFn, so TanStack had no value
 * to sort by — clicking them was a no-op (same order every time, asc or
 * desc). Vendor/Invoice #/dates/Amount already had accessors and always
 * worked; this covers the columns that didn't.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

jest.mock('@/components/vendors/VendorIcon', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/contracts/columns', () => ({
  InvoiceStatusCell: () => null,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

import {
  InvoicesTable,
  type InvoiceRow,
} from '@/components/invoices/InvoicesTable';
import { row, validation } from './invoice-row-fixtures';

// Ordered A/B/C by vendor name only so the initial (vendor-ascending) render
// is stable and predictable — the value under test always varies per column.
const ROWS: InvoiceRow[] = [
  row({
    vendor: 'Row A',
    product: [],
    tags: [{ id: 1, name: 'Zeta' } as never],
    invoiceStatus: 'paid',
    dueDate: '2026-08-20',
    validation: validation({ discrepancyCount: 1 }),
  }),
  row({
    vendor: 'Row B',
    product: [{ vendor_products: { name: 'Beta Product' } } as never],
    tags: [{ id: 2, name: 'Alpha' } as never],
    invoiceStatus: 'review',
    dueDate: '2026-08-01',
    validation: validation({ discrepancyCount: 2 }),
  }),
  row({
    vendor: 'Row C',
    product: [{ vendor_products: { name: 'Alpha Product' } } as never],
    tags: [],
    invoiceStatus: 'approved',
    dueDate: '2026-08-10',
    validation: undefined,
  }),
];

// Date filter defaults to the last 90 days by executionDate — irrelevant to
// sorting, and the fixture dates would fall outside a real "today" window.
const renderTable = () =>
  render(<InvoicesTable rows={ROWS} showDateFilter={false} />);

const vendorOrder = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).queryAllByRole('cell')[0]?.textContent?.trim());

const header = (name: string) => screen.getByRole('button', { name });

describe('InvoicesTable column sorting', () => {
  it('sorts by Product even though the cell has no product accessorKey', () => {
    renderTable();
    fireEvent.click(header('Product'));
    // '' (Row A, no products) < 'Alpha Product' (Row C) < 'Beta Product' (Row B)
    expect(vendorOrder()).toEqual(['Row A', 'Row C', 'Row B']);
  });

  it('sorts by Invoice Validation discrepancy count', () => {
    renderTable();
    fireEvent.click(header('Invoice Validation'));
    // No validation (Row C) sorts first, then ascending discrepancy count
    expect(vendorOrder()).toEqual(['Row C', 'Row A', 'Row B']);
  });

  it('sorts by Due Date', () => {
    renderTable();
    fireEvent.click(header('Due Date'));
    expect(vendorOrder()).toEqual(['Row B', 'Row C', 'Row A']);
  });

  it('sorts by Tags', () => {
    renderTable();
    fireEvent.click(header('Tags'));
    // '' (Row C, no tags) < 'Alpha' (Row B) < 'Zeta' (Row A)
    expect(vendorOrder()).toEqual(['Row C', 'Row B', 'Row A']);
  });

  it('sorts by Status using the displayed label, not the raw status code', () => {
    renderTable();
    fireEvent.click(header('Status'));
    // 'Approved' (Row C) < 'In Review' (Row B) < 'Paid' (Row A)
    expect(vendorOrder()).toEqual(['Row C', 'Row B', 'Row A']);
  });

  it('reverses order on a second click instead of repeating the same order', () => {
    renderTable();
    const dueDate = header('Due Date');

    fireEvent.click(dueDate);
    const ascending = vendorOrder();

    fireEvent.click(dueDate);
    const descending = vendorOrder();

    expect(descending).toEqual([...ascending].reverse());
  });
});
