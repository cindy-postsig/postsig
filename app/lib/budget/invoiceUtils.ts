/**
 * Utilities for invoice-related calculations and normalizations
 */

/**
 * Represents the standard billing frequencies supported for normalization
 */
export type BillingFrequency =
  | 'Annually'
  | 'Semi-annually'
  | 'Bi-annually'
  | 'Quarterly'
  | 'Monthly'
  | string;

/**
 * Contains the result of normalizing an invoice amount compared to a parent contract
 */
export interface InvoiceNormalizationResult {
  // Original raw values (annual amounts)
  rawParentAmount: number;
  rawInvoiceAmount: number;

  // Adjusted values (converted to invoice frequency)
  adjustedParentAmount: number;
  adjustedInvoiceAmount: number;

  // Normalized values
  expectedInvoiceAmount: number;

  // Billing frequency info
  parentBillingFrequency: BillingFrequency;
  invoiceBillingFrequency: BillingFrequency;
  invoiceFreqMultiplier: number; // Factor to convert annual to invoice frequency
  frequencyMultiplier: number; // Factor to align parent and invoice frequencies
  frequencyAligned: boolean; // true if billing frequencies are exactly the same after normalization

  // Discrepancy calculations
  difference: number; // Percentage difference
  discrepancy: number; // Absolute difference (in invoice frequency units)
}

/**
 * The subset of an invoice report row the displayed gap is derived from.
 * Structural so both the table cells and the CSV export can pass their own row
 * shape.
 */
export interface InvoiceGapRow {
  expectedInvoiceAmount?: number | null;
  adjustedInvoiceAmount?: number | null;
  invoiceAmount?: number | null;
  currentBudget?: number | null;
  invoiceFreqMultiplier?: number | null;
}

/**
 * The amount billed as the report displays it: subrows and enriched rows carry
 * `adjustedInvoiceAmount`, and a row that only knows its annual budget falls
 * back to that budget spread over the invoice's billing periods.
 *
 * Each step falls through only on a missing amount, never on a zero one: an
 * invoice that bills nothing against an expected fee is the whole point of the
 * report, and treating its 0 as absent would invent a billed amount for it.
 * The divisor keeps its truthiness check, since `getAnnualFactorForFrequency`
 * answers 0 for a frequency it does not recognize.
 */
export function billedInvoiceAmount(row: InvoiceGapRow): number {
  return (
    row.adjustedInvoiceAmount ??
    row.invoiceAmount ??
    (row.currentBudget ?? 0) / (row.invoiceFreqMultiplier || 1)
  );
}

/**
 * The billed-vs-expected gap in whole cents, derived from the two amounts
 * *as rendered* rather than from the unrounded `discrepancy`.
 *
 * Both amount columns round to cents independently, so a gap taken before
 * rounding can contradict them: expected 166.6667 and billed 166.682 render as
 * 166.67 and 166.68 — a cent apart — while their raw difference, 0.0153,
 * renders as two cents (PSK-1929). Sub-cent remainders are inherent here,
 * since a prorated annual fee (1000/12 = 83.3333…) and a cross-currency parent
 * fee both divide unevenly.
 *
 * Cents are integers, so the result is exact and a zero gap is exactly 0 —
 * which is what the report colors as "no discrepancy" instead of testing the
 * sign of a float that is never quite zero.
 *
 * Expected comes from `expectedInvoiceAmount`, which is 0 when the parent and
 * invoice frequencies cannot be aligned; such a row keeps reporting the whole
 * invoice as the gap, as it did before.
 */
export function invoiceGapCents(row: InvoiceGapRow): number {
  const toCents = (amount: number) => Math.round(amount * 100);
  return (
    toCents(billedInvoiceAmount(row)) - toCents(row.expectedInvoiceAmount || 0)
  );
}

/**
 * Normalizes a billing frequency string to handle different formats and capitalization
 * @param frequency The billing frequency string to normalize
 * @returns The normalized frequency
 */
export function normalizeBillingFrequency(
  frequency: string | null | undefined,
): BillingFrequency {
  if (!frequency) {
    return 'Annually'; // Default to annual if not specified
  }

  // First, ensure we have a string and it's trimmed
  const rawFrequency = String(frequency).trim();

  // Special handling for empty strings after trim
  if (rawFrequency === '') {
    return 'Annually';
  }

  // Convert to lowercase for case-insensitive comparison
  const normalizedFreq = rawFrequency.toLowerCase();

  // Map various formats to standard frequencies
  if (
    normalizedFreq === 'annual' ||
    normalizedFreq === 'annually' ||
    normalizedFreq === 'yearly'
  ) {
    return 'Annually';
  } else if (normalizedFreq === 'monthly' || normalizedFreq === 'month') {
    return 'Monthly';
  } else if (normalizedFreq === 'quarterly' || normalizedFreq === 'quarter') {
    return 'Quarterly';
  } else if (
    normalizedFreq === 'bi-annually' ||
    normalizedFreq === 'biannually' ||
    normalizedFreq === 'semi-annually' ||
    normalizedFreq === 'semiannually'
  ) {
    return 'Bi-annually';
  }

  // If no match found, return the original with first letter capitalized
  const result = rawFrequency.charAt(0).toUpperCase() + rawFrequency.slice(1);
  return result;
}

/**
 * Calculates the frequency multiplier needed to normalize between different billing frequencies
 * @param parentFrequency The billing frequency of the parent contract
 * @param invoiceFrequency The billing frequency of the invoice
 * @returns An object containing the multiplier and whether the frequencies can be aligned
 */
export function calculateFrequencyMultiplier(
  parentFrequency: BillingFrequency,
  invoiceFrequency: BillingFrequency,
): { multiplier: number; aligned: boolean } {
  // Check if either input is undefined or null (should never happen due to normalization)
  if (!parentFrequency || !invoiceFrequency) {
    return { multiplier: 1, aligned: false };
  }

  // Normalize frequencies to lowercase for comparison
  const normalizedParent = String(parentFrequency).trim().toLowerCase();
  const normalizedInvoice = String(invoiceFrequency).trim().toLowerCase();

  // If frequencies are identical after normalization, no conversion needed
  if (normalizedParent === normalizedInvoice) {
    return { multiplier: 1, aligned: true };
  }

  // Get annual factors for both frequencies
  const parentAnnualFactor = getAnnualFactorForFrequency(normalizedParent);
  const invoiceAnnualFactor = getAnnualFactorForFrequency(normalizedInvoice);

  // If either frequency couldn't be recognized, return not aligned
  if (parentAnnualFactor === 0 || invoiceAnnualFactor === 0) {
    return { multiplier: 1, aligned: false };
  }

  // Calculate the multiplier by comparing annual factors
  // This converts from parent frequency to invoice frequency
  const multiplier = parentAnnualFactor / invoiceAnnualFactor;

  return { multiplier, aligned: true };
}

/**
 * Helper function to get the annual factor for a frequency
 * Returns how many times per year a payment occurs with the given frequency
 * @param frequency Billing frequency
 * @returns Number of billing periods per year
 */
export function getAnnualFactorForFrequency(frequency: string): number {
  const freq = frequency?.toLowerCase() || '';

  // Check for monthly variations
  if (freq.includes('month')) {
    return 12;
  }

  // Check for quarterly variations
  if (freq.includes('quarter')) {
    return 4;
  }

  // Check for bi-annual and semi-annual variations
  if (
    freq.includes('bi-annual') ||
    freq.includes('biannual') ||
    freq.includes('semi-annual') ||
    freq.includes('semiannual')
  ) {
    return 2;
  }

  // Check for annual variations
  if (freq.includes('annual') || freq.includes('year')) {
    return 1;
  }

  // Handle other common cases
  switch (freq) {
    case 'weekly':
      return 52;
    case 'bi-weekly':
    case 'biweekly':
    case 'fortnightly':
      return 26;
    default:
      return 0; // Unknown frequency
  }
}

/**
 * Calculates the invoice discrepancy between a parent contract and an invoice
 * @param parentAmount The amount from the parent contract
 * @param invoiceAmount The amount from the invoice
 * @param parentFrequency The billing frequency of the parent contract
 * @param invoiceFrequency The billing frequency of the invoice
 * @param isInvoice Indicates if this is an invoice contract (type_id = 6)
 * @param subscriptionTerm The subscription term in months (from parent contract)
 * @returns A detailed normalization result
 *
 * Amounts come back unrounded. Callers round once at the level they render —
 * rounding per product and summing turns three genuine 50c overbills into $3.
 */
export function calculateInvoiceDiscrepancy(
  parentAmount: number,
  invoiceAmount: number,
  parentFrequency: BillingFrequency | string | null | undefined,
  invoiceFrequency: BillingFrequency | string | null | undefined,
  isInvoice: boolean = false,
  subscriptionTerm: number = 12,
): InvoiceNormalizationResult {
  // Normalize the frequencies
  const normalizedParentFreq = normalizeBillingFrequency(parentFrequency);
  const normalizedInvoiceFreq = normalizeBillingFrequency(invoiceFrequency);

  // For parent contracts, first convert to monthly fee by dividing by subscription term
  const monthlyParentAmount =
    subscriptionTerm > 0 ? parentAmount / subscriptionTerm : parentAmount / 12;

  // Calculate the inverse multiplier to convert from annual to the invoice frequency
  const invoiceFreqMultiplier = getAnnualFactorForFrequency(
    normalizedInvoiceFreq,
  );

  // For invoices, take the fees at face value per billing frequency without dividing by 12
  // For parent, use the monthly fee and multiply to match invoice frequency
  const adjustedInvoiceAmount = isInvoice
    ? invoiceAmount
    : invoiceAmount / invoiceFreqMultiplier;

  // For parent contract, convert monthly fee to match invoice frequency
  let adjustedParentAmount = 0;
  if (normalizedInvoiceFreq === 'Monthly') {
    adjustedParentAmount = monthlyParentAmount;
  } else if (normalizedInvoiceFreq === 'Quarterly') {
    adjustedParentAmount = monthlyParentAmount * 3;
  } else if (
    normalizedInvoiceFreq === 'Bi-annually' ||
    normalizedInvoiceFreq === 'Semi-annually'
  ) {
    adjustedParentAmount = monthlyParentAmount * 6;
  } else if (normalizedInvoiceFreq === 'Annually') {
    adjustedParentAmount = monthlyParentAmount * 12;
  } else {
    // Handle other frequencies
    const monthsPerInvoice = 12 / invoiceFreqMultiplier;
    adjustedParentAmount = monthlyParentAmount * monthsPerInvoice;
  }

  // Calculate the expected amount with alignments
  const { multiplier, aligned: frequenciesCanAlign } =
    calculateFrequencyMultiplier(normalizedParentFreq, normalizedInvoiceFreq);

  // The expected invoice amount is the adjusted parent amount
  const expectedInvoiceAmount = frequenciesCanAlign ? adjustedParentAmount : 0;

  // Calculate the difference percentage and discrepancy
  let difference = 0;
  if (frequenciesCanAlign && expectedInvoiceAmount > 0) {
    difference =
      ((adjustedInvoiceAmount - expectedInvoiceAmount) /
        expectedInvoiceAmount) *
      100;
  }

  const discrepancy = adjustedInvoiceAmount - expectedInvoiceAmount;

  // Simple check if frequencies are exactly the same (after normalization)
  // This is a strict string comparison of the normalized frequencies
  const frequencyAligned =
    normalizedParentFreq.toLowerCase() === normalizedInvoiceFreq.toLowerCase();

  return {
    rawParentAmount: parentAmount,
    rawInvoiceAmount: invoiceAmount,
    adjustedParentAmount,
    adjustedInvoiceAmount,
    expectedInvoiceAmount,
    parentBillingFrequency: normalizedParentFreq,
    invoiceBillingFrequency: normalizedInvoiceFreq,
    invoiceFreqMultiplier,
    frequencyMultiplier: multiplier,
    frequencyAligned,
    difference,
    discrepancy,
  };
}
