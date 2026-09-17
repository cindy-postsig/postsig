import { describe, expect, it } from '@jest/globals';

import type { ContractSpendDetail } from '@/lib/v2/chat/client';
import {
  transformToSpendTableRows,
  hasMultipleVendors,
  getSpendColumns,
  buildSpendFooterRow,
  spendColumns,
  type SpendTableRow,
  type SpendTotals,
} from '@/components/chatbot/SpendSummary';

function makeContract(
  overrides: Partial<ContractSpendDetail> = {},
): ContractSpendDetail {
  return {
    contractId: 1,
    vendorName: 'Acme Corp',
    contractType: 'SaaS',
    currency: 'USD',
    totalContractValueUSD: 100_000,
    currentBudgetUSD: 80_000,
    projectedBudgetUSD: 85_000,
    termStartDate: '2025-01-01',
    termEndDate: '2025-12-31',
    products: undefined,
    ...overrides,
  };
}

function makeRow(overrides: Partial<SpendTableRow> = {}): SpendTableRow {
  return {
    contractId: 1,
    vendorName: 'Acme Corp',
    contractType: 'SaaS',
    currentBudget: 80_000,
    projectedBudget: 85_000,
    tcv: 100_000,
    isExcludedFromTotals: false,
    ...overrides,
  };
}

const TOTALS: SpendTotals = {
  totalContractValueUSD: 200_000,
  currentBudgetUSD: 160_000,
  projectedBudgetUSD: 170_000,
};

describe('transformToSpendTableRows', () => {
  it('maps vendorName from the contract', () => {
    const rows = transformToSpendTableRows([
      makeContract({ vendorName: 'Bloomberg' }),
    ]);

    expect(rows[0].vendorName).toBe('Bloomberg');
  });

  it('defaults vendorName to dash when undefined', () => {
    const rows = transformToSpendTableRows([
      makeContract({ vendorName: undefined }),
    ]);

    expect(rows[0].vendorName).toBe('-');
  });

  it('defaults vendorName to dash when empty string', () => {
    const rows = transformToSpendTableRows([makeContract({ vendorName: '' })]);

    expect(rows[0].vendorName).toBe('-');
  });
});

describe('hasMultipleVendors', () => {
  it('returns false for a single vendor across all rows', () => {
    const rows = [
      makeRow({ vendorName: 'Acme Corp' }),
      makeRow({ vendorName: 'Acme Corp' }),
    ];

    expect(hasMultipleVendors(rows)).toBe(false);
  });

  it('returns false for a single row', () => {
    expect(hasMultipleVendors([makeRow()])).toBe(false);
  });

  it('returns true when rows have different vendors', () => {
    const rows = [
      makeRow({ vendorName: 'Acme Corp' }),
      makeRow({ vendorName: 'Globex Inc' }),
    ];

    expect(hasMultipleVendors(rows)).toBe(true);
  });

  it('treats dash placeholders as a distinct vendor', () => {
    const rows = [
      makeRow({ vendorName: 'Acme Corp' }),
      makeRow({ vendorName: '-' }),
    ];

    expect(hasMultipleVendors(rows)).toBe(true);
  });
});

describe('getSpendColumns', () => {
  it('returns base columns without vendor when showVendor is false', () => {
    const columns = getSpendColumns(false);

    expect(columns.map((c) => c.key)).toEqual(spendColumns.map((c) => c.key));
    expect(columns.map((c) => c.key)).toEqual([
      'contractId',
      'contractType',
      'currentBudget',
      'projectedBudget',
      'tcv',
    ]);
  });

  it('inserts vendorName column after contractId when showVendor is true', () => {
    const columns = getSpendColumns(true);
    const keys = columns.map((c) => c.key);

    expect(keys).toEqual([
      'contractId',
      'vendorName',
      'contractType',
      'currentBudget',
      'projectedBudget',
      'tcv',
    ]);
  });

  it('sets Vendor as the header for the vendorName column', () => {
    const columns = getSpendColumns(true);
    const vendorCol = columns.find((c) => c.key === 'vendorName');

    expect(vendorCol).toBeDefined();
    expect(vendorCol!.header).toBe('Vendor');
  });
});

describe('buildSpendFooterRow', () => {
  it('returns 5 cells without vendor column', () => {
    const footer = buildSpendFooterRow(TOTALS, false);

    expect(footer).toHaveLength(5);
    expect(footer.map((c) => c.key)).toEqual([
      'contractId',
      'contractType',
      'currentBudget',
      'projectedBudget',
      'tcv',
    ]);
  });

  it('returns 6 cells with vendor column inserted after contractId', () => {
    const footer = buildSpendFooterRow(TOTALS, true);

    expect(footer).toHaveLength(6);
    expect(footer.map((c) => c.key)).toEqual([
      'contractId',
      'vendorName',
      'contractType',
      'currentBudget',
      'projectedBudget',
      'tcv',
    ]);
  });

  it('uses empty value for the vendorName footer cell', () => {
    const footer = buildSpendFooterRow(TOTALS, true);
    const vendorCell = footer.find((c) => c.key === 'vendorName');

    expect(vendorCell).toBeDefined();
    expect(vendorCell!.value).toBe('');
  });

  it('defaults showVendor to false when omitted', () => {
    const footer = buildSpendFooterRow(TOTALS);

    expect(footer).toHaveLength(5);
    expect(footer.find((c) => c.key === 'vendorName')).toBeUndefined();
  });
});
