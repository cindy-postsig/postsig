'use client';

import {
  AllocationSheet,
  type AllocationSheetSubject,
} from '@/components/contracts/cost-allocation/AllocationSheet';
import { formatDate } from '@/lib/date-format';
import type { InvoiceReportRow } from '@/lib/v2/cost-allocation/invoice-report-rows';

interface InvoiceAllocationSheetProps {
  row: InvoiceReportRow | null;
  canEdit: boolean;
  formatAmount: (value: number | null) => string;
  dateFormat: string;
  onClose: () => void;
}

export function InvoiceAllocationSheet({
  row,
  canEdit,
  formatAmount,
  dateFormat,
  onClose,
}: InvoiceAllocationSheetProps) {
  const subject: AllocationSheetSubject | null =
    row === null
      ? null
      : {
          id: row.id,
          title: row.product || row.vendor,
          vendor: row.vendor,
          vendorDomain: row.vendorDomain,
          contextFields: [
            { label: 'Contract', value: row.parentContract?.label ?? '—' },
            { label: 'Invoice No.', value: row.invoiceNumber ?? '—' },
            {
              label: 'Billing Date',
              value: formatDate(row.billingDate, dateFormat),
            },
            { label: 'Invoice Amount', value: formatAmount(row.amount) },
          ],
          ...(row.parentContract
            ? {
                link: {
                  href: `/contracts/${row.parentContract.id}`,
                  label: row.parentContract.label,
                  caption: 'Linked Contract',
                },
              }
            : {}),
        };

  return (
    <AllocationSheet
      subject={subject}
      canEdit={canEdit}
      formatAmount={formatAmount}
      onClose={onClose}
    />
  );
}
