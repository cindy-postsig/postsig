import { parseProviderDate, termDateEntries } from './dates';
import type { XeroInvoice, RampInvoice, MappedInvoiceContract } from './types';

const contractStatuses = { new: 1 };

export function mapXeroStatusToInvoiceStatus(
  status: string | null | undefined,
): MappedInvoiceContract['invoice_status'] {
  switch (status?.toUpperCase()) {
    case 'DRAFT':
      return 'incomplete';
    case 'SUBMITTED':
      return 'review';
    case 'AUTHORISED':
    case 'AUTHORIZED':
      return 'approved';
    case 'VOIDED':
      return 'void';
    case 'PAID':
      return 'paid';
    case 'DELETED':
      return 'declined';
    default:
      return 'review';
  }
}

export function mapXeroInvoiceToContract(
  invoice: XeroInvoice,
): MappedInvoiceContract {
  const executionDate = parseProviderDate(invoice.Date);
  const dueDate = parseProviderDate(invoice.DueDate);
  return {
    external_source: 'xero',
    external_invoice_id: invoice.InvoiceID,
    external_invoice_status: invoice.Status,
    type_id: 6,
    invoice_status: mapXeroStatusToInvoiceStatus(invoice.Status),
    vendor_name: invoice.Contact?.Name ?? 'Unknown Vendor',
    currency: invoice.CurrencyCode ?? 'USD',
    current_budget: invoice.AmountDue ?? invoice.Total ?? 0,
    billing_frequency: 'One-Time',
    execution_date: executionDate,
    due_date: dueDate,
    term_start_date: termDateEntries(executionDate),
    term_end_date: null,
    summary: `Xero Invoice ${invoice.InvoiceNumber ?? invoice.InvoiceID}`,
    last_synced_at: new Date().toISOString(),
    status_id: contractStatuses.new,
  };
}

export function getRampExternalInvoiceStatus(
  invoice: RampInvoice,
): string | undefined {
  const billStatus = invoice.status?.toUpperCase();
  if (billStatus === 'PAID') {
    return 'PAID';
  }

  return invoice.approval_status ?? invoice.state ?? invoice.status;
}

export function mapRampStatusToInvoiceStatus(
  externalStatus: string | null | undefined,
): MappedInvoiceContract['invoice_status'] {
  switch (externalStatus?.toUpperCase()) {
    case 'PAID':
      return 'paid';
    case 'APPROVED':
      return 'approved';
    case 'TERMINATED':
      return 'void';
    case 'REJECTED':
      return 'declined';
    case 'INITIALIZED':
    case 'PENDING':
    default:
      return 'review';
  }
}

export function mapRampInvoiceToContract(
  invoice: RampInvoice,
): MappedInvoiceContract {
  const totalAmount = invoice.amount ?? 0;
  const externalInvoiceStatus = getRampExternalInvoiceStatus(invoice);
  const executionDate = parseProviderDate(invoice.invoice_date);
  const dueDate = parseProviderDate(invoice.due_date);

  return {
    external_source: 'ramp',
    external_invoice_id: invoice.id,
    external_invoice_status: externalInvoiceStatus,
    type_id: 6,
    invoice_status: mapRampStatusToInvoiceStatus(externalInvoiceStatus),
    vendor_name: invoice.merchant?.name ?? 'Unknown Vendor',
    currency: invoice.currency_code ?? 'USD',
    current_budget: totalAmount,
    billing_frequency: 'One-Time',
    execution_date: executionDate,
    due_date: dueDate,
    term_start_date: termDateEntries(executionDate),
    term_end_date: null,
    summary: `Ramp Invoice ${invoice.invoice_number ?? invoice.id}`,
    last_synced_at: new Date().toISOString(),
    status_id: contractStatuses.new,
  };
}
