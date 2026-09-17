'use client';

import type { DataQueryResult } from '@/lib/v2/chat/client';
import {
  createBaseContractColumns,
  renderContractsAsCardsOrTable,
  type BaseQueryContractsRow,
  type ColumnConfig,
} from '../shared';

interface DataQueryRow extends BaseQueryContractsRow {
  clause: string;
}

const columns: ColumnConfig<DataQueryRow>[] = [
  ...createBaseContractColumns<DataQueryRow>(),
  {
    key: 'clause',
    header: 'Clause',
    className: 'max-w-[420px] whitespace-normal align-top',
    render: (value) => (
      <span className="block text-sm leading-5">
        {(value as string) || '—'}
      </span>
    ),
    exportFormat: (value) => String(value),
  },
];

export function DataQuerySummary({ data }: { data: DataQueryResult }) {
  if (data.contracts.length === 0) {
    return null;
  }

  const excerptByContract = new Map(
    data.excerpts.map((e) => [e.contractId, e]),
  );

  const contracts = data.contracts.map((c) => ({
    contractId: c.id,
    vendorName: c.vendor ?? 'Unknown Vendor',
    contractType: c.contractType ?? '-',
    label: excerptByContract.get(c.id)?.title,
    summary: c.clauseContent !== 'Not specified' ? c.clauseContent : undefined,
  }));
  const rows: DataQueryRow[] = data.contracts.map((c) => ({
    contractId: c.id,
    vendorName: c.vendor ?? 'Unknown Vendor',
    contractType: c.contractType ?? '-',
    clause: c.clauseContent !== 'Not specified' ? c.clauseContent : '—',
  }));

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Found {data.contracts.length} contract
        {data.contracts.length !== 1 ? 's' : ''}
      </p>
      {renderContractsAsCardsOrTable({ cards: contracts, rows, columns })}
    </div>
  );
}
