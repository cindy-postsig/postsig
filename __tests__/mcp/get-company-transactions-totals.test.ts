// __tests__/mcp/get-company-transactions-totals.test.ts
//
// get_company_transactions' totalInvestedUSD / totalProceedsUSD are
// plain sums of summarizeTransactions' costUSD / realizedProceedsUSD, so the
// classification contract is asserted on the summarizer itself. Only the two
// positive type lists move money; every other type contributes 0 to both.

import { describe, expect, it } from '@jest/globals';
import { summarizeTransactions } from '@/app/lib/mcp/tools/investor/companies';
import {
  ADJUSTMENT_TRANSACTION_TYPES,
  POSITION_COST_TRANSACTION_TYPES,
  POSITION_PROCEEDS_TRANSACTION_TYPES,
} from '@/lib/v2/inv';
import type { InvTransaction } from '@/lib/v2/inv/types';
import {
  CII_ENTRY_COST,
  CII_REALIZED_PROCEEDS,
  CII_TRANSACTIONS,
  CII_TRANSFER_OUT_TOTAL,
} from '@/__tests__/fixtures/cii-ledger';

function tx(overrides: Partial<InvTransaction>): InvTransaction {
  return {
    id: 1,
    publicId: 'tx_1',
    companyId: 742,
    fundId: 356,
    securityId: 1387,
    financingRoundId: null,
    organizationId: 'org-1',
    transactionType: 'purchase',
    transactionDate: '2024-01-01',
    settlementDate: null,
    units: 0,
    amount: 0,
    currency: 'USD',
    counterpartyName: null,
    signatory: null,
    notes: null,
    externalId: null,
    metadata: null,
    ...overrides,
  };
}

const summarizeOne = (overrides: Partial<InvTransaction>) =>
  summarizeTransactions([tx(overrides)])[0];

const sum = (rows: { costUSD: number; realizedProceedsUSD: number }[]) => ({
  cost: rows.reduce((s, r) => s + r.costUSD, 0),
  proceeds: rows.reduce((s, r) => s + r.realizedProceedsUSD, 0),
});

describe('summarizeTransactions totals — CII ledger', () => {
  it('sums entry cost and the exit_consideration proceeds', () => {
    const { cost, proceeds } = sum(summarizeTransactions(CII_TRANSACTIONS));
    expect(cost).toBeCloseTo(CII_ENTRY_COST, 2);
    expect(proceeds).toBeCloseTo(CII_REALIZED_PROCEEDS, 2);
  });

  it('leaves the transfer_out amounts out of both totals', () => {
    const transfersOut = summarizeTransactions(CII_TRANSACTIONS).filter(
      (t) => t.transactionType === 'transfer_out',
    );
    expect(transfersOut).toHaveLength(2);
    expect(
      transfersOut.reduce((s, t) => s + Math.abs(t.amountUSD), 0),
    ).toBeCloseTo(CII_TRANSFER_OUT_TOTAL, 2);
    expect(sum(transfersOut)).toEqual({ cost: 0, proceeds: 0 });
  });
});

describe('summarizeTransactions classification', () => {
  it.each([...POSITION_COST_TRANSACTION_TYPES])(
    '%s contributes |amount| to cost only',
    (transactionType) => {
      expect(summarizeOne({ transactionType, amount: -250_000 })).toMatchObject(
        { costUSD: 250_000, realizedProceedsUSD: 0 },
      );
    },
  );

  it.each([...POSITION_PROCEEDS_TRANSACTION_TYPES])(
    '%s contributes |amount| to realized proceeds only',
    (transactionType) => {
      expect(summarizeOne({ transactionType, amount: 180_000 })).toMatchObject({
        costUSD: 0,
        realizedProceedsUSD: 180_000,
      });
    },
  );

  it.each([
    'write_off',
    'transfer_out',
    'transfer_in',
    'affiliate_transfer_to',
    'affiliate_transfer_from',
    ...ADJUSTMENT_TRANSACTION_TYPES,
  ])('%s contributes to neither total', (transactionType) => {
    expect(summarizeOne({ transactionType, amount: -146_974 })).toMatchObject({
      costUSD: 0,
      realizedProceedsUSD: 0,
    });
  });

  it('books a distribution as proceeds, never as cost', () => {
    expect(
      summarizeOne({ transactionType: 'distribution', amount: 42_500 }),
    ).toMatchObject({ costUSD: 0, realizedProceedsUSD: 42_500 });
  });
});

describe('summarizeTransactions cumulativeUnits', () => {
  it("carries a write_off's stored negative units", () => {
    const rows = summarizeTransactions([
      tx({
        id: 1,
        transactionType: 'purchase',
        transactionDate: '2024-01-31',
        units: 100_000,
        amount: -500_000,
      }),
      tx({
        id: 2,
        transactionType: 'write_off',
        transactionDate: '2025-09-30',
        units: -40_000,
        amount: -200_000,
      }),
    ]);
    expect(rows.map((r) => r.cumulativeUnits)).toEqual([100_000, 60_000]);
    expect(sum(rows)).toEqual({ cost: 500_000, proceeds: 0 });
  });
});
