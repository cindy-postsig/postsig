import { resolveSegmentFeeContext } from '@/lib/v2/reports/transforms/segmentContext';
import { processInvoiceData } from '@/lib/v2/reports/transforms/invoices';
import { MIN_DISCREPANCY } from '@/lib/v2/reports/definitions/invoices';
import {
  getEnrichedContracts,
  type EnrichedContract,
} from '@/lib/v2/contracts/service';
import type { InvoiceData } from '@/lib/v2/reports/filters';

export interface InvoiceValidation {
  discrepancyCount: number;
  amountMatch: boolean;
  amountDifference: number;
  /** amountDifference converted to the org's base currency at the
   * invoice-date FX rate — see InvoiceData.discrepancyBase. */
  amountDifferenceBase: number;
  amountDifferencePercent: number;
  expectedAmount: number;
  invoiceAmount: number;
  frequencyMatch: boolean;
  parentBillingFrequency: string;
  invoiceBillingFrequency: string;
  serviceOrderAvailable: boolean;
  serviceOrderLabel?: string;
  serviceOrderId?: number;
  productsMatch: boolean;
  matchedProducts: InvoiceData['matchedProducts'];
}

export function toValidation(
  data: Partial<InvoiceData> & {
    parentContract?: { id?: number; order_number?: string };
  },
): InvoiceValidation {
  const hasParent = data.parentContract != null;
  const amountMatch =
    !hasParent || Math.abs(data.discrepancy ?? 0) < MIN_DISCREPANCY;
  const frequencyMatch = !hasParent || (data.frequencyAligned ?? true);
  const productsMatch = !data.hasUnmatchedProducts;

  const discrepancyCount = [
    !amountMatch,
    !frequencyMatch,
    !hasParent,
    !productsMatch,
  ].filter(Boolean).length;

  return {
    discrepancyCount,
    amountMatch,
    amountDifference: data.discrepancy ?? 0,
    amountDifferenceBase: data.discrepancyBase ?? 0,
    amountDifferencePercent: data.difference ?? 0,
    expectedAmount: data.expectedInvoiceAmount ?? 0,
    invoiceAmount: data.invoiceAmount ?? 0,
    frequencyMatch,
    parentBillingFrequency: data.parentBillingFrequency ?? 'Unknown',
    invoiceBillingFrequency: data.invoiceBillingFrequency ?? 'Unknown',
    serviceOrderAvailable: hasParent,
    serviceOrderLabel: data.parentContract?.order_number ?? undefined,
    serviceOrderId: data.parentContract?.id,
    productsMatch,
    matchedProducts: data.matchedProducts ?? [],
  };
}

/**
 * Validation data for a set of invoice contracts, reusing the same
 * discrepancy computation as the Invoice Discrepancy report
 * (lib/v2/reports/transforms/invoices.ts) so the two stay consistent.
 * Invoices with no qualifying parent contract (no linked Service Order) come
 * back with serviceOrderAvailable: false and everything else treated as
 * unverifiable, matching this function's own hasParent gate above.
 */
export async function getInvoiceValidations(
  invoices: EnrichedContract[],
): Promise<Map<number, InvoiceValidation>> {
  const segmentCtx = await resolveSegmentFeeContext();

  const entries = await Promise.all(
    invoices.map(async (invoice): Promise<[number, InvoiceValidation]> => {
      const data = await processInvoiceData(invoice.contract, segmentCtx);
      return [invoice.id, toValidation(data)];
    }),
  );

  return new Map(entries);
}

/**
 * Validation for a single invoice, for the Invoice Details page's Invoice
 * Validation Summary module. Reuses getInvoiceValidations so the module
 * agrees with the list badge and the Discrepancy Report. familyOf pulls in
 * this invoice's linked parent contract(s) — required for the amount/
 * frequency/service-order comparison, which needs a parent to compare against.
 *
 * Calls getEnrichedContracts directly (status: 'all', includeArchived: true)
 * rather than the getContractsList wrapper, which defaults to active-only —
 * an archived or unconfirmed invoice's own detail page must still get its
 * validation summary, not silently lose the module.
 */
export async function getInvoiceValidationSummary(
  contractId: number,
): Promise<InvoiceValidation | null> {
  const { contracts } = await getEnrichedContracts(
    'all',
    false,
    true,
    contractId,
    false,
  );
  const invoice = contracts.find((c) => c.id === contractId);
  if (!invoice) return null;

  const validations = await getInvoiceValidations([invoice]);
  return validations.get(contractId) ?? null;
}
