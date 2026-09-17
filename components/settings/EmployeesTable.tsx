'use client';

import { useMemo, useState } from 'react';
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TablePagination } from '@/components/ui/data-table/components/TablePagination';
import { MoreHorizontal } from 'lucide-react';
import type { OrgEmployee } from '@/constants/types';
import { getCountryName } from '@/constants/countries';

const statusVariant = (status: string) => {
  switch (status) {
    case 'active':
      return 'secondary' as const;
    case 'inactive':
    case 'on_leave':
      return 'outline' as const;
    default:
      return 'outline' as const;
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'on_leave':
      return 'On Leave';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
};

function buildColumns(
  onView?: (employee: OrgEmployee) => void,
  onEdit?: (employee: OrgEmployee) => void,
  onDelete?: (employee: OrgEmployee) => void,
): ColumnDef<OrgEmployee>[] {
  const baseColumns: ColumnDef<OrgEmployee>[] = baseColumnDefs;
  if (!onView && !onEdit && !onDelete) return baseColumns;
  return [
    ...baseColumns,
    {
      id: 'actions',
      cell: ({ row }) => (
        <div
          className="text-right"
          onClick={(e) => e.stopPropagation()}
          role="presentation"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onView && (
                <DropdownMenuItem onClick={() => onView(row.original)}>
                  View
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(row.original)}>
                  Edit
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onDelete(row.original)}
                >
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      meta: { className: 'w-12' },
    },
  ];
}

const compactCell = 'line-clamp-2 text-sm leading-tight';

const baseColumnDefs: ColumnDef<OrgEmployee>[] = [
  {
    id: 'employee',
    header: 'Employee',
    cell: ({ row }) => {
      const emp = row.original;
      return (
        <div className="leading-tight [overflow-wrap:anywhere]">
          <div className="font-medium line-clamp-2 text-sm underline-offset-2 group-hover:underline">
            {emp.first_name} {emp.last_name}
          </div>
          {emp.email && (
            <div className="line-clamp-2 text-xs text-muted-foreground">
              {emp.email}
            </div>
          )}
        </div>
      );
    },
    meta: { className: 'w-1/4' },
    filterFn: (row, _id, value) => {
      const emp = row.original;
      const q = value.toLowerCase();
      const first = emp.first_name.toLowerCase();
      const last = emp.last_name.toLowerCase();
      return (
        first.includes(q) ||
        last.includes(q) ||
        `${first} ${last}`.includes(q) ||
        (emp.email?.toLowerCase().includes(q) ?? false)
      );
    },
  },
  {
    accessorKey: 'employee_id',
    header: 'Employee ID',
    cell: ({ row }) => (
      <span className={`${compactCell} text-muted-foreground`}>
        {row.original.employee_id || '—'}
      </span>
    ),
    meta: { className: 'hidden lg:table-cell' },
  },
  {
    accessorKey: 'country',
    header: 'Country',
    cell: ({ row }) => {
      const code = row.original.country;
      return (
        <span className={compactCell}>
          {code ? (getCountryName(code) ?? code) : '—'}
        </span>
      );
    },
    meta: { className: 'hidden xl:table-cell' },
  },
  {
    accessorKey: 'region',
    header: 'Region',
    cell: ({ row }) => (
      <span className={compactCell}>{row.original.region || '—'}</span>
    ),
    meta: { className: 'hidden 2xl:table-cell' },
  },
  {
    accessorKey: 'entity',
    header: 'Entity',
    cell: ({ row }) => (
      <span className={compactCell}>{row.original.entity || '—'}</span>
    ),
    meta: { className: 'hidden xl:table-cell' },
  },
  {
    accessorKey: 'business_group',
    header: 'Business Group',
    cell: ({ row }) => (
      <span className={compactCell}>
        {row.original.businessGroup?.name || '—'}
      </span>
    ),
    meta: { className: 'hidden xl:table-cell' },
  },
  {
    accessorKey: 'division',
    header: 'Division',
    cell: ({ row }) => (
      <span className={compactCell}>{row.original.division || '—'}</span>
    ),
    meta: { className: 'hidden xl:table-cell' },
  },
  {
    accessorKey: 'business_unit',
    header: 'Business Unit',
    cell: ({ row }) => (
      <span className={compactCell}>{row.original.business_unit || '—'}</span>
    ),
    meta: { className: 'hidden xl:table-cell' },
  },
  {
    accessorKey: 'department',
    header: 'Department',
    cell: ({ row }) => (
      <span className={compactCell}>{row.original.department || '—'}</span>
    ),
    filterFn: (row, _id, value) => {
      if (value === 'all') return true;
      return row.original.department === value;
    },
    meta: { className: 'hidden md:table-cell' },
  },
  {
    accessorKey: 'team',
    header: 'Team',
    cell: ({ row }) => (
      <span className={compactCell}>{row.original.team || '—'}</span>
    ),
    meta: { className: 'hidden xl:table-cell' },
  },
  {
    accessorKey: 'cost_center',
    header: 'Cost Center',
    cell: ({ row }) => (
      <span className={compactCell}>{row.original.cost_center || '—'}</span>
    ),
    meta: { className: 'hidden 2xl:table-cell' },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge
        variant={statusVariant(row.original.status)}
        className="whitespace-nowrap px-2 py-0 text-xs"
      >
        {statusLabel(row.original.status)}
      </Badge>
    ),
    filterFn: (row, _id, value) => {
      if (value === 'all') return true;
      return row.original.status === value;
    },
  },
];

interface EmployeesTableProps {
  employees: OrgEmployee[];
  totalCount: number;
  onView?: (employee: OrgEmployee) => void;
  onEdit?: (employee: OrgEmployee) => void;
  onDelete?: (employee: OrgEmployee) => void;
}

export function EmployeesTable({
  employees,
  totalCount,
  onView,
  onEdit,
  onDelete,
}: EmployeesTableProps) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const columns = useMemo(
    () => buildColumns(onView, onEdit, onDelete),
    [onView, onEdit, onDelete],
  );

  const sorted = useMemo(
    () =>
      [...employees].sort((a, b) => a.first_name.localeCompare(b.first_name)),
    [employees],
  );

  const table = useReactTable({
    data: sorted,
    columns,
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 25 },
    },
  });

  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-12 text-sm text-muted-foreground">
        No employees in the directory yet. Import a CSV to get started.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Table stickyHeader scrollClassName="rounded border">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={`py-2 text-xs ${(header.column.columnDef.meta as Record<string, string>)?.className ?? ''}`}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className={onView ? 'group cursor-pointer' : undefined}
                onClick={onView ? () => onView(row.original) : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={`bg-card py-2 align-middle ${(cell.column.columnDef.meta as Record<string, string>)?.className ?? ''}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                No employees match your search.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <TablePagination table={table} showSizeSelector />
    </div>
  );
}
