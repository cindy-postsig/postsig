/**
 * Report Filter Context Types
 *
 * Context types used by pipeline definitions and transforms.
 */

import { MatchedInvoiceProduct } from '@/app/lib/definitions';

/** Context types for reports that compute data during filtering */
export type MissingClausesContext = Map<number, string[]>;

/**
 * Invoice data computed asynchronously in service.
 *
 * Amounts are denominated in the invoice's own currency; `discrepancyBase` is
 * the one org-base-currency figure, converted at the invoice-date FX rate.
 */
export interface InvoiceData {
  expectedInvoiceAmount: number;
  invoiceAmount: number;
  discrepancy: number;
  discrepancyBase: number;
  difference: number;
  frequencyMismatch: boolean;
  frequencyAligned: boolean;
  frequencyMultiplier: number;
  invoiceFreqMultiplier: number;
  parentBillingFrequency: string;
  invoiceBillingFrequency: string;
  matchedProducts: MatchedInvoiceProduct[];
  rawParentAmount: number;
  rawInvoiceAmount: number;
  adjustedParentAmount: number;
  adjustedInvoiceAmount: number;
  hasUnmatchedProducts: boolean;
  unmatchedProducts: Array<{
    id: string;
    product_id: number | string;
    product_name: string;
    invoice_fee: number;
  }>;
}

export type InvoiceDataContext = Map<number, InvoiceData>;
