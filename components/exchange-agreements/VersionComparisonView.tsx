'use client';

import { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SortableHeaderRow, type SortableColumn } from './SortableTableHead';
import { StatCard } from './StatCard';
import {
  matchesProductFilters,
  useProductFilterParams,
} from './ProductFilterBar';
import {
  changeColorClass,
  colorIfNonZero,
  formatFeeAmount,
  formatFeeChange,
} from '@/lib/exchange-agreement/format';
import {
  ALL_PRODUCT_LINES,
  getVersionComparisonFromDataset,
  type FeeScheduleDataset,
} from '@/lib/exchange-agreement/feeScheduleQueries';
import { useSortableRows } from '@/hooks/useSortableRows';
import { summarizeDiffRows, type DiffRow } from '@/lib/exchange-agreement/diff';
import type { FeeScheduleVersion } from '@/lib/exchange-agreement/types';

interface Props {
  productLine: string;
  versions: FeeScheduleVersion[];
  currency: string;
  dataset: FeeScheduleDataset | null;
}

type SortKey =
  | 'title'
  | 'assetClass'
  | 'useType'
  | 'level'
  | 'latestFee'
  | 'previousFee'
  | 'change'
  | 'changePercent'
  | 'annualImpact';

type StatFilter = 'changed' | 'increases' | 'decreases' | 'added' | 'removed';

function matchesStatFilter(row: DiffRow, filter: StatFilter): boolean {
  switch (filter) {
    case 'changed':
      return row.status === 'changed';
    case 'increases':
      return row.status === 'changed' && (row.change ?? 0) > 0;
    case 'decreases':
      return row.status === 'changed' && (row.change ?? 0) < 0;
    case 'added':
      return row.status === 'added';
    case 'removed':
      return row.status === 'removed';
  }
}

export default function VersionComparisonView({
  productLine,
  versions,
  currency,
  dataset,
}: Props) {
  const [latestId, setLatestId] = useState(versions[0]?.id ?? '');
  const [previousId, setPreviousId] = useState(versions[1]?.id ?? '');
  const [filters] = useProductFilterParams();
  const [statFilter, setStatFilter] = useState<StatFilter>('changed');

  const comparison = useMemo(() => {
    if (!latestId || !previousId || !dataset) return null;
    return getVersionComparisonFromDataset(
      dataset,
      productLine,
      previousId,
      latestId,
    );
  }, [dataset, productLine, previousId, latestId]);

  // Scoped by the sidebar's Asset Class/Use Type/Level filters only (not the
  // stat-card tab) -- this is what the stat cards summarize, so all of them
  // reflect the sidebar filters regardless of which tab is active.
  const productFilteredRows = useMemo(
    () =>
      (comparison?.rows ?? []).filter((row) =>
        matchesProductFilters(row, filters),
      ),
    [comparison, filters],
  );

  const filteredSummary = useMemo(
    () => summarizeDiffRows(productFilteredRows),
    [productFilteredRows],
  );

  const filteredRows = useMemo(
    () =>
      productFilteredRows.filter((row) => matchesStatFilter(row, statFilter)),
    [productFilteredRows, statFilter],
  );

  const columns = useMemo<SortableColumn<SortKey>[]>(
    () => [
      { key: 'title', label: 'Product' },
      { key: 'assetClass', label: 'Asset Class' },
      { key: 'useType', label: 'Use Type' },
      { key: 'level', label: 'Level' },
      {
        key: 'latestFee',
        label: comparison ? `Latest (${comparison.latest.label})` : 'Latest',
        align: 'right',
      },
      {
        key: 'previousFee',
        label: comparison
          ? `Previous (${comparison.previous.label})`
          : 'Previous',
        align: 'right',
      },
      { key: 'change', label: 'Change', align: 'right' },
      { key: 'changePercent', label: 'Change %', align: 'right' },
      { key: 'annualImpact', label: 'Annual Impact', align: 'right' },
    ],
    [comparison],
  );

  const { sorted, sort, toggleSort } = useSortableRows<DiffRow, SortKey>(
    filteredRows,
    {
      title: (row) => row.title,
      assetClass: (row) => row.assetClass,
      useType: (row) => row.useType,
      level: (row) => row.level,
      latestFee: (row) => row.latestFee,
      previousFee: (row) => row.previousFee,
      change: (row) => row.change,
      changePercent: (row) => row.changePercent,
      annualImpact: (row) => row.annualImpact,
    },
    { key: 'annualImpact', direction: 'desc' },
  );

  const isAllProductLines = productLine === ALL_PRODUCT_LINES;

  if (versions.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        {isAllProductLines
          ? 'Need at least two versions to compare.'
          : `Need at least two versions of ${productLine} to compare.`}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-medium mb-1 font-serif text-3xl">
          {isAllProductLines
            ? 'Changes across all product lines'
            : `Changes within ${productLine}`}
        </h2>
        <p className="text-sm text-muted-foreground">Fee Schedule Comparison</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={latestId} onValueChange={setLatestId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Latest version" />
          </SelectTrigger>
          <SelectContent>
            {versions.map((version) => (
              <SelectItem key={version.id} value={version.id}>
                {version.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">vs</span>
        <Select value={previousId} onValueChange={setPreviousId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Previous version" />
          </SelectTrigger>
          <SelectContent>
            {versions.map((version) => (
              <SelectItem key={version.id} value={version.id}>
                {version.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {comparison && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <StatCard
              label="Products w/ Price Change"
              value={filteredSummary.productsWithPriceChange}
              active={statFilter === 'changed'}
              onClick={() => setStatFilter('changed')}
            />
            <StatCard
              label="Price Increases"
              value={
                <>
                  <span
                    className={colorIfNonZero(
                      filteredSummary.priceIncreases,
                      'text-red-500',
                    )}
                  >
                    {filteredSummary.priceIncreases}
                  </span>{' '}
                  <span className="text-muted-foreground">
                    / {filteredSummary.productsWithPriceChange}
                  </span>
                </>
              }
              active={statFilter === 'increases'}
              onClick={() => setStatFilter('increases')}
            />
            <StatCard
              label="Price Decreases"
              value={
                <>
                  <span
                    className={colorIfNonZero(
                      filteredSummary.priceDecreases,
                      'text-green',
                    )}
                  >
                    {filteredSummary.priceDecreases}
                  </span>{' '}
                  <span className="text-muted-foreground">
                    / {filteredSummary.productsWithPriceChange}
                  </span>
                </>
              }
              active={statFilter === 'decreases'}
              onClick={() => setStatFilter('decreases')}
            />
            <div className="space-y-4">
              <StatCard
                size="sm"
                label="Products Added"
                value={`+${filteredSummary.productsAdded}`}
                valueClassName={colorIfNonZero(
                  filteredSummary.productsAdded,
                  'text-green',
                )}
                active={statFilter === 'added'}
                onClick={() => setStatFilter('added')}
              />
              <StatCard
                size="sm"
                label="Products Removed"
                value={`−${filteredSummary.productsRemoved}`}
                valueClassName={colorIfNonZero(
                  filteredSummary.productsRemoved,
                  'text-red-500',
                )}
                active={statFilter === 'removed'}
                onClick={() => setStatFilter('removed')}
              />
            </div>
            <StatCard
              label="Annual Impact"
              value={formatFeeChange(filteredSummary.annualImpact, currency)}
              valueClassName={changeColorClass(filteredSummary.annualImpact)}
            />
          </div>

          <Table stickyHeader scrollClassName="rounded-md border">
            <TableHeader>
              <SortableHeaderRow
                columns={columns}
                sort={sort}
                onSort={toggleSort}
              />
            </TableHeader>
            <TableBody>
              {sorted.map((row) => (
                <TableRow key={row.productId}>
                  <TableCell className="max-w-[320px]">
                    {row.title}
                    {row.status !== 'changed' && (
                      <span className="ml-2 text-xs uppercase text-muted-foreground">
                        {row.status}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.assetClass ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.useType}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.level ?? '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {formatFeeAmount(row.latestFee, currency)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {formatFeeAmount(row.previousFee, currency)}
                  </TableCell>
                  <TableCell
                    className={`whitespace-nowrap text-right ${changeColorClass(row.change)}`}
                  >
                    {formatFeeChange(row.change, currency)}
                  </TableCell>
                  <TableCell
                    className={`whitespace-nowrap text-right ${changeColorClass(row.changePercent)}`}
                  >
                    {row.changePercent != null
                      ? `${row.changePercent > 0 ? '+' : ''}${row.changePercent.toFixed(1)}%`
                      : '—'}
                  </TableCell>
                  <TableCell
                    className={`whitespace-nowrap text-right ${changeColorClass(row.annualImpact)}`}
                  >
                    {formatFeeChange(row.annualImpact, currency)}
                  </TableCell>
                </TableRow>
              ))}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No changes found for the selected filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
