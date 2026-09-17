'use client';

import { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  FilterableColumnHeader,
  type RangeFilter,
  type FilterValue,
} from '@/components/ui/data-table/components/FilterableColumnHeader';
import { selectFilterFn } from '@/components/ui/data-table/utils/filterUtils';
import { formatCurrency } from '@/app/lib/utils';
import VendorIcon from '@/components/vendors/VendorIcon';
import { FormattedDate } from '@/components/FormattedDate';
import type { PortfolioCompany, InvestmentStage } from './types';
import {
  INV_DATA_COVERAGE_LABELS,
  invDataCoverageLabel,
  resolveInvDataCoverage,
} from '@/lib/v2/inv/data-coverage';
import { getStageColor } from './colors';

export const TRIAL_COLUMN_IDS = [
  'company',
  'investmentStatus',
  'stage',
  'myFullyDilutedPercent',
  'multiple',
  'myTotalFMV',
  'myAggregateCost',
  'tags',
] as const;

function getStageStyles(stage: InvestmentStage): React.CSSProperties {
  const baseColor = getStageColor(stage);
  return {
    backgroundColor: baseColor,
    borderColor: baseColor,
    color: '#ffffff',
  };
}

function isRangeFilter(value: FilterValue | undefined): value is RangeFilter {
  return (
    value !== undefined &&
    !Array.isArray(value) &&
    typeof value === 'object' &&
    ('min' in value || 'max' in value)
  );
}

function rangeFilterFn(
  row: { getValue: (id: string) => unknown },
  id: string,
  filterValue: FilterValue,
): boolean {
  if (!filterValue) return true;
  if (Array.isArray(filterValue) && filterValue.length === 0) return true;

  if (isRangeFilter(filterValue)) {
    const raw = row.getValue(id) as number;
    if (raw === 0 || raw === null || raw === undefined) return true;
    // Round to 2 dp so the filter matches what the UI displays
    // (e.g. 4.000003 displays as $4 / 4.00 and should match max=4)
    const value = Math.round(raw * 100) / 100;
    if (filterValue.min !== undefined && value < filterValue.min) return false;
    if (filterValue.max !== undefined && value > filterValue.max) return false;
    return true;
  }

  return true;
}

export function createColumns(
  isInvestorTrial: boolean,
): ColumnDef<PortfolioCompany>[] {
  return [
    {
      id: 'company',
      accessorKey: 'name',
      header: ({ column, table }) => (
        <FilterableColumnHeader column={column} table={table} title="Company" />
      ),
      cell: ({ row }) => {
        const company = row.original;
        if (isInvestorTrial) {
          return (
            <div className="flex items-center gap-3">
              <VendorIcon
                name={company.name}
                domain={company.domain}
                width={36}
                height={36}
              />
              <span className="font-medium text-[1.05em] leading-tight">
                {company.name}
              </span>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-3">
            <Link
              href={`/investor/company/${company.id}`}
              onClick={(e) => e.stopPropagation()}
            >
              <VendorIcon
                name={company.name}
                domain={company.domain}
                width={36}
                height={36}
              />
            </Link>
            <Link
              href={`/investor/company/${company.id}`}
              className="font-medium text-[1.05em] leading-tight underline-offset-2 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {company.name}
            </Link>
          </div>
        );
      },
      filterFn: selectFilterFn,
      sortingFn: (a, b) =>
        (a.original.name ?? '').localeCompare(b.original.name ?? ''),
      meta: {
        className: 'min-w-[250px]',
      },
    },
    {
      accessorKey: 'stage',
      header: ({ column, table }) => (
        <FilterableColumnHeader column={column} table={table} title="Stage" />
      ),
      cell: ({ row }) => {
        const stage = row.original.stage;
        if (!stage) return null;
        return (
          <Badge
            variant="outline"
            className="whitespace-nowrap text-xs"
            style={getStageStyles(stage)}
          >
            {stage}
          </Badge>
        );
      },
      filterFn: selectFilterFn,
    },
    {
      accessorKey: 'stageAtEntry',
      header: ({ column, table }) => (
        <FilterableColumnHeader
          column={column}
          table={table}
          title="Stage at Entry"
        />
      ),
      cell: ({ row }) => {
        const stage = row.original.stageAtEntry;
        if (!stage) return null;
        return (
          <Badge
            variant="outline"
            className="whitespace-nowrap text-xs"
            style={getStageStyles(stage)}
          >
            {stage}
          </Badge>
        );
      },
      filterFn: selectFilterFn,
    },
    {
      accessorKey: 'investmentStatus',
      header: ({ column, table }) => (
        <FilterableColumnHeader column={column} table={table} title="Status" />
      ),
      cell: ({ row }) => {
        const status = row.original.investmentStatus;
        if (!status) return null;
        return (
          <Badge
            variant="outline"
            className={`text-xs ${
              status === 'Active'
                ? ''
                : 'border-foreground/20 bg-foreground/5 text-foreground'
            }`}
          >
            {status}
          </Badge>
        );
      },
      filterFn: selectFilterFn,
    },
    {
      id: 'dataCoverage',
      accessorFn: (row) => invDataCoverageLabel(row),
      header: ({ column, table }) => (
        <FilterableColumnHeader
          column={column}
          table={table}
          title="Data Coverage"
        />
      ),
      cell: ({ row }) => {
        const coverage = resolveInvDataCoverage(row.original);
        const label = INV_DATA_COVERAGE_LABELS[coverage];
        if (coverage === 'none') {
          return <span className="text-muted-foreground">{label}</span>;
        }
        return (
          <Badge
            variant="outline"
            className={`whitespace-nowrap text-xs ${
              coverage === 'transactions'
                ? ''
                : 'border-foreground/20 bg-foreground/5 text-foreground'
            }`}
          >
            {label}
          </Badge>
        );
      },
      filterFn: selectFilterFn,
    },
    {
      accessorKey: 'myTotalFMV',
      header: ({ column, table }) => (
        <FilterableColumnHeader
          column={column}
          table={table}
          title="My FMV"
          align="right"
          filterType="range"
        />
      ),
      cell: ({ row }) => {
        const value = row.original.myTotalFMV;
        if (value === 0)
          return <span className="text-muted-foreground">-</span>;
        return (
          <span className="tabular-nums">{formatCurrency(value, 'USD')}</span>
        );
      },
      filterFn: rangeFilterFn,
      meta: {
        className: 'text-right',
      },
    },
    {
      accessorKey: 'postMoneyValuation',
      header: ({ column, table }) => (
        <FilterableColumnHeader
          column={column}
          table={table}
          title="Post-Money"
          align="right"
          filterType="range"
        />
      ),
      cell: ({ row }) => {
        const value = row.original.postMoneyValuation;
        if (value === 0)
          return <span className="text-muted-foreground">-</span>;
        return (
          <span className="tabular-nums">{formatCurrency(value, 'USD')}</span>
        );
      },
      filterFn: rangeFilterFn,
      meta: {
        className: 'text-right',
      },
    },
    {
      accessorKey: 'myFullyDilutedPercent',
      header: ({ column, table }) => (
        <FilterableColumnHeader
          column={column}
          table={table}
          title="My FD%"
          align="right"
          filterType="range"
        />
      ),
      cell: ({ row }) => {
        const value = row.original.myFullyDilutedPercent;
        if (value === 0)
          return <span className="text-muted-foreground">-</span>;
        return <span className="tabular-nums">{value.toFixed(1)}%</span>;
      },
      filterFn: rangeFilterFn,
      meta: {
        className: 'text-right',
      },
    },
    {
      accessorKey: 'fund',
      header: ({ column, table }) => (
        <FilterableColumnHeader column={column} table={table} title="Fund" />
      ),
      cell: ({ row }) => {
        const fund = row.original.fund;
        const shortName = fund
          .replace('Differential Ventures ', '')
          .replace(', L.P.', '');
        return <span className="whitespace-nowrap">{shortName}</span>;
      },
      filterFn: selectFilterFn,
    },
    {
      accessorKey: 'industry',
      header: ({ column, table }) => (
        <FilterableColumnHeader
          column={column}
          table={table}
          title="Industry"
        />
      ),
      cell: ({ row }) => {
        return (
          <span className="whitespace-nowrap">{row.original.industry}</span>
        );
      },
      filterFn: selectFilterFn,
    },
    {
      accessorKey: 'myAggregateCost',
      header: ({ column, table }) => (
        <FilterableColumnHeader
          column={column}
          table={table}
          title="Aggregate Cost"
          align="right"
          filterType="range"
        />
      ),
      cell: ({ row }) => {
        const value = row.original.myAggregateCost;
        if (value === 0)
          return <span className="text-muted-foreground">-</span>;
        return (
          <span className="tabular-nums">{formatCurrency(value, 'USD')}</span>
        );
      },
      filterFn: rangeFilterFn,
      meta: {
        className: 'text-right',
      },
    },
    {
      accessorKey: 'multiple',
      header: ({ column, table }) => (
        <FilterableColumnHeader
          column={column}
          table={table}
          title="MOIC"
          align="right"
          filterType="range"
        />
      ),
      cell: ({ row }) => {
        const value = row.original.multiple;
        if (value === 0)
          return <span className="text-muted-foreground">-</span>;
        return <span className="tabular-nums">{value.toFixed(1)}x</span>;
      },
      filterFn: rangeFilterFn,
      meta: {
        className: 'text-right',
      },
    },
    {
      accessorKey: 'totalEquityFinancing',
      header: ({ column, table }) => (
        <FilterableColumnHeader
          column={column}
          table={table}
          title="Total Financing"
          align="right"
          filterType="range"
        />
      ),
      cell: ({ row }) => {
        const value = row.original.totalEquityFinancing;
        if (value === 0)
          return <span className="text-muted-foreground">-</span>;
        return (
          <span className="tabular-nums">{formatCurrency(value, 'USD')}</span>
        );
      },
      filterFn: rangeFilterFn,
      meta: {
        className: 'text-right',
      },
    },
    {
      accessorKey: 'lastTransactionDate',
      header: ({ column, table }) => (
        <FilterableColumnHeader
          column={column}
          table={table}
          title="Last Transaction"
        />
      ),
      cell: ({ row }) => {
        const date = row.original.lastTransactionDate;
        if (!date) return <span className="text-muted-foreground">-</span>;
        return (
          <FormattedDate
            value={date}
            className="whitespace-nowrap tabular-nums"
          />
        );
      },
      filterFn: selectFilterFn,
    },
    {
      accessorKey: 'foundedYear',
      header: ({ column, table }) => (
        <FilterableColumnHeader
          column={column}
          table={table}
          title="Founded"
          align="right"
        />
      ),
      cell: ({ row }) => {
        return <span className="tabular-nums">{row.original.foundedYear}</span>;
      },
      filterFn: selectFilterFn,
      meta: {
        className: 'text-right',
      },
    },
    {
      accessorKey: 'headquarters',
      header: ({ column, table }) => (
        <FilterableColumnHeader column={column} table={table} title="HQ" />
      ),
      cell: ({ row }) => {
        const hq = row.original.headquarters;
        const parts = hq.split(', ');
        const shortHq = parts.length > 1 ? parts[0] : hq;
        return <span className="whitespace-nowrap">{shortHq}</span>;
      },
      filterFn: selectFilterFn,
    },
    {
      id: 'tags',
      accessorFn: (row) => {
        const tags = row.tags || [];
        return tags.length > 0 ? tags[0]?.name?.toLowerCase() : '';
      },
      header: ({ column, table }) => (
        <FilterableColumnHeader column={column} table={table} title="Tags" />
      ),
      cell: ({ row }) => {
        const tags = row.original.tags || [];
        if (tags.length === 0) return null;
        return (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Badge
                key={tag.id}
                variant="user"
                className="max-w-32 truncate text-xs"
              >
                {tag.name}
              </Badge>
            ))}
          </div>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        if (!value || value.length === 0) return true;
        const tags = row.original.tags || [];

        if (value.includes('__empty__')) {
          if (tags.length === 0) return true;
        }

        const regularValues = value.filter((v) => v !== '__empty__');
        if (regularValues.length === 0) {
          return tags.length === 0;
        }

        return tags.some((tag) =>
          regularValues.includes(tag.name.toLowerCase()),
        );
      },
      meta: {
        className: 'min-w-[150px]',
      },
    },
  ];
}
