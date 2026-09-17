'use client';

import { useMemo, useState } from 'react';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TablePagination } from '@/components/ui/data-table/components/TablePagination';
import { ColumnHeader } from '@/components/contracts/ColumnHeader';
import FeeScheduleVersionSwitcher from './FeeScheduleVersionSwitcher';
import ProductDetailSheet from './ProductDetailSheet';
import { Sparkline } from '@/components/Sparkline';
import {
  matchesProductFilters,
  useProductFilterParams,
} from './ProductFilterBar';
import {
  changeColorClass,
  formatFeeAmount,
  formatFeeChange,
} from '@/lib/exchange-agreement/format';
import {
  getProductHistoryFromDataset,
  type FeeScheduleDataset,
  type ProductExplorerRow,
} from '@/lib/exchange-agreement/feeScheduleQueries';
import { useFeeScheduleVersionSelector } from '@/hooks/useFeeScheduleVersionSelector';

interface Props {
  productLine: string;
  rows: ProductExplorerRow[];
  versionLabel: string | null;
  dataset: FeeScheduleDataset | null;
}

const COLUMNS: ColumnDef<ProductExplorerRow>[] = [
  {
    accessorKey: 'title',
    header: ({ column }) => <ColumnHeader column={column} title="Product" />,
    cell: ({ row }) => (
      <span className="line-clamp-2 max-w-[360px]">{row.original.title}</span>
    ),
  },
  {
    id: 'assetClass',
    // `?? undefined` + sortUndefined: 'last' pushes nulls to the bottom
    // regardless of sort direction (a custom sortingFn wouldn't -- TanStack
    // still flips those for desc).
    accessorFn: (row) => row.assetClass ?? undefined,
    sortUndefined: 'last',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Asset Class" />
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.assetClass ?? '—'}
      </span>
    ),
  },
  {
    accessorKey: 'useType',
    header: ({ column }) => <ColumnHeader column={column} title="Use Type" />,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.useType}</span>
    ),
  },
  {
    id: 'level',
    accessorFn: (row) => row.level ?? undefined,
    sortUndefined: 'last',
    header: ({ column }) => <ColumnHeader column={column} title="Level" />,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.level ?? '—'}</span>
    ),
  },
  {
    id: 'currentFee',
    accessorFn: (row) => row.currentFee ?? undefined,
    sortUndefined: 'last',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Current Price" align="right" />
    ),
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-right">
        {formatFeeAmount(row.original.currentFee, row.original.currency)}
      </span>
    ),
    meta: { className: 'text-right' },
  },
  {
    id: 'lastChange',
    accessorFn: (row) => row.lastChange ?? undefined,
    sortUndefined: 'last',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Last Change" align="right" />
    ),
    cell: ({ row }) => (
      <span
        className={`whitespace-nowrap text-right ${changeColorClass(row.original.lastChange)}`}
      >
        {formatFeeChange(row.original.lastChange, row.original.currency)}
      </span>
    ),
    meta: { className: 'text-right' },
  },
];

export default function ProductExplorerTable({
  productLine,
  rows,
  versionLabel,
  dataset,
}: Props) {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [filters] = useProductFilterParams();
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'lastChange', desc: true },
  ]);

  const history = useMemo(
    () =>
      selectedProductId && dataset
        ? getProductHistoryFromDataset(dataset, productLine, selectedProductId)
        : null,
    [dataset, productLine, selectedProductId],
  );

  const {
    versions,
    selectedVersionId,
    setSelectedVersionId,
    selectedVersion,
    rows: sourceRows,
  } = useFeeScheduleVersionSelector(dataset, productLine, rows);

  const filteredRows = useMemo(
    () => sourceRows.filter((row) => matchesProductFilters(row, filters)),
    [sourceRows, filters],
  );

  const table = useReactTable({
    data: filteredRows,
    columns: COLUMNS,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  });

  return (
    <>
      <ProductDetailSheet
        history={history}
        isOpen={selectedProductId !== null}
        onClose={() => setSelectedProductId(null)}
      />

      <h2 className="font-medium mb-2 font-serif text-3xl">
        {productLine} Market Data Products
      </h2>

      <FeeScheduleVersionSwitcher
        label={selectedVersion?.label ?? versionLabel}
        versions={versions}
        selectedVersionId={selectedVersionId}
        onSelect={setSelectedVersionId}
      />
      <p className="mb-2 text-sm text-muted-foreground">
        {filteredRows.length} of {sourceRows.length}
      </p>

      <Table stickyHeader scrollClassName="rounded-md border">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={header.column.columnDef.meta?.className}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
              <TableHead className="w-[90px] text-center">Trend</TableHead>
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className="cursor-pointer"
              onClick={() => setSelectedProductId(row.original.productId)}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cell.column.columnDef.meta?.className}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
              <TableCell>
                <Sparkline
                  data={row.original.trend}
                  onClick={() => setSelectedProductId(row.original.productId)}
                />
              </TableCell>
            </TableRow>
          ))}
          {table.getRowModel().rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={COLUMNS.length + 1}
                className="text-center text-sm text-muted-foreground"
              >
                No products match your filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <TablePagination table={table} showSizeSelector hideWhenSinglePage />
    </>
  );
}
