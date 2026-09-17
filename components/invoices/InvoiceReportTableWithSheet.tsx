'use client';

import { useState, type ComponentProps } from 'react';
import type { Row } from '@tanstack/react-table';
import { ContractsTableClient } from '@/components/contracts/ContractsTableClient';
import InvoiceDiscrepancySheet from './InvoiceDiscrepancySheet';
import type { InvoiceRow } from './InvoicesTable';
import type { ContractTableRow } from '@/lib/v2/core/types';
import type { InvoiceValidation } from '@/lib/v2/invoices/validation';

type ContractsTableClientProps = ComponentProps<typeof ContractsTableClient>;

/**
 * Wraps ContractsTableClient for the Invoice Discrepancies report: clicking a
 * row opens the same discrepancy sheet the Invoices module uses, instead of
 * navigating away via the product cell's link (which ContractsTableClient
 * itself suppresses whenever `enableDiscrepancySheet` is on).
 */
export function InvoiceReportTableWithSheet({
  invoiceValidationsById,
  ...tableProps
}: ContractsTableClientProps & {
  invoiceValidationsById: Record<number, InvoiceValidation>;
}) {
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(
    null,
  );

  return (
    <>
      <ContractsTableClient
        {...tableProps}
        enableDiscrepancySheet
        onRowClick={(row: Row<ContractTableRow>) => {
          const validation = invoiceValidationsById[Number(row.original.id)];
          setSelectedInvoice({
            ...row.original,
            validation,
          } as InvoiceRow);
        }}
      />
      <InvoiceDiscrepancySheet
        invoice={selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
      />
    </>
  );
}
