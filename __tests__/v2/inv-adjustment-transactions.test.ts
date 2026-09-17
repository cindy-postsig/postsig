import {
  ADJUSTMENT_TRANSACTION_TYPES,
  isAdjustmentTransactionType,
  POSITION_COST_TRANSACTION_TYPES,
} from '@/lib/v2/inv/stage-utils';
import { transformInvTransactions } from '@/lib/v2/inv/transforms';
import type { InvTransaction } from '@/lib/v2/inv/types';
import {
  CII_ENTRY_COST,
  CII_REALIZED_PROCEEDS,
  CII_TRANSACTIONS,
} from '@/__tests__/fixtures/cii-ledger';

function makeTx(overrides: Partial<InvTransaction> & { id: number }) {
  return {
    publicId: `tx-${overrides.id}`,
    companyId: 1,
    fundId: 1,
    securityId: 1,
    financingRoundId: null,
    organizationId: 'org-1',
    transactionDate: '2024-01-01',
    settlementDate: null,
    transactionType: 'purchase',
    units: 1000,
    pricePerUnit: 1,
    amount: 1000,
    currency: 'USD',
    counterpartyName: null,
    notes: null,
    externalId: null,
    metadata: {},
    ...overrides,
  } as InvTransaction;
}

const totalCost = (txs: InvTransaction[]) =>
  transformInvTransactions(txs).reduce((sum, t) => sum + (t.cost ?? 0), 0);

const totalProceeds = (txs: InvTransaction[]) =>
  transformInvTransactions(txs).reduce(
    (sum, t) => sum + (t.realizedProceeds ?? 0),
    0,
  );

describe('isAdjustmentTransactionType', () => {
  it.each(ADJUSTMENT_TRANSACTION_TYPES)('recognizes %s', (type) => {
    expect(isAdjustmentTransactionType(type)).toBe(true);
  });

  it('rejects capital-moving types', () => {
    expect(isAdjustmentTransactionType('purchase')).toBe(false);
    expect(isAdjustmentTransactionType('secondary_sale')).toBe(false);
    expect(isAdjustmentTransactionType(null)).toBe(false);
    expect(isAdjustmentTransactionType(undefined)).toBe(false);
  });

  it('shares no types with the position cost filter', () => {
    const costTypes: readonly string[] = POSITION_COST_TRANSACTION_TYPES;
    for (const type of ADJUSTMENT_TRANSACTION_TYPES) {
      expect(costTypes).not.toContain(type);
    }
  });
});

describe('transformInvTransactions adjustment legs', () => {
  const purchase = makeTx({ id: 1, transactionType: 'purchase', amount: 1000 });

  it('leaves a plain purchase counted', () => {
    expect(totalCost([purchase])).toBe(1000);
  });

  it('ignores a reclassification out/in pair booked with amount 0', () => {
    const pair = [
      makeTx({
        id: 2,
        transactionType: 'reclassification',
        units: -1000,
        amount: 0,
      }),
      makeTx({
        id: 3,
        transactionType: 'reclassification',
        units: 1000,
        amount: 0,
      }),
    ];

    expect(totalCost([purchase, ...pair])).toBe(1000);
  });

  it('ignores a reclassification pair even when amounts are nonzero', () => {
    // Booking convention is amount 0, but production rows predate it — the
    // legs must not inflate Total Invested regardless.
    const pair = [
      makeTx({
        id: 2,
        transactionType: 'reclassification',
        units: -1000,
        amount: -1000,
      }),
      makeTx({
        id: 3,
        transactionType: 'reclassification',
        units: 1000,
        amount: 1000,
      }),
    ];

    expect(totalCost([purchase, ...pair])).toBe(1000);
    expect(totalProceeds([purchase, ...pair])).toBe(0);
  });

  it.each(ADJUSTMENT_TRANSACTION_TYPES)(
    'contributes no cost or proceeds for %s',
    (transactionType) => {
      const adjustment = makeTx({ id: 4, transactionType, amount: 5000 });

      expect(totalCost([adjustment])).toBe(0);
      expect(totalProceeds([adjustment])).toBe(0);
    },
  );

  it('still counts a conversion leg as a unit movement', () => {
    // Only cost is zeroed; the units still change the position.
    const rows = transformInvTransactions([
      makeTx({
        id: 5,
        transactionType: 'conversion',
        units: 250,
        amount: 0,
      }),
    ]);

    expect(rows[0].myUnits).toBe(250);
    expect(rows[0].cumulativeUnits).toBe(250);
  });

  it('leaves a secondary sale booking proceeds, not cost', () => {
    const sale = makeTx({
      id: 6,
      transactionType: 'secondary_sale',
      amount: -2000,
    });

    expect(totalCost([sale])).toBe(0);
    expect(totalProceeds([sale])).toBe(2000);
  });
});

describe('transformInvTransactions cost/proceeds classification', () => {
  const purchase = makeTx({
    id: 1,
    transactionType: 'purchase',
    amount: -1000,
  });

  it('ignores a write_off', () => {
    const writeOff = makeTx({
      id: 2,
      transactionType: 'write_off',
      units: -400,
      amount: -750,
    });

    expect(totalCost([purchase, writeOff])).toBe(1000);
    expect(totalProceeds([purchase, writeOff])).toBe(0);
  });

  it('ignores a transfer_out', () => {
    const transferOut = makeTx({
      id: 3,
      transactionType: 'transfer_out',
      units: -300,
      amount: -600,
    });

    expect(totalCost([purchase, transferOut])).toBe(1000);
    expect(totalProceeds([purchase, transferOut])).toBe(0);
  });

  it('books a distribution as proceeds only', () => {
    const distribution = makeTx({
      id: 4,
      transactionType: 'distribution',
      units: 0,
      amount: 2500,
    });

    expect(totalCost([purchase, distribution])).toBe(1000);
    expect(totalProceeds([purchase, distribution])).toBe(2500);
  });

  it('sums the CII ledger to its entry cost and exit proceeds', () => {
    expect(totalCost(CII_TRANSACTIONS)).toBeCloseTo(CII_ENTRY_COST, 2);
    expect(totalProceeds(CII_TRANSACTIONS)).toBeCloseTo(
      CII_REALIZED_PROCEEDS,
      2,
    );
  });
});
