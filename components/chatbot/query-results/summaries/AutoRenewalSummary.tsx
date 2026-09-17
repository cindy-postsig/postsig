'use client';

import { useMemo } from 'react';
import type { RenewalsResult } from '@/lib/v2/chat/client';
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

interface AutoRenewalRow extends BaseQueryContractsRow {
  cancelByDate: string;
  termEndDate: string;
  tcv: number;
  renewalType: string;
}

function buildColumns(currency: string): ColumnConfig<AutoRenewalRow>[] {
  return [
    ...createBaseContractColumns<AutoRenewalRow>(),
    {
      key: 'renewalType',
      header: 'Renewal Type',
      exportFormat: (value) => String(value),
    },
    {
      key: 'cancelByDate',
      header: 'Cancel By',
      exportFormat: (value) => String(value),
    },
    {
      key: 'termEndDate',
      header: 'Term End',
      exportFormat: (value) => String(value),
    },
    createCurrencyColumn<AutoRenewalRow>('tcv', 'TCV', currency),
  ];
}

export function AutoRenewalSummary({ data }: { data: RenewalsResult }) {
  const { dateFormat } = useDateFormat();
  const { baseCurrency } = useBaseCurrency();
  const columns = useMemo(() => buildColumns(baseCurrency), [baseCurrency]);
  const rows: AutoRenewalRow[] = data.contracts.map((c) => ({
    contractId: c.id,
    contractType: c.contractType ?? '-',
    vendorName: c.vendor ?? 'Unknown Vendor',
    renewalType: c.renewalType ?? '-',
    cancelByDate: formatDate(c.cancelByDate, dateFormat),
    termEndDate: formatDate(c.termEndDate, dateFormat),
    tcv: c.tcv,
  }));

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2 text-xs">
        <span className="font-medium">{data.count} auto-renewal contracts</span>
        <span className="text-muted-foreground">
          Exposure: {formatCurrency(data.totalRenewalExposure, baseCurrency)}
        </span>
      </div>
      <ResultsTable rows={rows} columns={columns} />
    </div>
  );
}
