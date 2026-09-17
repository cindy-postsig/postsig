'use client';

import { useMemo } from 'react';
import type { PriceIncreaseResult } from '@/lib/v2/chat/client';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import {
  createBaseContractColumns,
  createCurrencyColumn,
  formatCurrency,
  formatDate,
  formatPercent,
  ResultsTable,
  type BaseQueryContractsRow,
  type ColumnConfig,
} from '../shared';
import { useDateFormat } from '@/hooks/useDateFormat';

interface PriceIncreaseRow extends BaseQueryContractsRow {
  currentSpend: number;
  projectedSpend: number;
  increase: number;
  increasePercent: number;
  renewsOn: string;
}

function buildColumns(currency: string): ColumnConfig<PriceIncreaseRow>[] {
  return [
    ...createBaseContractColumns<PriceIncreaseRow>(),
    createCurrencyColumn<PriceIncreaseRow>(
      'currentSpend',
      'Current Spend',
      currency,
    ),
    createCurrencyColumn<PriceIncreaseRow>(
      'projectedSpend',
      'Projected Spend',
      currency,
    ),
    createCurrencyColumn<PriceIncreaseRow>('increase', 'Increase', currency),
    {
      key: 'increasePercent',
      header: 'Increase %',
      render: (value) => formatPercent(value as number),
      exportFormat: (value) => String(value),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      key: 'renewsOn',
      header: 'Renews',
      exportFormat: (value) => String(value),
    },
  ];
}

export function PriceIncreaseSummary({ data }: { data: PriceIncreaseResult }) {
  const { dateFormat } = useDateFormat();
  const { baseCurrency } = useBaseCurrency();
  const columns = useMemo(() => buildColumns(baseCurrency), [baseCurrency]);
  const rows: PriceIncreaseRow[] = data.contracts.map((c) => ({
    contractId: c.id,
    vendorName: c.vendor ?? 'Unknown Vendor',
    contractType: c.contractType ?? '-',
    currentSpend: c.currentBudgetUSD,
    projectedSpend: c.projectedBudgetUSD,
    increase: c.increaseUSD,
    increasePercent: c.increasePercent,
    renewsOn: formatDate(c.termEndDate, dateFormat),
  }));

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2 text-xs">
        <span className="font-medium">
          {data.count} contracts with escalators
        </span>
        <span className="text-muted-foreground">
          Total Increase: {formatCurrency(data.totalIncreaseUSD, baseCurrency)}
        </span>
      </div>
      <ResultsTable rows={rows} columns={columns} />
    </div>
  );
}
