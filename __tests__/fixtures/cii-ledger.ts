// __tests__/fixtures/cii-ledger.ts
//
// The CII ledger: 17 inv_transaction rows for one portfolio company
// across two securities in fund 356, all USD. It is the shared worked example
// for the cost/proceeds contract, so the summarizers (InvTransaction shape)
// and the v_inv_position mirror (PositionTransactionRow shape) are asserted
// against the same rows.
//
// RECONSTRUCTED, NOT TRANSCRIBED. Only the invariants listed below are
// contractual; the per-row ids, dates, unit counts and the split of cost
// across securities 1386/1387 are filler chosen to satisfy them. Replace this
// file wholesale if the real spec rows differ — tests assert against the
// exported constants and the invariants, never against row literals.
//
// Sign convention matches inv_transaction and v_inv_position: capital
// deployed is stored as a negative amount (the view computes total_cost as
// `- sum(amount) FILTER (...)`), capital returned as positive.
//
// What the ledger is built to exercise:
//   - cost types sum to CII_ENTRY_COST across both securities
//   - one proceeds-type row, the exit_consideration, so realized proceeds is
//     CII_REALIZED_PROCEEDS
//   - security 1387's units sum to -60,000, so today's
//     `HAVING sum(t.units) >= 0` drops its 385,221.99 of cost and
//     v_inv_position reports only security 1386's 850,000
//   - every "neither" type is present at least once: transfer_out,
//     transfer_in, write_off, the affiliate transfers and all four
//     adjustment types
//   - the newest transaction_date is 2025-10-31

import type { InvTransaction } from '@/lib/v2/inv/types';
import type { PositionTransactionRow } from '@/lib/v2/inv/overrides/mergeValuation';

/** Sum of |amount| over the position-cost types in the ledger below. */
export const CII_ENTRY_COST = 1_235_221.99;

/** Sum of |amount| over the ledger's two transfer_out rows. */
export const CII_TRANSFER_OUT_TOTAL = 146_974;

/** The ledger's single proceeds-type row: the exit_consideration payout. */
export const CII_REALIZED_PROCEEDS = 75_000;

const CII_FUND_ID = 356;
const CII_COMPANY_ID = 742;
const CII_ORGANIZATION_ID = '0f7c1f5e-4a2b-4f6d-9c31-6b5d2e8a4c10';

interface LedgerRow {
  id: number;
  securityId: number;
  transactionType: string;
  transactionDate: string;
  units: number;
  amount: number;
}

const LEDGER: readonly LedgerRow[] = [
  // Convertible note in security 1386, converted into preferred 1387.
  {
    id: 1,
    securityId: 1386,
    transactionType: 'purchase',
    transactionDate: '2021-06-30',
    units: 500_000,
    amount: -500_000,
  },
  {
    id: 2,
    securityId: 1386,
    transactionType: 'purchase',
    transactionDate: '2022-04-12',
    units: 350_000,
    amount: -350_000,
  },
  {
    id: 3,
    securityId: 1386,
    transactionType: 'conversion',
    transactionDate: '2022-12-31',
    units: -850_000,
    amount: 0,
  },
  {
    id: 4,
    securityId: 1387,
    transactionType: 'conversion',
    transactionDate: '2022-12-31',
    units: 850_000,
    amount: 0,
  },
  {
    id: 5,
    securityId: 1387,
    transactionType: 'secondary_purchase',
    transactionDate: '2023-02-28',
    units: 150_000,
    amount: -199_999.99,
  },
  {
    id: 6,
    securityId: 1387,
    transactionType: 'reclassification',
    transactionDate: '2023-06-30',
    units: 0,
    amount: 0,
  },
  {
    id: 7,
    securityId: 1387,
    transactionType: 'reverse_split',
    transactionDate: '2023-07-31',
    units: -425_000,
    amount: 0,
  },
  {
    id: 8,
    securityId: 1387,
    transactionType: 'forward_split',
    transactionDate: '2023-12-31',
    units: 100_000,
    amount: 0,
  },
  {
    id: 9,
    securityId: 1387,
    transactionType: 'exercise',
    transactionDate: '2024-01-31',
    units: 40_000,
    amount: -85_222,
  },
  {
    id: 10,
    securityId: 1387,
    transactionType: 'transfer_out',
    transactionDate: '2024-06-30',
    units: -300_000,
    amount: -100_000,
  },
  {
    id: 11,
    securityId: 1387,
    transactionType: 'issuance',
    transactionDate: '2024-09-30',
    units: 25_000,
    amount: -100_000,
  },
  {
    id: 12,
    securityId: 1387,
    transactionType: 'transfer_in',
    transactionDate: '2024-11-30',
    units: 50_000,
    amount: 50_000,
  },
  {
    id: 13,
    securityId: 1387,
    transactionType: 'transfer_out',
    transactionDate: '2025-03-31',
    units: -150_000,
    amount: -46_974,
  },
  {
    id: 14,
    securityId: 1387,
    transactionType: 'affiliate_transfer_to',
    transactionDate: '2025-06-30',
    units: -60_000,
    amount: -20_000,
  },
  {
    id: 15,
    securityId: 1387,
    transactionType: 'affiliate_transfer_from',
    transactionDate: '2025-06-30',
    units: 60_000,
    amount: 20_000,
  },
  {
    id: 16,
    securityId: 1387,
    transactionType: 'write_off',
    transactionDate: '2025-09-30',
    units: -400_000,
    amount: -250_000,
  },
  {
    id: 17,
    securityId: 1387,
    transactionType: 'exit_consideration',
    transactionDate: '2025-10-31',
    units: 0,
    amount: 75_000,
  },
];

/** The ledger as the summarizers see it (transformInvTransactions inputs). */
export const CII_TRANSACTIONS: InvTransaction[] = LEDGER.map((row) => ({
  id: row.id,
  publicId: `tx_cii_${row.id}`,
  companyId: CII_COMPANY_ID,
  fundId: CII_FUND_ID,
  securityId: row.securityId,
  financingRoundId: null,
  organizationId: CII_ORGANIZATION_ID,
  transactionType: row.transactionType,
  transactionDate: row.transactionDate,
  settlementDate: null,
  units: row.units,
  amount: row.amount,
  currency: 'USD',
  counterpartyName: null,
  signatory: null,
  notes: null,
  externalId: null,
  metadata: null,
}));

/** The same ledger as the v_inv_position mirror reads it. */
export const CII_POSITION_ROWS: PositionTransactionRow[] = LEDGER.map(
  (row) => ({
    id: row.id,
    fund_id: CII_FUND_ID,
    security_id: row.securityId,
    currency: 'USD',
    transaction_type: row.transactionType,
    transaction_date: row.transactionDate,
    units: row.units,
    amount: row.amount,
  }),
);
