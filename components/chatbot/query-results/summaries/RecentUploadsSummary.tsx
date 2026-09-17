'use client';

import type { RecentUploadsResult } from '@/lib/v2/chat/client';
import {
  createBaseContractColumns,
  renderContractsAsCardsOrTable,
  formatDate,
  type BaseQueryContractsRow,
  type ColumnConfig,
} from '../shared';
import { useDateFormat } from '@/hooks/useDateFormat';

interface RecentUploadRow extends BaseQueryContractsRow {
  details: string;
}

const columns: ColumnConfig<RecentUploadRow>[] = [
  ...createBaseContractColumns<RecentUploadRow>(),
  {
    key: 'details',
    header: 'Details',
    className: 'max-w-[320px] whitespace-normal align-top',
    render: (value) => (
      <span className="block text-sm leading-5">
        {(value as string) || '—'}
      </span>
    ),
    exportFormat: (value) => String(value),
  },
];

export function RecentUploadsSummary({ data }: { data: RecentUploadsResult }) {
  const { dateFormat } = useDateFormat();
  const contracts = data.contracts.map((c) => ({
    contractId: c.id,
    vendorName: c.vendor ?? 'Unknown Vendor',
    contractType: c.contractType ?? '-',
    summary: c.summary ?? `Uploaded: ${formatDate(c.createdAt, dateFormat)}`,
  }));
  const rows: RecentUploadRow[] = data.contracts.map((c) => ({
    contractId: c.id,
    vendorName: c.vendor ?? 'Unknown Vendor',
    contractType: c.contractType ?? '-',
    details: c.summary ?? `Uploaded: ${formatDate(c.createdAt, dateFormat)}`,
  }));

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {data.count} recently uploaded contract{data.count !== 1 ? 's' : ''}
      </p>
      {renderContractsAsCardsOrTable({ cards: contracts, rows, columns })}
    </div>
  );
}
