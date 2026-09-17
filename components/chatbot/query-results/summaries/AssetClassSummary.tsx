'use client';

import type { AssetClassContract } from '@/lib/v2/chat/client';
import {
  createBaseContractColumns,
  ResultsTable,
  type BaseQueryContractsRow,
  type ColumnConfig,
} from '@/components/chatbot/query-results/shared';

interface AssetClassRow extends BaseQueryContractsRow {
  assetClasses: string;
}

const columns: ColumnConfig<AssetClassRow>[] = [
  ...createBaseContractColumns<AssetClassRow>(),
  {
    key: 'assetClasses',
    header: 'Asset Classes',
    render: (value) => <span>{(value as string) || '—'}</span>,
    exportFormat: (value) => String(value),
  },
];

export function AssetClassSummary({ data }: { data: AssetClassContract[] }) {
  const rows: AssetClassRow[] = data.map((c) => ({
    contractId: c.id,
    vendorName: c.vendor ?? 'Unknown Vendor',
    contractType: c.contractType ?? '-',
    assetClasses: c.assetClasses.join(', '),
  }));

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {data.length} contract{data.length !== 1 ? 's' : ''} with asset classes
      </p>
      <ResultsTable rows={rows} columns={columns} />
    </div>
  );
}
