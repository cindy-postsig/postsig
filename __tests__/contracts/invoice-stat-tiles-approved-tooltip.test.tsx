/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import InvoiceStatTiles from '@/app/(app)/(cpm)/invoices/InvoiceStatTiles';
import type { InvoiceRow } from '@/components/invoices/InvoicesTable';

function row(overrides: Partial<InvoiceRow> & { id: string }): InvoiceRow {
  return {
    currency: 'USD',
    recordedAmountUSD: 100,
    invoiceStatus: 'approved',
    validation: undefined,
    ...overrides,
  } as unknown as InvoiceRow;
}

const ROWS: InvoiceRow[] = [row({ id: '1', invoiceStatus: 'approved' })];

describe('InvoiceStatTiles Approved tile', () => {
  it('shows an info tooltip explaining paid invoices are included', async () => {
    render(<InvoiceStatTiles rows={ROWS} currency="USD" activeFolder="all" />);

    fireEvent.focus(screen.getByLabelText('Approved Invoices info'));

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toBe(
      'Includes both approved and paid invoices.',
    );
  });

  it('does not show an info tooltip on the other tiles', () => {
    render(<InvoiceStatTiles rows={ROWS} currency="USD" activeFolder="all" />);

    expect(screen.queryByLabelText('Total Active Invoices info')).toBeNull();
    expect(screen.queryByLabelText('Awaiting Review info')).toBeNull();
  });
});
