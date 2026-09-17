/**
 * @jest-environment jsdom
 *
 * PSK-2020: Billing Period Start/End Date, Invoice Date, and Due Date did
 * not sort chronologically and blank rows landed inconsistently. TanStack's
 * default 'auto' sortingFn samples table-core's own `rows[10:]` (meant to be
 * `rows[0:10]`) to guess a comparator; on a table this size that often
 * inspects zero rows and falls back to `basic`, which compares a null date
 * against a string with `>`/`<` — neither `<` nor `>` nor `===` holds either
 * way, so the sort is non-transitive and blanks end up wherever the sort
 * algorithm happens to leave them. These columns now normalize null to
 * undefined and set `sortUndefined: 'last'` (the same convention already
 * used by ProductExplorerTable's nullable columns), which routes any
 * comparison involving a blank around the sortingFn entirely and pins it
 * last regardless of direction — leaving only real date-vs-date
 * comparisons for the default comparator, which it already handles fine.
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
import { row } from './invoice-row-fixtures';

// More than 10 rows, and every row past index 10 has a null termEndDate —
// exactly the shape that made TanStack's rows[10:] sample see no strings at
// all and fall back to `basic`, the buggy path this fix removes.
const ROWS: InvoiceRow[] = [
  ...Array.from({ length: 10 }, (_, i) =>
    row({
      vendor: `Filler ${i}`,
      termEndDate: `2026-0${(i % 9) + 1}-01`,
    }),
  ),
  row({ vendor: 'Row Late', termEndDate: '2026-12-01' }),
  row({ vendor: 'Row Blank', termEndDate: null }),
  row({ vendor: 'Row Early', termEndDate: '2026-01-15' }),
];

const renderTable = () =>
  render(<InvoicesTable rows={ROWS} showDateFilter={false} />);

const vendorOrder = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).queryAllByRole('cell')[0]?.textContent?.trim());

const header = (name: string) => screen.getByRole('button', { name });

describe('InvoicesTable date column sorting', () => {
  it('sorts Billing Period End Date chronologically with blanks last, ascending', () => {
    renderTable();
    fireEvent.click(header('Billing Period End Date'));
    const order = vendorOrder();
    expect(order.indexOf('Row Early')).toBeLessThan(order.indexOf('Row Late'));
    expect(order.indexOf('Row Blank')).toBe(order.length - 1);
  });

  it('keeps blanks last even when reversed to descending', () => {
    renderTable();
    const endDate = header('Billing Period End Date');
    fireEvent.click(endDate);
    fireEvent.click(endDate);
    const order = vendorOrder();
    expect(order.indexOf('Row Late')).toBeLessThan(order.indexOf('Row Early'));
    expect(order.indexOf('Row Blank')).toBe(order.length - 1);
  });
});
