'use client';

import type { DoraComplianceContract } from '@/lib/v2/chat/client';
import {
  createBaseContractColumns,
  ResultsTable,
  type BaseQueryContractsRow,
  type ColumnConfig,
} from '../shared';

interface DoraComplianceRow extends BaseQueryContractsRow {
  score: string;
  missingCategories: string;
  isICT: boolean;
}

const columns: ColumnConfig<DoraComplianceRow>[] = [
  ...createBaseContractColumns<DoraComplianceRow>(),
  {
    key: 'isICT',
    header: 'ICT',
    render: (value) => (
      <span
        className={
          value
            ? 'rounded bg-blue-100 px-1.5 py-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
            : 'text-muted-foreground'
        }
      >
        {value ? 'Yes' : 'No'}
      </span>
    ),
    exportFormat: (value) => (value ? 'Yes' : 'No'),
  },
  {
    key: 'score',
    header: 'Score',
    render: (value) => (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
        {value as string}
      </span>
    ),
    exportFormat: (value) => String(value),
  },
  {
    key: 'missingCategories',
    header: 'Missing Categories',
    className: 'max-w-[300px] whitespace-normal align-top',
    render: (value) => (
      <span className="block text-sm leading-5">
        {(value as string) || '—'}
      </span>
    ),
    exportFormat: (value) => String(value),
  },
];

export function DoraComplianceSummary({
  data,
}: {
  data: DoraComplianceContract[];
}) {
  const rows: DoraComplianceRow[] = data.map((c) => ({
    contractId: c.id,
    vendorName: c.vendor ?? 'Unknown Vendor',
    contractType: c.contractType ?? '-',
    score: `${c.doraScore}/${c.maxScore}`,
    missingCategories: c.missingCategories.join(', '),
    isICT: c.hasICTVendor,
  }));

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {data.length} contract{data.length !== 1 ? 's' : ''} with DORA gaps
      </p>
      <ResultsTable rows={rows} columns={columns} />
    </div>
  );
}
