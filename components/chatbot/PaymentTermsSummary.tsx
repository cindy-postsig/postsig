'use client';

import type { ReactNode } from 'react';
import { FileText } from 'lucide-react';
import type {
  PaymentTermsToolOutput,
  FlatPaymentTermsContract,
} from '@/lib/v2/chat/client';
import { isToolError, DISPLAY_RESULT_LIMIT } from '@/lib/v2/chat/client';
import { getPaymentTermsColumnHeader } from '@/lib/v2/chat/guidance/payment-terms-guidance';
import {
  DataTable,
  type ColumnConfig,
} from '@/components/chatbot/GenericDataTable';
import { ContractLink } from '@/components/chatbot/ContractLink';

// =============================================================================
// ROW TYPE
// =============================================================================

export interface PaymentTermsRow extends Record<string, unknown> {
  contractId: number;
  billing: string;
  currency: string;
  term: string;
  isGoverning: boolean;
  isRoot: boolean;
  paymentTerms: string | null;
  termStartDate: string | null;
  termEndDate: string | null;
}

export interface PaymentTermsTablePresentation {
  title: string;
  exportFilename: string;
  icon: ReactNode;
}

// =============================================================================
// HELPERS
// =============================================================================

export function formatPaymentTermsDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function buildPaymentTermsTableRow(
  contract: FlatPaymentTermsContract,
): PaymentTermsRow {
  return {
    contractId: contract.id,
    billing: contract.billingFrequency || '—',
    currency: contract.currency || '—',
    term: `${formatPaymentTermsDate(contract.termStartDate)} – ${formatPaymentTermsDate(contract.termEndDate)}`,
    isGoverning: contract.governedBy === contract.id,
    isRoot: contract.isRoot,
    paymentTerms: contract.paymentTerms,
    termStartDate: contract.termStartDate,
    termEndDate: contract.termEndDate,
  };
}

export function transformToPaymentTermsTableRows(
  contracts: FlatPaymentTermsContract[],
  limit = DISPLAY_RESULT_LIMIT,
): PaymentTermsRow[] {
  return contracts.slice(0, limit).map(buildPaymentTermsTableRow);
}

export function buildPaymentTermsTablePresentation(
  data: PaymentTermsToolOutput,
): PaymentTermsTablePresentation | null {
  if (isToolError(data)) {
    return null;
  }

  return {
    title: `${data.vendorName} Payment Terms`,
    exportFilename: `${data.vendorName.replace(/\s+/g, '-').toLowerCase()}-payment-terms`,
    icon: <FileText className="h-4 w-4 text-muted-foreground" />,
  };
}

// =============================================================================
// COLUMN DEFINITIONS
// =============================================================================

export const paymentTermsColumns: ColumnConfig<PaymentTermsRow>[] = [
  {
    key: 'contractId',
    header: getPaymentTermsColumnHeader('contractId'),
    render: (value, row) => (
      <div className="flex items-center gap-1.5">
        <ContractLink contractId={value as number} />
        {row.isGoverning && (
          <span className="shrink-0 rounded bg-blue-100 px-1 py-0.5 text-[9px] text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            Governs
          </span>
        )}
      </div>
    ),
    exportFormat: (value) => String(value),
  },
  {
    key: 'billing',
    header: getPaymentTermsColumnHeader('billing'),
  },
  {
    key: 'currency',
    header: getPaymentTermsColumnHeader('currency'),
  },
  {
    key: 'term',
    header: getPaymentTermsColumnHeader('term'),
    exportFormat: (_value, row) =>
      `${row.termStartDate || ''} – ${row.termEndDate || ''}`,
  },
  {
    key: 'paymentTerms',
    header: getPaymentTermsColumnHeader('paymentTerms'),
    render: (value) => {
      const terms = value as string | null;
      if (!terms) return <span className="text-muted-foreground">—</span>;
      return (
        <span
          className="block max-w-[200px] truncate italic text-muted-foreground"
          title={terms}
        >
          {terms.length > 80 ? `${terms.slice(0, 80)}…` : terms}
        </span>
      );
    },
    exportFormat: (value) => (value as string) || '',
    className: 'max-w-[200px]',
  },
];

// =============================================================================
// MAIN EXPORT
// =============================================================================

export function PaymentTermsSummary({
  data,
}: {
  data: PaymentTermsToolOutput;
}) {
  if (isToolError(data)) {
    if (data.error === '_NO_RESULTS_') {
      return null;
    }
    return (
      <p className="text-xs text-red-600 dark:text-red-400">{data.error}</p>
    );
  }

  const presentation = buildPaymentTermsTablePresentation(data);
  const rows = transformToPaymentTermsTableRows(data.contracts);
  const hasMore = data.contracts.length > DISPLAY_RESULT_LIMIT;
  if (!presentation) return null;

  return (
    <div className="space-y-1">
      <DataTable
        data={rows}
        columns={paymentTermsColumns}
        title={presentation.title}
        icon={presentation.icon}
        showExport={true}
        exportFilename={presentation.exportFilename}
        scrollAreaClassName="max-h-[300px] overflow-y-auto"
        striped={true}
        className="my-2"
      />
      {hasMore && (
        <p className="text-[10px] text-muted-foreground">
          +{data.contracts.length - DISPLAY_RESULT_LIMIT} more contracts
        </p>
      )}
    </div>
  );
}

export function PaymentTermsSummaryLoading() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-3 w-32 rounded bg-muted" />
      <div className="h-3 w-full rounded bg-muted" />
      <div className="h-3 w-full rounded bg-muted" />
      <div className="h-3 w-3/4 rounded bg-muted" />
    </div>
  );
}
