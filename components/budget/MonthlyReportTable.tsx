'use client';

import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PlusIcon, MinusIcon } from '@heroicons/react/24/outline';
import { Button } from '../ui/button';
import type { UserMetadata } from '@/constants/types';

interface MonthlyReportTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  className?: string;
  enableExpansion?: boolean;
  defaultSortColumn?: string;
  defaultSortDirection?: 'asc' | 'desc';
  onRowClick?: (rowData: TData) => void;
  enablePagination?: boolean;
  initialPageSize?: number;
  userMetadata?: UserMetadata;
}

export default function MonthlyReportTable<
  TData extends { subRows?: TData[] },
>({
  data,
  columns,
  className = '',
  enableExpansion = false,
  defaultSortColumn,
  defaultSortDirection = 'desc',
  onRowClick,
  enablePagination = false,
  initialPageSize = 10,
  userMetadata,
}: MonthlyReportTableProps<TData>) {
  // Add expander column if expansion is enabled
  const tableColumns: ColumnDef<TData, any>[] = [
    ...(enableExpansion
      ? [
          {
            id: 'expander',
            header: () => null,
            cell: ({ row }) => {
              return (
                <div className="flex items-center justify-center">
                  {row.getCanExpand() ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        row.toggleExpanded();
                      }}
                      className="bg-transparent p-0 hover:bg-transparent"
                    >
                      {row.getIsExpanded() ? (
                        <MinusIcon
                          className="min-w-6 cursor-pointer rounded-full bg-primary p-1 text-background"
                          width={24}
                          height={24}
                        />
                      ) : (
                        <PlusIcon
                          className="min-w-6 cursor-pointer rounded-full bg-primary/15 p-1 text-primary"
                          width={24}
                          height={24}
                        />
                      )}
                    </button>
                  ) : null}
                </div>
              );
            },
            enableSorting: false,
            enableHiding: false,
            size: 50,
            meta: {
              className: 'w-12',
            },
          } as ColumnDef<TData, any>,
        ]
      : []),
    ...columns,
  ];

  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: enablePagination
      ? getPaginationRowModel()
      : undefined,
    getSubRows: (row) => row.subRows,
    meta: userMetadata ? { userMetadata } : undefined,
    initialState: {
      sorting: defaultSortColumn
        ? [{ id: defaultSortColumn, desc: defaultSortDirection === 'desc' }]
        : [{ id: 'change', desc: true }],
      pagination: {
        pageSize: initialPageSize,
        pageIndex: 0,
      },
    },
  });

  return (
    <div className={`rounded border ${className}`}>
      <Table stickyHeader>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const meta = header.column.columnDef.meta as any;
                return (
                  <TableHead key={header.id} className={meta?.className || ''}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {(() => {
            let topLevelCount = -1;
            let subRowCount = 0;
            return table.getRowModel().rows.map((row) => {
              if (row.depth === 0) {
                topLevelCount++;
                subRowCount = 0;
              } else {
                subRowCount++;
              }
              const isBanded =
                row.depth === 0
                  ? topLevelCount % 2 === 1
                  : subRowCount % 2 === 1;
              return (
                <TableRow
                  key={row.id}
                  className={`leading-[1.15] ${
                    row.depth === 0 && isBanded ? 'bg-muted/40' : ''
                  } ${
                    row.depth > 0
                      ? isBanded
                        ? 'bg-muted/80 dark:bg-muted/70'
                        : 'bg-muted/50 dark:bg-muted/40'
                      : ''
                  } ${
                    row.getCanExpand() || onRowClick ? 'cursor-pointer' : ''
                  }`}
                  onClick={() => {
                    if (row.getCanExpand()) {
                      row.toggleExpanded();
                    } else if (onRowClick) {
                      onRowClick(row.original);
                    }
                  }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as any;
                    return (
                      <TableCell
                        key={cell.id}
                        className={`${meta?.className || ''} ${row.depth > 0 ? 'pl-3' : ''}`}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            });
          })()}
        </TableBody>
      </Table>
      {enablePagination && table.getPageCount() > 1 && (
        <div className="flex items-center justify-center gap-2 border-t bg-background">
          <Button
            variant={'ghost'}
            onClick={() =>
              table.setPageSize(
                table.getState().pagination.pageSize >= data.length
                  ? initialPageSize
                  : data.length,
              )
            }
            className="font-light w-full py-6 text-muted-foreground"
          >
            {table.getState().pagination.pageSize >= data.length
              ? 'Show less'
              : `Show all ${data.length} contracts`}
          </Button>
        </div>
      )}
    </div>
  );
}
