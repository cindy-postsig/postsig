'use client';

import type { DiscountContract } from '@/lib/v2/chat/client';
import {
  createBaseContractColumns,
  ResultsTable,
  type BaseQueryContractsRow,
  type ColumnConfig,
} from '../shared';

interface DiscountRow extends BaseQueryContractsRow {
  discount: string;
}

const columns: ColumnConfig<DiscountRow>[] = [
  ...createBaseContractColumns<DiscountRow>(),
  {
    key: 'discount',
    header: 'Discount',
    render: (value) => {
      const str = value as string;
      if (str === '—') return <span>—</span>;
      return (
        <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded px-1.5 py-0.5">
          {str}
        </span>
      );
    },
    exportFormat: (value) => String(value),
  },
];

export function DiscountsSummary({ data }: { data: DiscountContract[] }) {
  const rows: DiscountRow[] = data.map((c) => ({
    contractId: c.id,
    vendorName: c.vendor ?? 'Unknown Vendor',
    contractType: c.contractType ?? '-',
    discount: c.discount != null ? `${c.discount}% off` : '—',
  }));

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {data.length} contract{data.length !== 1 ? 's' : ''} with discounts
      </p>
      <ResultsTable rows={rows} columns={columns} />
    </div>
  );
}
