'use client';

import type { UsageRestrictionsContract } from '@/lib/v2/chat/client';
import {
  createBaseContractColumns,
  ResultsTable,
  type BaseQueryContractsRow,
  type ColumnConfig,
} from '../shared';

interface UsageRestrictionsRow extends BaseQueryContractsRow {
  scope: string;
  geo: string;
  distribution: string;
}

const columns: ColumnConfig<UsageRestrictionsRow>[] = [
  ...createBaseContractColumns<UsageRestrictionsRow>(),
  {
    key: 'scope',
    header: 'Scope',
    className: 'max-w-[200px] whitespace-normal align-top',
    render: (value) => (
      <span className="block text-sm leading-5">
        {(value as string) || '—'}
      </span>
    ),
    exportFormat: (value) => String(value),
  },
  {
    key: 'geo',
    header: 'Geo',
    className: 'max-w-[200px] whitespace-normal align-top',
    render: (value) => (
      <span className="block text-sm leading-5">
        {(value as string) || '—'}
      </span>
    ),
    exportFormat: (value) => String(value),
  },
  {
    key: 'distribution',
    header: 'Distribution',
    className: 'max-w-[200px] whitespace-normal align-top',
    render: (value) => (
      <span className="block text-sm leading-5">
        {(value as string) || '—'}
      </span>
    ),
    exportFormat: (value) => String(value),
  },
];

export function UsageRestrictionsSummary({
  data,
}: {
  data: UsageRestrictionsContract[];
}) {
  const rows: UsageRestrictionsRow[] = data.map((c) => ({
    contractId: c.id,
    vendorName: c.vendor ?? 'Unknown Vendor',
    contractType: c.contractType ?? '-',
    scope: c.scopeOfUse || '—',
    geo: c.geoRestrictions || '—',
    distribution: c.distributionRights || '—',
  }));

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {data.length} contract{data.length !== 1 ? 's' : ''} with restrictions
      </p>
      <ResultsTable rows={rows} columns={columns} />
    </div>
  );
}
