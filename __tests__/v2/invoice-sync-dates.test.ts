import { parseProviderDate } from '@/lib/v2/integrations/invoice-sync/dates';
import {
  mapRampInvoiceToContract,
  mapXeroInvoiceToContract,
} from '@/lib/v2/integrations/invoice-sync/transforms';
import { planInvoiceDateRepair } from '@/scripts/repair-invoice-sync-dates';

describe('parseProviderDate', () => {
  it('converts a Xero .NET date to its UTC calendar date', () => {
    // 2026-06-04T00:00:00Z
    expect(parseProviderDate('/Date(1780531200000+0000)/')).toBe('2026-06-04');
    expect(parseProviderDate('/Date(1780531200000)/')).toBe('2026-06-04');
    expect(parseProviderDate('/Date(1780531200000-0500)/')).toBe('2026-06-04');
  });

  it('keeps an ISO calendar date verbatim, ignoring any time part', () => {
    expect(parseProviderDate('2026-06-04')).toBe('2026-06-04');
    expect(parseProviderDate('2026-06-04T00:00:00')).toBe('2026-06-04');
    expect(parseProviderDate('2026-06-04T23:30:00Z')).toBe('2026-06-04');
  });

  it('returns null for missing or unrecognised values', () => {
    expect(parseProviderDate(null)).toBeNull();
    expect(parseProviderDate(undefined)).toBeNull();
    expect(parseProviderDate('')).toBeNull();
    expect(parseProviderDate('June 4, 2026')).toBeNull();
    expect(parseProviderDate('2026-13-45')).toBeNull();
    expect(parseProviderDate('/Date(abc)/')).toBeNull();
  });

  // Date parsing rolls an overflow forward (Feb 31 -> Mar 3) instead of
  // rejecting it; a rolled date must not reach a date column as the original.
  it('rejects a calendar-date overflow rather than normalising it', () => {
    expect(parseProviderDate('2026-02-31')).toBeNull();
    expect(parseProviderDate('2026-02-31T00:00:00Z')).toBeNull();
    expect(parseProviderDate('2026-04-31')).toBeNull();
    expect(parseProviderDate('2028-02-29')).toBe('2028-02-29');
  });
});

describe('invoice-sync date mapping', () => {
  it('maps a Xero invoice date and due date onto the contracts date columns', () => {
    const mapped = mapXeroInvoiceToContract({
      InvoiceID: 'inv-1',
      InvoiceNumber: 'INV-0001',
      Type: 'ACCPAY',
      Status: 'SUBMITTED',
      Date: '/Date(1780531200000+0000)/',
      DueDate: '/Date(1783123200000+0000)/',
      CurrencyCode: 'USD',
      AmountDue: 10,
      AmountPaid: 0,
      Total: 10,
      SubTotal: 10,
    });
    expect(mapped.execution_date).toBe('2026-06-04');
    expect(mapped.due_date).toBe('2026-07-04');
    expect(mapped.term_start_date).toEqual([{ date: '2026-06-04' }]);
    // The provider has no billing period; a due date is not one.
    expect(mapped.term_end_date).toBeNull();
  });

  it('maps Ramp ISO dates and nulls a missing due date', () => {
    const mapped = mapRampInvoiceToContract({
      id: 'bill-1',
      invoice_date: '2026-06-04',
      currency_code: 'USD',
      amount: 10,
    });
    expect(mapped.execution_date).toBe('2026-06-04');
    expect(mapped.due_date).toBeNull();
    expect(mapped.term_start_date).toEqual([{ date: '2026-06-04' }]);
    expect(mapped.term_end_date).toBeNull();
  });
});

describe('planInvoiceDateRepair', () => {
  const base = {
    id: 1,
    execution_date: null,
    due_date: null,
    term_start_date: null,
    term_end_date: null,
  };

  it('skips rows with nothing to repair', () => {
    expect(planInvoiceDateRepair(base)).toEqual({ kind: 'skip' });
    expect(
      planInvoiceDateRepair({
        ...base,
        execution_date: '2026-06-04',
        due_date: '2026-07-04',
        term_start_date: [{ date: '2026-06-04' }],
      }),
    ).toEqual({ kind: 'skip' });
  });

  it('parses Xero start/end objects onto the date columns, copying only the invoice date into a term column', () => {
    expect(
      planInvoiceDateRepair({
        ...base,
        term_start_date: { start: '/Date(1780531200000+0000)/' },
        term_end_date: { end: '/Date(1783123200000+0000)/' },
      }),
    ).toEqual({
      kind: 'update',
      update: {
        execution_date: '2026-06-04',
        term_start_date: [{ date: '2026-06-04' }],
        due_date: '2026-07-04',
        term_end_date: null,
      },
    });
  });

  it('restores a missing term-start copy from execution_date', () => {
    expect(
      planInvoiceDateRepair({
        ...base,
        execution_date: '2026-06-04',
        due_date: '2026-06-25',
      }),
    ).toEqual({
      kind: 'update',
      update: { term_start_date: [{ date: '2026-06-04' }] },
    });
  });

  it('clears a term end that is exactly the due-date copy an earlier run wrote', () => {
    expect(
      planInvoiceDateRepair({
        ...base,
        execution_date: '2026-06-04',
        due_date: '2026-06-25',
        term_start_date: [{ date: '2026-06-04' }],
        term_end_date: [{ date: '2026-06-25' }],
      }),
    ).toEqual({ kind: 'update', update: { term_end_date: null } });
  });

  it('leaves a hand-entered billing period end alone', () => {
    expect(
      planInvoiceDateRepair({
        ...base,
        execution_date: '2026-06-04',
        due_date: '2026-06-25',
        term_start_date: [{ date: '2026-06-04' }],
        term_end_date: [{ date: '2027-06-03' }],
      }),
    ).toEqual({ kind: 'skip' });
    expect(
      planInvoiceDateRepair({
        ...base,
        execution_date: '2026-06-04',
        term_start_date: [{ date: '2026-06-04' }],
        term_end_date: [{ date: '2026-06-25' }, { date: '2027-06-25' }],
      }),
    ).toEqual({ kind: 'skip' });
  });

  it('never overwrites a date column that already holds a value', () => {
    expect(
      planInvoiceDateRepair({
        ...base,
        execution_date: '2026-01-01',
        due_date: '2026-02-01',
        term_start_date: { start: '/Date(1780531200000+0000)/' },
        term_end_date: { end: '/Date(1783123200000+0000)/' },
      }),
    ).toEqual({
      kind: 'update',
      update: {
        term_start_date: [{ date: '2026-01-01' }],
        term_end_date: null,
      },
    });
  });

  it('clears an object that holds no string without inventing a date', () => {
    expect(
      planInvoiceDateRepair({ ...base, term_start_date: { start: null } }),
    ).toEqual({ kind: 'update', update: { term_start_date: null } });
    expect(
      planInvoiceDateRepair({ ...base, term_end_date: { end: null } }),
    ).toEqual({ kind: 'update', update: { term_end_date: null } });
  });

  it('leaves a row untouched when a term column holds a bare scalar', () => {
    expect(
      planInvoiceDateRepair({
        ...base,
        term_start_date: 'legacy-date',
        term_end_date: { end: '2026-07-04' },
      }),
    ).toEqual({ kind: 'unsupported', raw: ['"legacy-date"'] });
    expect(planInvoiceDateRepair({ ...base, term_end_date: 20260704 })).toEqual(
      { kind: 'unsupported', raw: ['20260704'] },
    );
  });

  it('leaves a row untouched when a provider value cannot be parsed', () => {
    expect(
      planInvoiceDateRepair({
        ...base,
        term_start_date: { start: 'June 4, 2026' },
        term_end_date: { end: '2026-07-04' },
      }),
    ).toEqual({ kind: 'unparseable', raw: ['June 4, 2026'] });
  });
});
