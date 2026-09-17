// __tests__/v2/inv-editable-value-sign.test.ts
//
// The override write path shows inv_transaction.amount as a magnitude (Entry
// Cost) but stores it signed by the transaction's type (cost types negative,
// proceeds positive — mirroring droid's ingestion getTransactionSign). The
// stored sign keeps the signed-sum aggregation correct (see the merge-level
// guarantee in inv-overrides-merge-valuation).

jest.mock('server-only', () => ({}));

import {
  applyTransactionAmountSign,
  fractionToPercentDisplay,
  percentToFraction,
} from '@/components/investor/EditableValue';

describe('applyTransactionAmountSign', () => {
  it('stores a cost-type amount (purchase) negative regardless of typed sign', () => {
    expect(applyTransactionAmountSign(1200, 'purchase', 1000)).toBe(-1200);
    expect(applyTransactionAmountSign(-1200, 'purchase', 1000)).toBe(-1200);
  });

  it('stores a proceeds-type amount (sale) positive regardless of typed sign', () => {
    expect(applyTransactionAmountSign(300, 'sale', -250)).toBe(300);
    expect(applyTransactionAmountSign(-300, 'sale', -250)).toBe(300);
  });

  it('signs the harder cost types that are absent from aggregation buckets', () => {
    // transfer_out / write_off / affiliate_transfer_from are -1 by type, but
    // appear in neither v_inv_position cost/proceeds set — type drives the sign.
    expect(applyTransactionAmountSign(100, 'transfer_out', undefined)).toBe(
      -100,
    );
    expect(applyTransactionAmountSign(100, 'write_off', undefined)).toBe(-100);
  });

  it('falls back to the existing value sign when the type is unknown', () => {
    expect(applyTransactionAmountSign(500, 'mystery_type', -10)).toBe(-500);
    expect(applyTransactionAmountSign(500, 'mystery_type', 10)).toBe(500);
  });

  it('leaves the magnitude positive when neither type nor sign source helps', () => {
    expect(applyTransactionAmountSign(500, undefined, undefined)).toBe(500);
    expect(applyTransactionAmountSign(500, 'mystery_type', undefined)).toBe(
      500,
    );
  });
});

describe('percent <-> fraction (My FD% edits as a percent, stores a fraction)', () => {
  it('converts a typed percent to the stored fraction', () => {
    expect(percentToFraction(10)).toBe(0.1);
    expect(percentToFraction(0)).toBe(0);
  });

  it('stores exactly 1.0 at the 100% boundary (rule max)', () => {
    expect(percentToFraction(100)).toBe(1);
  });

  it('displays a stored fraction as a percent', () => {
    expect(fractionToPercentDisplay(0.1)).toBe('10');
    expect(fractionToPercentDisplay(1)).toBe('100');
    expect(fractionToPercentDisplay(0)).toBe('0');
  });

  it('rounds away float artefacts on display (0.07 -> "7", not "7.0000...1")', () => {
    expect(fractionToPercentDisplay(0.07)).toBe('7');
    expect(fractionToPercentDisplay(0.125)).toBe('12.5');
  });

  it('round-trips a typed percent back to the same display', () => {
    for (const pct of [10, 7, 12.5, 100, 0, 33.3]) {
      expect(fractionToPercentDisplay(percentToFraction(pct))).toBe(
        String(pct),
      );
    }
  });
});
