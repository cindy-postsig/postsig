/**
 * @jest-environment jsdom
 *
 * An invoice with no executionDate was silently dropped from the table (and
 * the stat-tile card, which shares this same predicate shape) any time a
 * date filter evaluated it — even under "All Time", which is supposed to
 * mean no date restriction at all. That made the sidebar's unfiltered count
 * disagree with what the table and cards actually showed for the exact same
 * folder. Fixed by skipping the executionDate check entirely once the
 * period is 'all'.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

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

function row(overrides: Partial<InvoiceRow> & { vendor: string }): InvoiceRow {
  return {
    id: overrides.vendor,
    currency: 'USD',
    recordedAmount: 0,
    product: [],
    tags: [],
    dueDate: null,
    validation: undefined,
    termStartDate: null,
    termEndDate: null,
    executionDate: null,
    ...overrides,
  } as unknown as InvoiceRow;
}

const ROWS: InvoiceRow[] = [
  row({ vendor: 'Dated Invoice', executionDate: new Date().toISOString() }),
  row({ vendor: 'No Execution Date', executionDate: null }),
];

describe('InvoicesTable under All Time with a missing executionDate', () => {
  it('excludes the undated invoice under a real date window (Current FY)', () => {
    render(<InvoicesTable rows={ROWS} />);

    expect(screen.queryByText('Dated Invoice')).toBeTruthy();
    expect(screen.queryByText('No Execution Date')).toBeNull();
  });

  it('includes the undated invoice once the filter is set to All Time', () => {
    render(<InvoicesTable rows={ROWS} />);

    fireEvent.click(screen.getByRole('button', { name: 'Date range' }));
    fireEvent.click(screen.getByRole('radio', { name: 'All Time' }));

    expect(screen.queryByText('Dated Invoice')).toBeTruthy();
    expect(screen.queryByText('No Execution Date')).toBeTruthy();
  });
});
