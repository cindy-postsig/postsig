import { toValidation } from '@/lib/v2/invoices/validation';

describe('toValidation', () => {
  it('marks everything unmatched when there is no parent contract', () => {
    const result = toValidation({});

    expect(result.serviceOrderAvailable).toBe(false);
    expect(result.amountMatch).toBe(true);
    expect(result.frequencyMatch).toBe(true);
    expect(result.productsMatch).toBe(true);
    expect(result.discrepancyCount).toBe(1);
  });

  it('reports no discrepancies when everything matches', () => {
    const result = toValidation({
      parentContract: { id: 1, order_number: 'SO-1' },
      discrepancy: 0,
      frequencyAligned: true,
      hasUnmatchedProducts: false,
    });

    expect(result.discrepancyCount).toBe(0);
    expect(result.amountMatch).toBe(true);
    expect(result.frequencyMatch).toBe(true);
    expect(result.productsMatch).toBe(true);
    expect(result.serviceOrderAvailable).toBe(true);
    expect(result.serviceOrderLabel).toBe('SO-1');
  });

  it('ignores a sub-cent discrepancy from prorating arithmetic', () => {
    const result = toValidation({
      parentContract: { id: 1 },
      discrepancy: 0.001,
      frequencyAligned: true,
      hasUnmatchedProducts: false,
    });

    expect(result.amountMatch).toBe(true);
    expect(result.discrepancyCount).toBe(0);
  });

  it('counts a real amount mismatch as a discrepancy', () => {
    const result = toValidation({
      parentContract: { id: 1 },
      discrepancy: 150,
      difference: 12.5,
      expectedInvoiceAmount: 1200,
      invoiceAmount: 1350,
      frequencyAligned: true,
      hasUnmatchedProducts: false,
    });

    expect(result.amountMatch).toBe(false);
    expect(result.amountDifference).toBe(150);
    expect(result.amountDifferencePercent).toBe(12.5);
    expect(result.expectedAmount).toBe(1200);
    expect(result.invoiceAmount).toBe(1350);
    expect(result.discrepancyCount).toBe(1);
  });

  it('passes through the base-currency discrepancy alongside the native one', () => {
    // A foreign-currency invoice: the native discrepancy and its base-currency
    // conversion (at the invoice-date FX rate) are different numbers.
    const result = toValidation({
      parentContract: { id: 1 },
      discrepancy: 150,
      discrepancyBase: 165,
      frequencyAligned: true,
      hasUnmatchedProducts: false,
    });

    expect(result.amountDifference).toBe(150);
    expect(result.amountDifferenceBase).toBe(165);
  });

  it('defaults the base-currency discrepancy to 0 when absent', () => {
    const result = toValidation({});

    expect(result.amountDifferenceBase).toBe(0);
  });

  it('counts every mismatched dimension independently', () => {
    const result = toValidation({
      parentContract: { id: 1 },
      discrepancy: 150,
      frequencyAligned: false,
      hasUnmatchedProducts: true,
    });

    expect(result.amountMatch).toBe(false);
    expect(result.frequencyMatch).toBe(false);
    expect(result.productsMatch).toBe(false);
    expect(result.serviceOrderAvailable).toBe(true);
    expect(result.discrepancyCount).toBe(3);
  });
});
