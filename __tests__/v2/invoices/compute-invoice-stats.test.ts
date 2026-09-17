import {
  computeInvoiceStats,
  type InvoiceStatsRow,
} from '@/lib/v2/invoices/folders';
import type { InvoiceValidation } from '@/lib/v2/invoices/validation';

const validation = (
  overrides: Partial<InvoiceValidation> = {},
): InvoiceValidation => ({
  discrepancyCount: 0,
  amountMatch: true,
  amountDifference: 0,
  amountDifferenceBase: 0,
  amountDifferencePercent: 0,
  expectedAmount: 0,
  invoiceAmount: 0,
  frequencyMatch: true,
  parentBillingFrequency: 'Monthly',
  invoiceBillingFrequency: 'Monthly',
  serviceOrderAvailable: true,
  productsMatch: true,
  matchedProducts: [],
  ...overrides,
});

const row = (overrides: Partial<InvoiceStatsRow> = {}): InvoiceStatsRow => ({
  invoiceStatus: 'review',
  recordedAmountUSD: 100,
  ...overrides,
});

describe('computeInvoiceStats', () => {
  it('buckets each row into its status folder and sums the total', () => {
    const stats = computeInvoiceStats([
      row({ invoiceStatus: 'review', recordedAmountUSD: 100 }),
      row({ invoiceStatus: 'paid', recordedAmountUSD: 50 }),
      row({ invoiceStatus: 'declined', recordedAmountUSD: 25 }),
    ]);

    expect(stats.all).toEqual({ amount: 175, count: 3 });
    expect(stats.awaitingReview).toEqual({ amount: 100, count: 1 });
    expect(stats.approved).toEqual({ amount: 50, count: 1 });
    expect(stats.disputed).toEqual({ amount: 25, count: 1 });
  });

  it('counts an overbilled, still-open invoice toward Potential Discrepancies in addition to its status folder', () => {
    const stats = computeInvoiceStats([
      row({
        invoiceStatus: 'review',
        recordedAmountUSD: 200,
        validation: validation({
          amountMatch: false,
          amountDifference: 30,
          amountDifferenceBase: 33,
        }),
      }),
    ]);

    expect(stats.awaitingReview).toEqual({ amount: 200, count: 1 });
    expect(stats.potentialDiscrepancies).toEqual({ amount: 33, count: 1 });
  });

  it('counts an underbilled invoice toward Potential Discrepancies too, as an unsigned magnitude', () => {
    const stats = computeInvoiceStats([
      row({
        invoiceStatus: 'review',
        validation: validation({
          amountMatch: false,
          amountDifference: -30,
          amountDifferenceBase: -33,
        }),
      }),
    ]);

    expect(stats.potentialDiscrepancies).toEqual({ amount: 33, count: 1 });
  });

  it('does not count a discrepancy once the invoice is paid, approved, or voided', () => {
    const discrepant = validation({
      amountMatch: false,
      amountDifference: 30,
      amountDifferenceBase: 33,
    });
    const stats = computeInvoiceStats([
      row({ invoiceStatus: 'paid', validation: discrepant }),
      row({ invoiceStatus: 'approved', validation: discrepant }),
      row({ invoiceStatus: 'void', validation: discrepant }),
    ]);

    expect(stats.potentialDiscrepancies).toEqual({ amount: 0, count: 0 });
  });

  it('still counts a discrepancy on a declined invoice', () => {
    const stats = computeInvoiceStats([
      row({
        invoiceStatus: 'declined',
        validation: validation({
          amountMatch: false,
          amountDifference: 30,
          amountDifferenceBase: 33,
        }),
      }),
    ]);

    expect(stats.disputed).toEqual({ amount: 100, count: 1 });
    expect(stats.potentialDiscrepancies).toEqual({ amount: 33, count: 1 });
  });

  it('treats a missing invoiceStatus as awaiting review, and a missing amount as zero', () => {
    const stats = computeInvoiceStats([
      row({ invoiceStatus: null, recordedAmountUSD: null }),
    ]);

    expect(stats.awaitingReview).toEqual({ amount: 0, count: 1 });
    expect(stats.all).toEqual({ amount: 0, count: 1 });
  });

  it('returns all-zero stats for an empty row set', () => {
    const stats = computeInvoiceStats([]);

    expect(stats.all).toEqual({ amount: 0, count: 0 });
    expect(stats.potentialDiscrepancies).toEqual({ amount: 0, count: 0 });
  });
});
