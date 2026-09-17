import type { InvoiceRow } from '@/components/invoices/InvoicesTable';
import type { InvoiceValidation } from '@/lib/v2/invoices/validation';

export function validation(
  overrides: Partial<InvoiceValidation> = {},
): InvoiceValidation {
  return {
    discrepancyCount: 0,
    amountMatch: true,
    amountDifference: 0,
    amountDifferenceBase: 0,
    amountDifferencePercent: 0,
    expectedAmount: 0,
    invoiceAmount: 0,
    frequencyMatch: true,
    parentBillingFrequency: 'monthly',
    invoiceBillingFrequency: 'monthly',
    serviceOrderAvailable: true,
    productsMatch: true,
    matchedProducts: [],
    ...overrides,
  };
}

export function row(
  overrides: Partial<InvoiceRow> & { vendor: string },
): InvoiceRow {
  return {
    id: overrides.vendor,
    currency: 'USD',
    recordedAmount: null,
    currentBudget: 0,
    product: [],
    tags: [],
    dueDate: null,
    validation: undefined,
    termStartDate: null,
    termEndDate: null,
    executionDate: null,
    ...overrides,
  } as unknown as InvoiceRow;
}
