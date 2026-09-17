import type { Database } from '@/database.types';

export type InvoiceStatus = Database['public']['Enums']['invoice_status'];

export const DEFAULT_INVOICE_STATUS: InvoiceStatus = 'review';

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  review: 'In Review',
  incomplete: 'Incomplete',
  declined: 'Declined',
  void: 'Void',
  paid: 'Paid',
  approved: 'Approved',
};

export function resolveDefaultInvoiceStatus(
  statuses: Array<string | null | undefined>,
): string {
  const hasReviewInvoices = statuses.some(
    (status) => (status || DEFAULT_INVOICE_STATUS) === DEFAULT_INVOICE_STATUS,
  );
  return hasReviewInvoices ? DEFAULT_INVOICE_STATUS : 'all';
}

export function getInvoiceStatusLabel(
  status: string | null | undefined,
): string {
  return (
    INVOICE_STATUS_LABELS[
      (status || DEFAULT_INVOICE_STATUS) as InvoiceStatus
    ] ||
    status ||
    ''
  );
}
