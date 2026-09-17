'use client';

import { useMemo, useState } from 'react';
import { TABLE_HEADER_CLASS, usd } from '@/components/bloomberg-sid/bits';
import { Card } from '@/components/ui/card';
import {
  SortableHeader,
  type SortDirection,
} from '@/components/ui/sortable-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { sortBy } from '@/lib/v2/bloomberg-sid/sort';
import {
  currencyLabel,
  type SidEntityRollup,
} from '@/lib/v2/bloomberg-sid/transforms';

type SortKey = keyof SidEntityRollup;

const taxRateLabel = (rate: number) => `${Number(rate.toFixed(3))}%`;

export function AccountsTab({ rows }: { rows: SidEntityRollup[] }) {
  const [sort, setSort] = useState<{
    key: SortKey | null;
    dir: SortDirection;
  }>({ key: null, dir: 'desc' });

  const sortedRows = useMemo(() => {
    const key = sort.key;
    if (!key) return rows;
    return sortBy(
      rows,
      key === 'currencyCode'
        ? (row) => currencyLabel(row.currencyCode)
        : (row) => row[key],
      sort.dir,
    );
  }, [rows, sort]);

  const totals = rows.reduce(
    (acc, row) => ({
      baseSubs: acc.baseSubs + row.baseSubs,
      baseCost: acc.baseCost + row.baseCost,
      allocationKnownCost: acc.allocationKnownCost + row.allocationKnownCost,
      allocationMaskedRows: acc.allocationMaskedRows + row.allocationMaskedRows,
      totalKnownCost: acc.totalKnownCost + row.totalKnownCost,
    }),
    {
      baseSubs: 0,
      baseCost: 0,
      allocationKnownCost: 0,
      allocationMaskedRows: 0,
      totalKnownCost: 0,
    },
  );

  const toggleSort = (key: SortKey) => {
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === 'desc' ? 'asc' : 'desc',
    }));
  };

  const sortHeader = (
    key: SortKey,
    label: string,
    align: 'left' | 'right' = 'left',
  ) => (
    <SortableHeader
      label={label}
      align={align}
      direction={sort.key === key ? sort.dir : null}
      onSort={() => {
        toggleSort(key);
      }}
    />
  );

  return (
    <div>
      <h3 className="mb-6">Accounts</h3>
      <Card>
        <Table stickyHeader className="[&>thead]:bg-card">
          <TableHeader className={TABLE_HEADER_CLASS}>
            <TableRow className="bg-muted/40">
              {sortHeader('custNum', 'Cust Num')}
              {sortHeader('name', 'Entity')}
              {sortHeader('city', 'City')}
              {sortHeader('country', 'Country')}
              {sortHeader('auto', 'Auto')}
              {sortHeader('term', 'Term')}
              {sortHeader('taxRate', 'Tax Rate', 'right')}
              {sortHeader('currencyCode', 'Currency', 'right')}
              {sortHeader('baseSubs', 'Terminal Subs', 'right')}
              {sortHeader('baseCost', 'Terminal Cost', 'right')}
              {sortHeader(
                'uniqueExchangeProducts',
                'Exchange Products',
                'right',
              )}
              {sortHeader('allocationKnownCost', 'Known Exch Cost', 'right')}
              {sortHeader('allocationMaskedRows', 'Masked Rows', 'right')}
              {sortHeader('totalKnownCost', 'Total Direct Cost', 'right')}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => (
              <TableRow key={row.custNum}>
                <TableCell className="font-mono text-xs">
                  {row.custNum}
                </TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {row.city || '—'}
                </TableCell>
                <TableCell>{row.country}</TableCell>
                <TableCell>{row.auto}</TableCell>
                <TableCell>{row.term}</TableCell>
                <TableCell className="text-right font-mono">
                  {taxRateLabel(row.taxRate)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {currencyLabel(row.currencyCode)}
                </TableCell>
                <TableCell className="text-right">{row.baseSubs}</TableCell>
                <TableCell className="text-right font-mono">
                  {usd(row.baseCost)}
                </TableCell>
                <TableCell className="text-right">
                  {row.uniqueExchangeProducts}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {row.allocationKnownCost > 0
                    ? usd(row.allocationKnownCost)
                    : '—'}
                </TableCell>
                <TableCell className="text-right">
                  {row.allocationMaskedRows ? (
                    <span className="text-amber-700">
                      {row.allocationMaskedRows}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="font-medium text-right font-mono">
                  {usd(row.totalKnownCost)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="font-medium border-t-2 bg-muted/30">
              <TableCell className="font-mono text-xs">TOTAL</TableCell>
              <TableCell>{rows.length} entities</TableCell>
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell className="text-right">{totals.baseSubs}</TableCell>
              <TableCell className="text-right font-mono">
                {usd(totals.baseCost)}
              </TableCell>
              <TableCell />
              <TableCell className="text-right font-mono">
                {usd(totals.allocationKnownCost)}
              </TableCell>
              <TableCell className="text-right text-amber-700">
                {totals.allocationMaskedRows}
              </TableCell>
              <TableCell className="text-right font-mono">
                {usd(totals.totalKnownCost)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
