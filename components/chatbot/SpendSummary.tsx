'use client';

import type {
  SpendToolOutput,
  ContractSpendDetail,
} from '@/lib/v2/chat/client';
import { isToolError, formatCurrency } from '@/lib/v2/chat/client';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import {
  getSpendColumnHeader,
  SPEND_TOTAL_ROW_LABEL,
} from '@/lib/v2/chat/guidance/spend-guidance';
import {
  DataTable,
  type ColumnConfig,
  type FooterCell,
} from './GenericDataTable';
import { ContractLink } from './ContractLink';
import { createVendorColumn } from '@/lib/v2/chat/columns';
import { cn } from '@/lib/utils';

export interface SpendTotals {
  totalContractValueUSD: number;
  currentBudgetUSD: number;
  projectedBudgetUSD: number;
}

export interface SpendTableRow extends Record<string, unknown> {
  contractId: number;
  vendorName: string;
  contractType: string;
  currentBudget: number;
  projectedBudget: number;
  tcv: number;
  isExcludedFromTotals: boolean;
}

export interface SpendTablePresentation {
  title: string;
  exportFilename: string;
  footerRow: FooterCell[];
}

export function transformToSpendTableRows(
  contracts: ContractSpendDetail[],
): SpendTableRow[] {
  return contracts.map((contract) => ({
    contractId: contract.contractId,
    vendorName: contract.vendorName || '-',
    contractType: contract.contractType || '-',
    currentBudget: contract.currentBudgetUSD,
    projectedBudget: contract.projectedBudgetUSD,
    tcv: contract.totalContractValueUSD,
    isExcludedFromTotals: contract.isExcludedFromTotals ?? false,
  }));
}

const STRICKEN = 'line-through opacity-60';

const vendorNameColumn: ColumnConfig<SpendTableRow> =
  createVendorColumn<SpendTableRow>();

export function buildSpendColumns(
  currency = 'USD',
): ColumnConfig<SpendTableRow>[] {
  return [
    {
      key: 'contractId',
      header: getSpendColumnHeader('contractId'),
      render: (value) => <ContractLink contractId={value as number} />,
      className: 'text-muted-foreground',
    },
    {
      key: 'contractType',
      header: getSpendColumnHeader('contractType'),
      render: (value) => <span>{value as string}</span>,
      className: 'max-w-[120px] truncate text-muted-foreground',
    },
    {
      key: 'currentBudget',
      header: getSpendColumnHeader('currentBudget'),
      render: (value, row) => (
        <span className={cn(row.isExcludedFromTotals && STRICKEN)}>
          {formatCurrency(value as number, currency)}
        </span>
      ),
      exportFormat: (value) => String(value),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      key: 'projectedBudget',
      header: getSpendColumnHeader('projectedBudget'),
      render: (value, row) => {
        const projectedBudget = value as number;
        const currentBudget = row.currentBudget;
        const excluded = row.isExcludedFromTotals;
        const change = projectedBudget - currentBudget;
        if (change > 0) {
          return (
            <span
              className={cn(
                'rounded bg-[#B90C41] bg-opacity-10 p-2 text-[#B90C41]',
                excluded && STRICKEN,
              )}
            >
              {formatCurrency(projectedBudget, currency)}
            </span>
          );
        }
        if (change < 0) {
          return (
            <span
              className={cn(
                'rounded bg-[#00A86B] bg-opacity-10 p-2 text-[#009861]',
                excluded && STRICKEN,
              )}
            >
              {formatCurrency(projectedBudget, currency)}
            </span>
          );
        }
        return (
          <span
            className={cn('rounded bg-secondary p-2', excluded && STRICKEN)}
          >
            {formatCurrency(projectedBudget, currency)}
          </span>
        );
      },
      exportFormat: (value) => String(value),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      key: 'tcv',
      header: getSpendColumnHeader('tcv'),
      render: (value, row) => (
        <span
          className={cn('font-medium', row.isExcludedFromTotals && STRICKEN)}
        >
          {formatCurrency(value as number, currency)}
        </span>
      ),
      exportFormat: (value) => String(value),
      className: 'text-right',
      headerClassName: 'text-right',
    },
  ];
}

export const spendColumns: ColumnConfig<SpendTableRow>[] = buildSpendColumns();

export function hasMultipleVendors(rows: SpendTableRow[]): boolean {
  const vendors = new Set(rows.map((r) => r.vendorName));
  return vendors.size > 1;
}

export function getSpendColumns(
  showVendor: boolean,
  currency = 'USD',
): ColumnConfig<SpendTableRow>[] {
  const columns = buildSpendColumns(currency);
  if (!showVendor) return columns;
  const [contractIdCol, ...rest] = columns;
  return [contractIdCol, vendorNameColumn, ...rest];
}

export function buildSpendFooterRow(
  totals: SpendTotals,
  showVendor = false,
  currency = 'USD',
): FooterCell[] {
  return [
    {
      key: 'contractId',
      label: SPEND_TOTAL_ROW_LABEL,
      value: '',
    },
    ...(showVendor
      ? [{ key: 'vendorName', value: '' } satisfies FooterCell]
      : []),
    {
      key: 'contractType',
      value: '',
    },
    {
      key: 'currentBudget',
      value: (
        <span className="font-semibold">
          {formatCurrency(totals.currentBudgetUSD, currency)}
        </span>
      ),
      className: 'text-right',
    },
    {
      key: 'projectedBudget',
      value: (
        <span className="font-semibold">
          {formatCurrency(totals.projectedBudgetUSD, currency)}
        </span>
      ),
      className: 'text-right',
    },
    {
      key: 'tcv',
      value: (
        <span className="font-semibold">
          {formatCurrency(totals.totalContractValueUSD, currency)}
        </span>
      ),
      className: 'text-right',
    },
  ];
}

export function buildSpendTablePresentation(
  data: SpendToolOutput,
  showVendor = false,
  currency = 'USD',
): SpendTablePresentation | null {
  if (isToolError(data)) {
    return null;
  }

  if (data.type === 'single_contract') {
    const { contract } = data;
    return {
      title: [contract.vendorName, contract.contractType]
        .filter(Boolean)
        .join(' · '),
      exportFilename: `contract-${contract.contractId}-spend`,
      footerRow: buildSpendFooterRow(
        {
          currentBudgetUSD: contract.currentBudgetUSD,
          projectedBudgetUSD: contract.projectedBudgetUSD,
          totalContractValueUSD: contract.totalContractValueUSD,
        },
        showVendor,
        currency,
      ),
    };
  }

  return {
    title: `${data.vendorName}`,
    exportFilename: `${data.vendorName.replace(/\s+/g, '-').toLowerCase()}-spend`,
    footerRow: buildSpendFooterRow(data.totals, showVendor, currency),
  };
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

export function SpendSummary({ data }: { data: SpendToolOutput }) {
  const { baseCurrency } = useBaseCurrency();

  if (isToolError(data)) {
    if (data.error === '_NO_RESULTS_') {
      return null;
    }
    return (
      <p className="text-xs text-red-600 dark:text-red-400">{data.error}</p>
    );
  }

  if (data.type === 'single_contract') {
    const tableRows = transformToSpendTableRows([data.contract]);
    const presentation = buildSpendTablePresentation(data, false, baseCurrency);
    if (!presentation) return null;

    return (
      <DataTable
        data={tableRows}
        columns={getSpendColumns(false, baseCurrency)}
        title={presentation.title}
        exportFilename={presentation.exportFilename}
        showExport={true}
        scrollAreaClassName="max-h-[300px] overflow-y-auto"
        striped={true}
        className="my-2"
        footerRow={presentation.footerRow}
      />
    );
  }

  const tableRows = transformToSpendTableRows(data.contracts);
  const showVendor = hasMultipleVendors(tableRows);
  const columns = getSpendColumns(showVendor, baseCurrency);
  const presentation = buildSpendTablePresentation(
    data,
    showVendor,
    baseCurrency,
  );
  if (!presentation) return null;

  return (
    <div className="space-y-2">
      {data.contracts.length > 0 && (
        <DataTable
          data={tableRows}
          columns={columns}
          title={presentation.title}
          exportFilename={presentation.exportFilename}
          showExport={true}
          scrollAreaClassName="max-h-[300px] overflow-y-auto"
          striped={true}
          className="my-2"
          footerRow={presentation.footerRow}
        />
      )}
    </div>
  );
}

export function SpendSummaryLoading() {
  return (
    <div className="animate-pulse space-y-1.5">
      <div className="h-3 w-24 rounded bg-muted" />
      <div className="h-3 w-48 rounded bg-muted" />
    </div>
  );
}
