import { describe, expect, it } from '@jest/globals';
import { invoicesReport } from '@/lib/v2/reports/definitions/invoices';
import { autoRenewalsReport } from '@/lib/v2/reports/definitions/renewals';
import { leaversReport } from '@/lib/v2/reports/definitions/leavers';
import { utilizationReport } from '@/lib/v2/reports/definitions/utilization';
import type { ContractTableRow } from '@/lib/v2/core/types';

const invoiceRows = (rows: Array<Record<string, unknown>>) =>
  rows as unknown as Parameters<
    NonNullable<typeof invoicesReport.calculateTotal>
  >[0];
const tableRows = (rows: Array<Record<string, unknown>>) =>
  rows as unknown as ContractTableRow[];

describe('invoicesReport.calculateTotal', () => {
  it('sums |discrepancyBase| scaled by the invoice frequency multiplier', () => {
    const rows = invoiceRows([
      { discrepancyBase: -120, invoiceFreqMultiplier: 12 },
      { discrepancyBase: 50 },
      { discrepancyBase: undefined, invoiceFreqMultiplier: 4 },
    ]);
    expect(invoicesReport.calculateTotal?.(rows, 'discrepancy')).toBe(
      120 * 12 + 50,
    );
  });

  it('sums the named field directly for non-discrepancy value fields', () => {
    const rows = invoiceRows([
      { currentBudget: 100 },
      { currentBudget: 25.5 },
      { currentBudget: 'not-a-number' },
      {},
    ]);
    expect(invoicesReport.calculateTotal?.(rows, 'currentBudget')).toBe(125.5);
  });
});

describe('autoRenewalsReport.calculateTotal', () => {
  it('sums engine-stamped projected spend and skips overall-spend-excluded rows', () => {
    const rows = tableRows([
      { engineSpend: { currentBase: 1, projectedBase: 1000 } },
      { engineSpend: { currentBase: 2, projectedBase: 250 } },
      {
        engineSpend: { currentBase: 3, projectedBase: 9999 },
        excludedFromOverallSpend: true,
      },
    ]);
    expect(autoRenewalsReport.calculateTotal?.(rows, 'projectedBudget')).toBe(
      1250,
    );
  });
});

describe('leaversReport.calculateTotal', () => {
  it('sums departed license counts, treating missing counts as zero', () => {
    const rows = [
      { departedLicensesCount: 3 },
      { departedLicensesCount: 0 },
      {},
    ];
    expect(
      leaversReport.calculateTotal?.(
        rows as unknown as Parameters<
          NonNullable<typeof leaversReport.calculateTotal>
        >[0],
        'departedLicensesCount',
      ),
    ).toBe(3);
  });
});

describe('utilizationReport.calculateTotal', () => {
  const rowsOf = (rows: Array<Record<string, unknown>>) =>
    rows as unknown as Parameters<
      NonNullable<typeof utilizationReport.calculateTotal>
    >[0];

  it('values unused seats at the per-seat rate for potentialOverage', () => {
    const rows = rowsOf([
      { currentBudget: 1200, seatUsage: { licensed: 12, assigned: 9 } },
      { currentBudget: 500, seatUsage: { licensed: 0, assigned: 0 } },
    ]);
    expect(utilizationReport.calculateTotal?.(rows, 'potentialOverage')).toBe(
      3 * (1200 / 12),
    );
  });

  it('falls back to summing the named field for other value fields', () => {
    const rows = rowsOf([{ currentBudget: 10 }, { currentBudget: 5 }, {}]);
    expect(utilizationReport.calculateTotal?.(rows, 'currentBudget')).toBe(15);
  });
});
