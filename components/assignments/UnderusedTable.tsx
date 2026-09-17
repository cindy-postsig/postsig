'use client';

import { useMemo, useState } from 'react';
import { MagnifyingGlassIcon } from '@radix-ui/react-icons';
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from '@tanstack/react-table';
import { ColumnHeader } from '@/components/contracts/ColumnHeader';
import { Button } from '@/components/ui/button';
import {
  FilterableColumnHeader,
  type FilterValue,
} from '@/components/ui/data-table/components/FilterableColumnHeader';
import { TablePagination } from '@/components/ui/data-table/components/TablePagination';
import { BaseCurrencyCell } from '@/components/ui/data-table/money';
import { selectFilterFn } from '@/components/ui/data-table/utils/filterUtils';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { cn } from '@/lib/utils';
import {
  underusedMonthlyAtRisk,
  type UnderusedRow,
} from '@/lib/v2/assignments/rows';
import { seatInactiveReasonLabels } from '@/lib/v2/seats/status';
import { ariaSort } from './ariaSort';
import { PLACEHOLDER } from './placeholders';

const PAGE_SIZE = 50;

function buildColumns(
  onSelectUser: (employeeId: number) => void,
): ColumnDef<UnderusedRow>[] {
  return [
    {
      id: 'userName',
      accessorKey: 'userName',
      header: ({ column }) => <ColumnHeader column={column} title="User" />,
      cell: ({ row }) => {
        const seat = row.original;
        const employeeId = seat.employeeId;
        if (employeeId === null) {
          return <span className="font-medium">{seat.userName}</span>;
        }
        return (
          <button
            type="button"
            className="text-left hover:underline"
            onClick={() => onSelectUser(employeeId)}
          >
            <span className="font-medium block">{seat.userName}</span>
            {seat.email && (
              <span className="block text-xs text-muted-foreground">
                {seat.email}
              </span>
            )}
          </button>
        );
      },
    },
    {
      id: 'department',
      accessorFn: (row) => row.department ?? '',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Department" />
      ),
      enableGlobalFilter: false,
      cell: ({ getValue }) => getValue<string>() || PLACEHOLDER,
    },
    {
      id: 'vendorName',
      accessorKey: 'vendorName',
      header: ({ column, table }) => (
        <FilterableColumnHeader column={column} table={table} title="Vendor" />
      ),
      filterFn: selectFilterFn,
      enableGlobalFilter: false,
    },
    {
      id: 'productName',
      accessorKey: 'productName',
      header: ({ column }) => <ColumnHeader column={column} title="Product" />,
      enableGlobalFilter: false,
    },
    {
      id: 'reason',
      accessorFn: (row) =>
        seatInactiveReasonLabels(row.inactiveReasons).join(', '),
      header: ({ column, table }) => (
        <FilterableColumnHeader column={column} table={table} title="Reason" />
      ),
      filterFn: selectFilterFn,
      enableGlobalFilter: false,
      cell: ({ getValue }) => getValue<string>(),
    },
    {
      id: 'identifier',
      header: 'Identifier',
      enableSorting: false,
      meta: { className: 'font-mono text-xs text-muted-foreground' },
      cell: () => PLACEHOLDER,
    },
    {
      id: 'lastUsed',
      header: 'Last used',
      enableSorting: false,
      meta: { className: 'text-muted-foreground' },
      cell: () => PLACEHOLDER,
    },
    {
      id: 'monthlyCost',
      accessorKey: 'monthlyCost',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Monthly" align="right" />
      ),
      enableGlobalFilter: false,
      meta: { className: 'text-right text-destructive' },
      cell: ({ row }) => (
        <BaseCurrencyCell amount={row.original.monthlyCost} showCents />
      ),
    },
    {
      id: 'search',
      // Everything free text should reach, in one hidden cell, so the built-in
      // `includesString` runs once per row instead of once per column.
      accessorFn: (row) =>
        [
          row.userName,
          row.email ?? '',
          row.department ?? '',
          row.vendorName,
          row.productName,
          ...seatInactiveReasonLabels(row.inactiveReasons),
        ].join(' '),
      header: 'Search',
      enableSorting: false,
    },
  ];
}

export function UnderusedTable({
  rows,
  onSelectUser,
}: {
  rows: UnderusedRow[];
  onSelectUser: (employeeId: number) => void;
}) {
  const { formatBaseCurrency } = useBaseCurrency();
  const [filters, setFilters] = useState<Record<string, FilterValue>>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(() => buildColumns(onSelectUser), [onSelectUser]);

  const columnFilters = useMemo<ColumnFiltersState>(
    () => Object.entries(filters).map(([id, value]) => ({ id, value })),
    [filters],
  );

  const setColumnFilter = (columnId: string, value: FilterValue) =>
    setFilters((current) => {
      const next = { ...current };
      if (Array.isArray(value) && value.length > 0) next[columnId] = value;
      else delete next[columnId];
      return next;
    });

  const table = useReactTable({
    data: rows,
    columns,
    state: { columnFilters, globalFilter, sorting },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'includesString',
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: {
      pagination: { pageSize: PAGE_SIZE },
      columnVisibility: { search: false },
    },
    meta: { filters, onFilterChange: setColumnFilter },
  });

  const narrowed = columnFilters.length > 0 || globalFilter !== '';
  const matched = table.getFilteredRowModel().rows;
  const atRisk = underusedMonthlyAtRisk(matched.map((row) => row.original));

  return (
    <section className="rounded-lg border border-border">
      <header className="border-b border-border px-4 py-3">
        <h2 className="font-medium font-sans text-base leading-none">
          Underutilized licences
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Assignments flagged inactive in scope — candidates for reclaim or
          cancellation.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="relative min-w-56 flex-1">
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder="Search users or products"
            aria-label="Search underutilized licences"
            className="h-9 pl-8"
          />
        </div>
        {narrowed && (
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => {
              setFilters({});
              setGlobalFilter('');
            }}
          >
            Reset
          </Button>
        )}
        <p className="font-sans-neue text-xs text-muted-foreground">
          {matched.length} licence{matched.length === 1 ? '' : 's'} ·{' '}
          {formatBaseCurrency(atRisk, true)} / month at risk
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 pb-8 text-sm text-muted-foreground">
          Nothing flagged in this scope.
        </p>
      ) : (
        <>
          <Table stickyHeader>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      aria-sort={ariaSort(header.column.getIsSorted())}
                      className={cn(
                        'whitespace-nowrap',
                        header.column.columnDef.meta?.className,
                      )}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cell.column.columnDef.meta?.className}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {matched.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={table.getVisibleLeafColumns().length}
                    className="py-8 text-muted-foreground"
                  >
                    Nothing in this scope matches those filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="px-4 pb-3">
            <TablePagination
              table={table}
              showSizeSelector
              hideWhenSinglePage
            />
          </div>
        </>
      )}
    </section>
  );
}
