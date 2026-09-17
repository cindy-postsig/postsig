import {
  DEFAULT_INVOICE_STATUS,
  resolveDefaultInvoiceStatus,
} from '@/constants/invoiceStatus';

describe('resolveDefaultInvoiceStatus', () => {
  it('defaults to review when any invoice is in review', () => {
    expect(resolveDefaultInvoiceStatus(['paid', 'review', 'approved'])).toBe(
      DEFAULT_INVOICE_STATUS,
    );
  });

  it('treats a missing status as review', () => {
    expect(resolveDefaultInvoiceStatus(['paid', null])).toBe(
      DEFAULT_INVOICE_STATUS,
    );
    expect(resolveDefaultInvoiceStatus(['paid', undefined])).toBe(
      DEFAULT_INVOICE_STATUS,
    );
  });

  it('falls back to all when no invoice is in review', () => {
    expect(resolveDefaultInvoiceStatus(['paid', 'approved', 'void'])).toBe(
      'all',
    );
  });

  it('falls back to all when there are no invoices', () => {
    expect(resolveDefaultInvoiceStatus([])).toBe('all');
  });
});
