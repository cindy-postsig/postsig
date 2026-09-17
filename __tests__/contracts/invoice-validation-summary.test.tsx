/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import InvoiceValidationSummary from '@/components/contracts/InvoiceValidationSummary';
import type { InvoiceValidation } from '@/lib/v2/invoices/validation';
import type { MatchedInvoiceProduct } from '@/app/lib/definitions';

const matchedProduct = (
  overrides: Partial<MatchedInvoiceProduct>,
): MatchedInvoiceProduct => ({
  id: String(overrides.id ?? '1'),
  product_id: 1,
  product_name: 'Product',
  parent_fee: 100,
  invoice_fee: 100,
  expectedInvoiceAmount: 100,
  adjustedParentAmount: 100,
  adjustedInvoiceAmount: 100,
  invoiceBillingFrequency: 'Monthly',
  parentBillingFrequency: 'Monthly',
  difference: 0,
  discrepancy: 0,
  frequencyAligned: true,
  frequencyMultiplier: 1,
  invoiceFreqMultiplier: 1,
  parentProduct: null,
  invoiceProduct: null,
  ...overrides,
});

const baseValidation: InvoiceValidation = {
  discrepancyCount: 0,
  amountMatch: true,
  amountDifference: 0,
  amountDifferenceBase: 0,
  amountDifferencePercent: 0,
  expectedAmount: 1000,
  invoiceAmount: 1000,
  frequencyMatch: true,
  parentBillingFrequency: 'Monthly',
  invoiceBillingFrequency: 'Monthly',
  serviceOrderAvailable: true,
  productsMatch: true,
  matchedProducts: [],
};

describe('InvoiceValidationSummary', () => {
  it('surfaces offsetting per-product discrepancies even though the net amount matches', () => {
    const validation: InvoiceValidation = {
      ...baseValidation,
      matchedProducts: [
        matchedProduct({
          id: '1',
          product_name: 'Product A',
          adjustedParentAmount: 100,
          adjustedInvoiceAmount: 150,
          discrepancy: 50,
          difference: 50,
        }),
        matchedProduct({
          id: '2',
          product_name: 'Product B',
          adjustedParentAmount: 100,
          adjustedInvoiceAmount: 50,
          discrepancy: -50,
          difference: -50,
        }),
      ],
    };

    render(<InvoiceValidationSummary validation={validation} currency="USD" />);

    expect(screen.getByText('1 Discrepancy')).toBeTruthy();
    expect(screen.getByText('Price Per Unit')).toBeTruthy();
    expect(screen.getByText('Product A')).toBeTruthy();
    expect(screen.getByText('Product B')).toBeTruthy();
  });

  it('shows no discrepancy badge when everything genuinely matches', () => {
    render(
      <InvoiceValidationSummary validation={baseValidation} currency="USD" />,
    );

    expect(screen.queryByText(/Discrepanc/)).toBeNull();
  });

  it('renders the discrepancy in the invoice/parent currency, not a hardcoded USD default', () => {
    const validation: InvoiceValidation = {
      ...baseValidation,
      amountMatch: false,
      amountDifference: 150,
      amountDifferenceBase: 165,
      amountDifferencePercent: 12.5,
      discrepancyCount: 1,
    };

    render(<InvoiceValidationSummary validation={validation} currency="EUR" />);

    // Shown twice: the summary tile and the discrepancy table row.
    expect(screen.getAllByText('+€150 (+12.50%)')).toHaveLength(2);
    expect(screen.queryByText(/\$150/)).toBeNull();
  });

  it('colors an overbilled amount red', () => {
    const validation: InvoiceValidation = {
      ...baseValidation,
      amountMatch: false,
      amountDifference: 150,
      amountDifferencePercent: 15,
      discrepancyCount: 1,
    };

    render(<InvoiceValidationSummary validation={validation} currency="USD" />);

    // Shown twice: the summary tile and the discrepancy table row.
    const amounts = screen.getAllByText('+$150 (+15.00%)');
    expect(amounts).toHaveLength(2);
    amounts.forEach((el) => expect(el.style.color).toBe('rgb(204, 0, 63)'));
  });

  it('colors an underbilled amount green even though the tile around it stays red', () => {
    const validation: InvoiceValidation = {
      ...baseValidation,
      amountMatch: false,
      amountDifference: -150,
      amountDifferencePercent: -15,
      discrepancyCount: 1,
    };

    render(<InvoiceValidationSummary validation={validation} currency="USD" />);

    const amounts = screen.getAllByText('-$150 (-15.00%)');
    expect(amounts).toHaveLength(2);
    amounts.forEach((el) => expect(el.style.color).toBe('rgb(0, 168, 107)'));

    // The tile's own box (border/background) still reads as a mismatch, not
    // as if everything matched.
    expect(screen.getByText('Invoice Amount Mismatch')).toBeTruthy();
  });

  it('colors an underbilled per-product discrepancy green', () => {
    const validation: InvoiceValidation = {
      ...baseValidation,
      matchedProducts: [
        matchedProduct({
          id: '1',
          product_name: 'Product A',
          adjustedParentAmount: 100,
          adjustedInvoiceAmount: 50,
          discrepancy: -50,
          difference: -50,
        }),
      ],
    };

    render(<InvoiceValidationSummary validation={validation} currency="USD" />);

    const cell = screen.getByText('-$50 (-50.00%)');
    expect(cell.style.color).toBe('rgb(0, 168, 107)');
  });

  it('says there is no data to compare, rather than claiming a match, when no Service Order is found', () => {
    const validation: InvoiceValidation = {
      ...baseValidation,
      discrepancyCount: 1,
      serviceOrderAvailable: false,
    };

    render(<InvoiceValidationSummary validation={validation} currency="USD" />);

    expect(screen.getByText('Service Order Not Found')).toBeTruthy();
    expect(screen.getByText('Invoice Amount')).toBeTruthy();
    expect(screen.getByText('Frequency')).toBeTruthy();
    expect(screen.getByText('Product Consistency')).toBeTruthy();
    expect(screen.getAllByText('No data available to compare')).toHaveLength(3);
    expect(screen.queryByText('Invoice Amount Match')).toBeNull();
    expect(screen.queryByText('Frequency Match')).toBeNull();
    expect(screen.queryByText('No Unexpected Products')).toBeNull();
    // No table: nothing was actually compared, so there's nothing to list.
    expect(screen.queryByRole('table')).toBeNull();
  });
});
