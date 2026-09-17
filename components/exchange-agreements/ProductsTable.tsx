'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQueryState } from 'nuqs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { SortableHeaderRow, type SortableColumn } from './SortableTableHead';
import { StatCard } from './StatCard';
import { useSortableRows } from '@/hooks/useSortableRows';
import {
  changeColorClass,
  formatFeeChange,
} from '@/lib/exchange-agreement/format';
import type {
  ExchangeSummary,
  ProductLineSummary,
} from '@/lib/exchange-agreement/types';

interface Props {
  exchangeCode: string;
  exchange: ExchangeSummary | null;
  productLines: ProductLineSummary[];
}

type SortKey = 'productLine' | 'lastPricingUpdateLabel' | 'annualImpact';

const COLUMNS: SortableColumn<SortKey>[] = [
  { key: 'productLine', label: 'Product Line' },
  { key: 'lastPricingUpdateLabel', label: 'Last Pricing Update' },
  { key: 'annualImpact', label: 'Annual Impact' },
];

export default function ProductsTable({
  exchangeCode,
  exchange,
  productLines,
}: Props) {
  const [query] = useQueryState('q', { defaultValue: '' });
  const filtered = useMemo(
    () =>
      productLines.filter((line) =>
        line.productLine.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [productLines, query],
  );

  const { sorted, sort, toggleSort } = useSortableRows<
    ProductLineSummary,
    SortKey
  >(
    filtered,
    {
      productLine: (row) => row.productLine,
      lastPricingUpdateLabel: (row) => row.lastPricingUpdateDate,
      annualImpact: (row) => row.annualImpact,
    },
    { key: 'lastPricingUpdateLabel', direction: 'desc' },
  );

  const { feesWithPriceChange, totalProducts } = useMemo(
    () =>
      productLines.reduce(
        (acc, line) => ({
          feesWithPriceChange:
            acc.feesWithPriceChange + line.productsWithPriceChange,
          totalProducts: acc.totalProducts + line.productCount,
        }),
        { feesWithPriceChange: 0, totalProducts: 0 },
      ),
    [productLines],
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Last Pricing Update"
          value={exchange?.lastPricingUpdateLabel ?? '—'}
        />
        <StatCard
          label="Annual Impact"
          value={
            exchange?.annualImpact != null
              ? formatFeeChange(exchange.annualImpact, exchange.currency)
              : '—'
          }
          valueClassName={changeColorClass(exchange?.annualImpact)}
        />
        <StatCard
          label="Fees w/ Price Change"
          value={
            <>
              {feesWithPriceChange}{' '}
              <span className="text-muted-foreground">/ {totalProducts}</span>
            </>
          }
        />
      </div>

      <Table stickyHeader scrollClassName="rounded-md border">
        <TableHeader>
          <SortableHeaderRow columns={COLUMNS} sort={sort} onSort={toggleSort}>
            <TableHead className="w-[160px]" />
          </SortableHeaderRow>
        </TableHeader>
        <TableBody>
          {sorted.map((line) => (
            <TableRow key={line.productLine}>
              <TableCell className="font-medium">
                <Link
                  href={`/exchange-agreements/product-explorer?productLine=${encodeURIComponent(
                    line.productLine,
                  )}&exchange=${encodeURIComponent(exchangeCode)}`}
                  className="hover:underline"
                >
                  {line.productLine}
                </Link>{' '}
                <span className="text-muted-foreground">
                  ({line.productCount} Products)
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {line.lastPricingUpdateLabel}
              </TableCell>
              <TableCell
                className={`whitespace-nowrap ${changeColorClass(line.annualImpact)}`}
              >
                {formatFeeChange(line.annualImpact, line.currency)}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/exchange-agreements/version-comparison?productLine=${encodeURIComponent(
                      line.productLine,
                    )}&exchange=${encodeURIComponent(exchangeCode)}`}
                  >
                    Compare Versions
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={4}
                className="text-center text-sm text-muted-foreground"
              >
                No products match &ldquo;{query}&rdquo;.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
