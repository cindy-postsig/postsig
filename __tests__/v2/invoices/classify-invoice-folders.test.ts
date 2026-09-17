import { classifyInvoiceFolders } from '@/lib/v2/invoices/service';

describe('classifyInvoiceFolders', () => {
  it('classifies a declined or void invoice as disputed when not discrepant', () => {
    expect(classifyInvoiceFolders('declined', false)).toEqual(
      new Set(['disputed']),
    );
    expect(classifyInvoiceFolders('void', false)).toEqual(
      new Set(['disputed']),
    );
  });

  it('classifies an approved or paid invoice as approved when not discrepant', () => {
    expect(classifyInvoiceFolders('approved', false)).toEqual(
      new Set(['approved']),
    );
    expect(classifyInvoiceFolders('paid', false)).toEqual(
      new Set(['approved']),
    );
  });

  it('classifies an invoice in review as awaiting review when not discrepant', () => {
    expect(classifyInvoiceFolders('review', false)).toEqual(
      new Set(['awaiting-review']),
    );
  });

  it('does not classify an incomplete invoice into any folder when not discrepant', () => {
    expect(classifyInvoiceFolders('incomplete', false)).toEqual(new Set());
  });

  it('classifies a missing status as awaiting review when not discrepant, matching the app-wide default', () => {
    expect(classifyInvoiceFolders(null, false)).toEqual(
      new Set(['awaiting-review']),
    );
    expect(classifyInvoiceFolders(undefined, false)).toEqual(
      new Set(['awaiting-review']),
    );
  });

  it('adds potential discrepancies on top of the status folder for a still-open invoice', () => {
    expect(classifyInvoiceFolders('declined', true)).toEqual(
      new Set(['disputed', 'potential-overbilling']),
    );
    expect(classifyInvoiceFolders('review', true)).toEqual(
      new Set(['awaiting-review', 'potential-overbilling']),
    );
  });

  it('classifies a discrepant invoice with no status folder as just potential discrepancies', () => {
    expect(classifyInvoiceFolders('incomplete', true)).toEqual(
      new Set(['potential-overbilling']),
    );
  });

  // Matches the Invoice Discrepancies Report's own status gate: once an
  // invoice is paid, approved, or voided, a discrepancy no longer needs
  // surfacing as something still to act on.
  it('does not add potential discrepancies for a paid, approved, or voided invoice, even when discrepant', () => {
    expect(classifyInvoiceFolders('paid', true)).toEqual(new Set(['approved']));
    expect(classifyInvoiceFolders('approved', true)).toEqual(
      new Set(['approved']),
    );
    expect(classifyInvoiceFolders('void', true)).toEqual(new Set(['disputed']));
  });
});
