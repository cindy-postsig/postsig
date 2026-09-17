/**
 * @jest-environment jsdom
 *
 * PSK-2020: archived invoices with no linked Service Order showed a Billed
 * Amount of 0 — recordedAmount is always null on the archived (unstamped)
 * path, and validation.invoiceAmount comes back a hardcoded 0 when there's
 * no parent contract to validate against, so the old two-tier fallback
 * bottomed out at 0 instead of the invoice's own price-history amount.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

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

import { InvoicesTable } from '@/components/invoices/InvoicesTable';
import { row, validation } from './invoice-row-fixtures';

const billedAmountCells = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.querySelectorAll('td')[3]?.textContent?.trim());

describe('InvoicesTable Billed Amount fallback', () => {
  it('falls back to currentBudget when there is no linked Service Order', () => {
    render(
      <InvoicesTable
        rows={[
          row({
            vendor: 'No SO Co',
            recordedAmount: null,
            currentBudget: 4200,
            validation: validation({
              serviceOrderAvailable: false,
              invoiceAmount: 0,
            }),
          }),
        ]}
        showDateFilter={false}
      />,
    );
    expect(billedAmountCells()).toEqual(['$4,200']);
  });

  it('still uses validation.invoiceAmount when a Service Order is linked', () => {
    render(
      <InvoicesTable
        rows={[
          row({
            vendor: 'Linked Co',
            recordedAmount: null,
            currentBudget: 9999,
            validation: validation({
              serviceOrderAvailable: true,
              invoiceAmount: 1500,
            }),
          }),
        ]}
        showDateFilter={false}
      />,
    );
    expect(billedAmountCells()).toEqual(['$1,500']);
  });

  it('prefers recordedAmount when the row was stamped by the engine', () => {
    render(
      <InvoicesTable
        rows={[
          row({
            vendor: 'Active Co',
            recordedAmount: 250,
            currentBudget: 9999,
            validation: validation({
              serviceOrderAvailable: false,
              invoiceAmount: 0,
            }),
          }),
        ]}
        showDateFilter={false}
      />,
    );
    expect(billedAmountCells()).toEqual(['$250']);
  });
});
