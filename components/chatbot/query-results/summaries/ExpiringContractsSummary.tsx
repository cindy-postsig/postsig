'use client';

import { useMemo } from 'react';
import type { ExpiringContractsResult } from '@/lib/v2/chat/client';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import {
  createBaseContractColumns,
  createCurrencyColumn,
  formatCurrency,
  formatDate,
  ResultsTable,
  type BaseQueryContractsRow,
  type ColumnConfig,
} from '../shared';
import { useDateFormat } from '@/hooks/useDateFormat';

interface ExpiringRow extends BaseQueryContractsRow {
  expiresOn: string;
  tcv: number;
}

function buildColumns(currency: string): ColumnConfig<ExpiringRow>[] {
  return [
    ...createBaseContractColumns<ExpiringRow>(),
    {
      key: 'expiresOn',
      header: 'Expires',
      exportFormat: (value) => String(value),
    },
    createCurrencyColumn<ExpiringRow>('tcv', 'TCV', currency),
  ];
}

export function ExpiringContractsSummary({
  data,
}: {
  data: ExpiringContractsResult;
}) {
  const { dateFormat } = useDateFormat();
  const { baseCurrency } = useBaseCurrency();
  const columns = useMemo(() => buildColumns(baseCurrency), [baseCurrency]);
  const rows: ExpiringRow[] = data.contracts.map((c) => ({
    contractId: c.id,
    vendorName: c.vendor ?? 'Unknown Vendor',
    contractType: c.contractType ?? (c.autoRenewal ? 'Auto-Renewal' : '-'),
    expiresOn: c.termEndDate
      ? formatDate(c.termEndDate, dateFormat)
      : 'Unknown',
    tcv: c.tcv,
  }));

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2 text-xs">
        <span className="font-medium">{data.count} expiring contracts</span>
        <span className="text-muted-foreground">
          Total TCV: {formatCurrency(data.totalTCV, baseCurrency)}
        </span>
      </div>
      <ResultsTable rows={rows} columns={columns} />
    </div>
  );
}
