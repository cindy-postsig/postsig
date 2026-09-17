import { isInvoiceType } from '@/app/lib/constants';

/**
 * Names a single-document CSV export after what the document actually is, so
 * invoices don't download as `contract-<id>.csv`.
 */
export function documentExportFilename(
  typeId: number | null | undefined,
  id: number,
): string {
  const noun = isInvoiceType(typeId) ? 'invoice' : 'contract';
  return `${noun}-${id}.csv`;
}
