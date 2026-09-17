'use client';

import type { BillingFrequencyContract } from '@/lib/v2/chat/client';
import {
  createBaseContractColumns,
  ResultsTable,
  type BaseQueryContractsRow,
  type ColumnConfig,
} from '../shared';

interface BillingFrequencyRow extends BaseQueryContractsRow {
  billing: string;
  paymentTerms: string;
}

const columns: ColumnConfig<BillingFrequencyRow>[] = [
  ...createBaseContractColumns<BillingFrequencyRow>(),
  {
    key: 'billing',
    header: 'Billing',
    exportFormat: (value) => String(value),
  },
  {
    key: 'paymentTerms',
    header: 'Payment Terms',
    className: 'max-w-[200px] whitespace-normal align-top',
    render: (value) => (
      <span className="block text-sm leading-5">
        {(value as string) || '—'}
      </span>
    ),
    exportFormat: (value) => String(value),
  },
];

export function BillingFrequencySummary({
  data,
}: {
  data: BillingFrequencyContract[];
}) {
  const rows: BillingFrequencyRow[] = data.map((c) => ({
    contractId: c.id,
    vendorName: c.vendor ?? 'Unknown Vendor',
    contractType: c.contractType ?? '-',
    billing: c.billingFrequency,
    paymentTerms: c.paymentTerms !== 'Not specified' ? c.paymentTerms : '—',
  }));

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {data.length} contract{data.length !== 1 ? 's' : ''} with billing info
      </p>
      <ResultsTable rows={rows} columns={columns} />
    </div>
  );
}
