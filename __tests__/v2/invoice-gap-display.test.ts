import {
  billedInvoiceAmount,
  invoiceGapCents,
} from '@/app/lib/budget/invoiceUtils';

/**
 * The invoice discrepancies report renders the expected and billed amounts
 * rounded to cents, so the gap it shows between them has to be derived from
 * those rounded amounts. Deriving it from the unrounded `discrepancy` let the
 * column contradict the two columns beside it — a cent apart on screen, two
 * cents in the Discrepancy column — and gave sub-cent proration remainders a
 * sign, which colored $0.00 rows red or green at random (PSK-1929).
 */
describe('invoiceGapCents', () => {
  it('reports the gap between the amounts as displayed, not the raw one', () => {
    // 166.6667 renders as 166.67 and 166.682 as 166.68: one cent apart on
    // screen, while the raw difference of 0.0153 renders as two.
    expect(
      invoiceGapCents({
        expectedInvoiceAmount: 166.6667,
        adjustedInvoiceAmount: 166.682,
      }),
    ).toBe(1);
  });

  it('reads a monthly proration remainder as no gap at all', () => {
    // A $1,000 annual fee billed monthly expects 83.3333…; the vendor bills
    // the 83.33 it rounds to. Both render as 83.33, so nothing is owed.
    expect(
      invoiceGapCents({
        expectedInvoiceAmount: 1000 / 12,
        adjustedInvoiceAmount: 83.33,
      }),
    ).toBe(0);
  });

  it('reads a cross-currency float remainder as no gap at all', () => {
    expect(
      invoiceGapCents({
        expectedInvoiceAmount: 4166.666666666667,
        adjustedInvoiceAmount: 4166.666666666652,
      }),
    ).toBe(0);
  });

  it('keeps a sub-cent gap that straddles a cent boundary', () => {
    // 100.414 renders as 100.41 against a billed 100.42: the reader sees a
    // cent, so the column shows one, even though the raw gap is under one.
    expect(
      invoiceGapCents({
        expectedInvoiceAmount: 100.414,
        adjustedInvoiceAmount: 100.42,
      }),
    ).toBe(1);
  });

  it('reads a half-cent gap inside one cent as no gap (PSK-1876 case)', () => {
    // The row PSK-1876 kept on purpose: 100.42 billed against a prorated
    // 100.415. Both render as 100.42, so the report can no longer claim a
    // cent between them — the row is still listed, showing no difference.
    expect(
      invoiceGapCents({
        expectedInvoiceAmount: 100.415,
        adjustedInvoiceAmount: 100.42,
      }),
    ).toBe(0);
  });

  it('signs an underbill negative and an overbill positive', () => {
    expect(
      invoiceGapCents({
        expectedInvoiceAmount: 500,
        adjustedInvoiceAmount: 499.5,
      }),
    ).toBe(-50);
    expect(
      invoiceGapCents({
        expectedInvoiceAmount: 500,
        adjustedInvoiceAmount: 512.25,
      }),
    ).toBe(1225);
  });

  it('charges an unmatched product, which has no expected amount, in full', () => {
    expect(
      invoiceGapCents({
        expectedInvoiceAmount: 0,
        adjustedInvoiceAmount: 250.5,
      }),
    ).toBe(25050);
  });

  it('still reports the whole invoice when the frequencies cannot align', () => {
    // `calculateInvoiceDiscrepancy` zeroes the expected amount in that case,
    // and the row keeps flagging the full invoice as it did before.
    expect(
      invoiceGapCents({
        expectedInvoiceAmount: 0,
        adjustedInvoiceAmount: 1200,
      }),
    ).toBe(120000);
  });
});

describe('billedInvoiceAmount', () => {
  it('prefers the frequency-adjusted amount the row was enriched with', () => {
    expect(
      billedInvoiceAmount({
        adjustedInvoiceAmount: 83.33,
        invoiceAmount: 999,
        currentBudget: 1000,
        invoiceFreqMultiplier: 12,
      }),
    ).toBe(83.33);
  });

  it('spreads the annual budget over the billing periods as a last resort', () => {
    expect(
      billedInvoiceAmount({ currentBudget: 1200, invoiceFreqMultiplier: 12 }),
    ).toBe(100);
  });

  it('keeps an invoice that billed nothing at zero', () => {
    // An invoice billing 0 against an expected fee is a full undercharge, not
    // a row missing its amount, so no later fallback may speak for it.
    expect(
      billedInvoiceAmount({
        adjustedInvoiceAmount: 0,
        invoiceAmount: 999,
        currentBudget: 1200,
        invoiceFreqMultiplier: 12,
      }),
    ).toBe(0);
    expect(
      billedInvoiceAmount({
        invoiceAmount: 0,
        currentBudget: 1200,
        invoiceFreqMultiplier: 12,
      }),
    ).toBe(0);
    expect(
      invoiceGapCents({
        expectedInvoiceAmount: 83.33,
        adjustedInvoiceAmount: 0,
      }),
    ).toBe(-8333);
  });

  it('does not divide by an unrecognized billing frequency', () => {
    // `getAnnualFactorForFrequency` answers 0 for a frequency it cannot read.
    expect(
      billedInvoiceAmount({ currentBudget: 1200, invoiceFreqMultiplier: 0 }),
    ).toBe(1200);
  });

  it('is zero for a row carrying no amounts', () => {
    expect(billedInvoiceAmount({})).toBe(0);
    expect(invoiceGapCents({})).toBe(0);
  });
});
