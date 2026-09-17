import { buildContractRows } from '@/lib/v2/reports/budget-export/rows';
import type { ContractWithPricing } from '@/lib/v2/core/types';

function row(spec: {
  id: number;
  cancelByDate?: string | null;
  inherited?: string;
}): ContractWithPricing {
  return {
    id: spec.id,
    vendor_id: 10,
    contract: { id: spec.id },
    products: [],
    priceHistory: {
      vendor: 'Fitch Solutions',
      cancelByDate: spec.cancelByDate ?? null,
    },
    inheritedCancelByDate: spec.inherited
      ? { date: spec.inherited, noticeDays: 30, sourceContractId: 3005 }
      : null,
  } as unknown as ContractWithPricing;
}

describe('budget export cancel-by column', () => {
  it('falls back to the inherited notice date when the contract has none of its own', () => {
    const rows = buildContractRows(
      [row({ id: 3006, inherited: '2027-01-29' })],
      new Map(),
    );
    expect(rows[0].cancelByDate).toBe('2027-01-29');
  });

  it("the contract's own cancel-by wins over the inherited one", () => {
    const rows = buildContractRows(
      [row({ id: 1, cancelByDate: '2026-10-02', inherited: '2027-01-29' })],
      new Map(),
    );
    expect(rows[0].cancelByDate).toBe('2026-10-02');
  });

  it('stays blank when neither exists', () => {
    const rows = buildContractRows([row({ id: 2 })], new Map());
    expect(rows[0].cancelByDate).toBe('');
  });
});
