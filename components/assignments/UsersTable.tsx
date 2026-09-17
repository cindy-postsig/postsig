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
  type SortingFn,
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
import { cn } from '@/lib/utils';
import { LEVEL_LABEL } from '@/lib/v2/assignments/levels';
import type { UserRow } from '@/lib/v2/assignments/rows';
import type { OrgUnitTreeLevel } from '@/lib/v2/org-units/levels';
import { ariaSort } from './ariaSort';
import { HrStatusBadge } from './HrStatusBadge';
import { PLACEHOLDER } from './placeholders';

/** Chips beyond this many collapse into a "+N more", as the prototype does. */
const MAX_CHIPS = 4;

const PAGE_SIZE = 50;

const RIGHT_ALIGNED = { className: 'text-right' } as const;

// HR names run long; two lines in a bounded cell keeps the row count of
// columns readable without pushing the products column off screen.
const VERBOSE_CELL = 'line-clamp-2 min-w-36 max-w-48 break-words';

/**
 * Name breaks every tie, so a column with long runs of equal values (an HR
 * level, an assignment count) reads in a stable, alphabetical order.
 */
const byValueThenName: SortingFn<UserRow> = (a, b, columnId) => {
  const left = a.getValue(columnId);
  const right = b.getValue(columnId);
  const compared =
    typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right));
  return compared || a.original.name.localeCompare(b.original.name);
};

function buildColumns(
  pathLevels: readonly OrgUnitTreeLevel[],
  onSelect: (employeeId: number) => void,
): ColumnDef<UserRow>[] {
  return [
    {
      id: 'name',
      accessorKey: 'name',
      header: ({ column }) => <ColumnHeader column={column} title="User" />,
      sortingFn: byValueThenName,
      cell: ({ row }) => (
        <button
          type="button"
          className="text-left hover:underline"
          onClick={() => onSelect(row.original.id)}
        >
          <span className="font-medium block">{row.original.name}</span>
          {row.original.email && (
            <span className="block text-xs text-muted-foreground">
              {row.original.email}
            </span>
          )}
        </button>
      ),
    },
    ...pathLevels.map(
      (level): ColumnDef<UserRow> => ({
        id: level,
        accessorFn: (row) => row.pathByLevel[level] ?? '',
        header: ({ column, table }) => (
          <FilterableColumnHeader
            column={column}
            table={table}
            title={LEVEL_LABEL[level]}
          />
        ),
        filterFn: selectFilterFn,
        sortingFn: byValueThenName,
        enableGlobalFilter: false,
        cell: ({ getValue }) => (
          <span className={VERBOSE_CELL}>
            {getValue<string>() || PLACEHOLDER}
          </span>
        ),
      }),
    ),
    {
      id: 'status',
      accessorKey: 'status',
      header: ({ column }) => (
        <ColumnHeader column={column} title="HR status" />
      ),
      sortingFn: byValueThenName,
      enableGlobalFilter: false,
      cell: ({ row }) => <HrStatusBadge status={row.original.status} />,
    },
    {
      id: 'vendors',
      // An array cell so the header's multi-select can use `arrIncludesSome`,
      // with the facets listing each vendor rather than every combination.
      accessorFn: (row) => row.vendorNames,
      getUniqueValues: (row) => row.vendorNames,
      header: ({ column, table }) => (
        <FilterableColumnHeader column={column} table={table} title="Vendor" />
      ),
      filterFn: 'arrIncludesSome',
      sortingFn: byValueThenName,
      enableGlobalFilter: false,
      cell: ({ row }) => (
        <span className={cn(VERBOSE_CELL, 'text-muted-foreground')}>
          {row.original.vendorNames.join(', ') || PLACEHOLDER}
        </span>
      ),
    },
    {
      id: 'products',
      // Chips are name-ordered, so this is the first one the cell shows.
      accessorFn: (row) => row.products[0]?.name ?? '',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Assigned products" />
      ),
      sortingFn: byValueThenName,
      enableGlobalFilter: false,
      meta: { className: 'min-w-64' },
      cell: ({ row }) => <ProductChips products={row.original.products} />,
    },
    {
      id: 'assignmentCount',
      accessorKey: 'assignmentCount',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Assignments" align="right" />
      ),
      sortingFn: byValueThenName,
      enableGlobalFilter: false,
      meta: RIGHT_ALIGNED,
    },
    {
      id: 'monthlyCost',
      accessorKey: 'monthlyCost',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Monthly" align="right" />
      ),
      sortingFn: byValueThenName,
      enableGlobalFilter: false,
      meta: RIGHT_ALIGNED,
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
          row.name,
          row.email ?? '',
          row.employeeId ?? '',
          ...row.vendorNames,
          ...row.productNames,
        ].join(' '),
      header: 'Search',
      enableSorting: false,
    },
  ];
}

export function UsersTable({
  rows,
  pathLevels,
  onSelect,
}: {
  rows: UserRow[];
  pathLevels: readonly OrgUnitTreeLevel[];
  onSelect: (employeeId: number) => void;
}) {
  const [filters, setFilters] = useState<Record<string, FilterValue>>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () => buildColumns(pathLevels, onSelect),
    [pathLevels, onSelect],
  );

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
  const matched = table.getFilteredRowModel().rows.length;

  return (
    <section className="rounded-lg border border-border">
      <header className="border-b border-border px-4 py-3">
        <h2 className="font-medium font-sans text-base leading-none">
          User assignments
        </h2>
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
            placeholder="Search by name, email, employee ID or product"
            aria-label="Search users"
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
          {matched} of {rows.length} people shown
        </p>
      </div>

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
            <TableRow key={row.id} className="align-top">
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cell.column.columnDef.meta?.className}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {matched === 0 && (
            <TableRow>
              <TableCell
                colSpan={table.getVisibleLeafColumns().length}
                className="py-8 text-muted-foreground"
              >
                {rows.length === 0 && !narrowed
                  ? 'No assigned users in this scope.'
                  : 'Nobody in this scope matches those filters.'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="px-4 pb-3">
        <TablePagination table={table} showSizeSelector hideWhenSinglePage />
      </div>
    </section>
  );
}

function ProductChips({ products }: { products: UserRow['products'] }) {
  if (products.length === 0) {
    return <span className="text-muted-foreground">{PLACEHOLDER}</span>;
  }
  const shown = products.slice(0, MAX_CHIPS);
  const hidden = products.length - shown.length;
  return (
    <div className="flex max-w-56 flex-col items-start gap-1">
      {shown.map((product) => (
        <span
          key={product.name}
          className={cn(
            'rounded border px-1.5 py-0.5 text-xs leading-tight',
            product.underused
              ? 'border-destructive/40 text-destructive'
              : 'border-border',
          )}
        >
          {product.name}
          {product.count > 1 && (
            <span className="text-muted-foreground"> ×{product.count}</span>
          )}
        </span>
      ))}
      {hidden > 0 && (
        <span className="text-xs text-muted-foreground">+{hidden} more</span>
      )}
    </div>
  );
}
