import { shouldShowInvoiceStatusFilter } from '@/lib/v2/invoices/service';

describe('shouldShowInvoiceStatusFilter', () => {
  it('hides the Status dropdown for folders pre-filtered to exactly one status', () => {
    expect(shouldShowInvoiceStatusFilter('awaiting-review')).toBe(false);
    expect(shouldShowInvoiceStatusFilter('disputed')).toBe(false);
    expect(shouldShowInvoiceStatusFilter('approved')).toBe(false);
  });

  it('hides the Status dropdown for Potential Discrepancies', () => {
    expect(shouldShowInvoiceStatusFilter('potential-overbilling')).toBe(false);
  });

  it('keeps the Status dropdown for folders that mix statuses', () => {
    expect(shouldShowInvoiceStatusFilter('all')).toBe(true);
    expect(shouldShowInvoiceStatusFilter('archived')).toBe(true);
  });
});
