import {
  oldestBudgetFiscalYear,
  type FiscalYearRangeRow,
} from '@/lib/v2/contracts/service';

jest.mock('@/app/lib/contracts/actions', () => ({
  fetchContractsBase: jest.fn(),
  fetchContracts: jest.fn(),
  fetchContractsById: jest.fn(),
  fetchContractsBaseForLineageAI: jest.fn(),
}));

function row(over: Partial<FiscalYearRangeRow> = {}): FiscalYearRangeRow {
  return {
    term_start_date: [{ date: '2019-04-19' }],
    vendor_id: 10,
    ai_extraction_status: 'complete',
    vendor_products_details: [{ fees: 5000 }],
    ...over,
  };
}

describe('oldestBudgetFiscalYear (fiscal-year selector lower bound)', () => {
  it('picks the earliest fee-bearing contract, not just the earliest date', () => {
    // The 2007 row is a zero-fee shell — exactly the row class that made the
    // selector offer FY2007 with nothing to show. It must not set the bound.
    const rows = [
      row({
        term_start_date: [{ date: '2007-03-01' }],
        vendor_products_details: [{ fees: 0 }],
      }),
      row({ term_start_date: [{ date: '2012-06-01' }] }),
      row(),
    ];

    expect(oldestBudgetFiscalYear(rows, 1)).toBe(2012);
  });

  it('skips failed extractions and vendor-less rows', () => {
    const rows = [
      row({
        term_start_date: [{ date: '2005-01-01' }],
        ai_extraction_status: 'ai_failed',
      }),
      row({ term_start_date: [{ date: '2006-01-01' }], vendor_id: null }),
      row({ term_start_date: [{ date: '2015-01-01' }] }),
    ];

    expect(oldestBudgetFiscalYear(rows, 1)).toBe(2015);
  });

  it('parses string fees the way the budget filter does', () => {
    const rows = [
      row({
        term_start_date: [{ date: '2010-01-01' }],
        vendor_products_details: [{ fees: '$5,000.00' }],
      }),
    ];

    expect(oldestBudgetFiscalYear(rows, 1)).toBe(2010);
  });

  it('uses the earliest parseable entry of a multi-entry term array', () => {
    const rows = [
      row({
        term_start_date: [
          { date: '2027-04-19' },
          { date: '2026-04-19' },
          { date: '2019-04-19' },
        ],
      }),
    ];

    expect(oldestBudgetFiscalYear(rows, 1)).toBe(2019);
  });

  it('returns null when no eligible row has a parseable start', () => {
    const rows = [
      row({ term_start_date: [] }),
      row({ term_start_date: null }),
      row({
        term_start_date: [{ date: '2007-01-01' }],
        vendor_products_details: [],
      }),
    ];

    expect(oldestBudgetFiscalYear(rows, 1)).toBeNull();
  });

  it('buckets by the org fiscal year, not the calendar year', () => {
    // April-start org: Feb 2007 sits in the FY that STARTED in 2006.
    const rows = [row({ term_start_date: [{ date: '2007-02-15' }] })];

    expect(oldestBudgetFiscalYear(rows, 4)).toBe(2006);
  });
});
