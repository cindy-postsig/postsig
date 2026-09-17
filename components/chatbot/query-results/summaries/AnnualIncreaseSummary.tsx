'use client';

import { useMemo } from 'react';
import type { AnnualIncreaseResult } from '@/lib/v2/chat/client';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import {
  createBaseContractColumns,
  createCurrencyColumn,
  formatCurrency,
  formatPercent,
  ResultsTable,
  type BaseQueryContractsRow,
  type ColumnConfig,
} from '../shared';

interface AnnualIncreaseRow extends BaseQueryContractsRow {
  annualIncrease: number | null;
  currentBudget: number;
  projectedBudget: number;
  annualDifference: number;
}

function buildColumns(currency: string): ColumnConfig<AnnualIncreaseRow>[] {
  return [
    ...createBaseContractColumns<AnnualIncreaseRow>(),
    {
      key: 'annualIncrease',
      header: 'Rate',
      render: (value) => (value == null ? '—' : formatPercent(value as number)),
      exportFormat: (value) => (value == null ? '' : String(value)),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    createCurrencyColumn<AnnualIncreaseRow>(
      'currentBudget',
      'Current',
      currency,
    ),
    createCurrencyColumn<AnnualIncreaseRow>(
      'projectedBudget',
      'Projected',
      currency,
    ),
    {
      key: 'annualDifference',
      header: 'Change %',
      render: (value) => formatPercent(value as number),
      exportFormat: (value) => String(value),
      className: 'text-right',
      headerClassName: 'text-right',
    },
  ];
}

export function AnnualIncreaseSummary({
  data,
}: {
  data: AnnualIncreaseResult;
}) {
  const { baseCurrency } = useBaseCurrency();
  const columns = useMemo(() => buildColumns(baseCurrency), [baseCurrency]);
  const rows: AnnualIncreaseRow[] = data.contracts.map((c) => ({
    contractId: c.id,
    vendorName: c.vendor ?? 'Unknown Vendor',
    contractType: c.contractType ?? '-',
    annualIncrease: c.annualIncrease,
    currentBudget: c.currentBudgetUSD,
    projectedBudget: c.projectedBudgetUSD,
    annualDifference: c.annualDifference,
  }));

  const totalCurrent = rows.reduce((sum, r) => sum + r.currentBudget, 0);
  const totalProjected = rows.reduce((sum, r) => sum + r.projectedBudget, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2 text-xs">
        <span className="font-medium">
          {data.contracts.length} contract
          {data.contracts.length !== 1 ? 's' : ''}
        </span>
        <span className="text-muted-foreground">
          Current: {formatCurrency(totalCurrent, baseCurrency)} → Projected:{' '}
          {formatCurrency(totalProjected, baseCurrency)}
        </span>
      </div>
      <ResultsTable rows={rows} columns={columns} />
    </div>
  );
}
