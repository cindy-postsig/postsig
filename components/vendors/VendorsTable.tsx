'use client';

import { useContext, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type ExpandedState,
  type SortingState,
} from '@tanstack/react-table';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { TablePagination } from '@/components/ui/data-table/components/TablePagination';
import { ColumnHeader } from '@/components/contracts/ColumnHeader';
import { ColumnLayoutMenu } from '@/components/contracts/ColumnLayoutMenu';
import { DateDisplay } from '@/components/contracts/DateDisplay';
import {
  applyColumnLayout,
  columnSpecId,
  type ColumnLayoutViewKey,
} from '@/components/contracts/columnLayout';
import { VENDORS_LIST_COLUMNS } from '@/components/contracts/listViewDefaults';
import { useColumnLayout } from '@/contexts/ColumnLayoutContext';
import VendorIcon from '@/components/vendors/VendorIcon';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { UserContext } from '@/app/userProvider';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { useDateFormat } from '@/hooks/useDateFormat';
import { cn } from '@/lib/utils';
import type {
  VendorListRow,
  VendorTableRow,
} from '@/lib/v2/vendors/transforms';

const LAYOUT_KEY: ColumnLayoutViewKey = 'vendors.list';

const isVendorRow = (row: VendorTableRow): row is VendorListRow =>
  row.kind === 'vendor';

function SpendCell({ value }: { value: number }) {
  const { formatBaseCurrency } = useBaseCurrency();
  return (
    <span className="block text-right text-sm tabular-nums">
      {formatBaseCurrency(value)}
    </span>
  );
}

function ProductDateCell({ date }: { date: string | null }) {
  const { dateFormat } = useDateFormat();
  const advanceNoticePeriod =
    useContext(UserContext)?.userMetadata?.userProfile?.advance_notice_period;
  return (
    <DateDisplay
      date={date}
      variant="date"
      alertRange={advanceNoticePeriod ?? undefined}
      formatPattern={dateFormat}
    />
  );
}

function SinceCell({ isoDate }: { isoDate: string | null }) {
  return (
    <span className="whitespace-nowrap text-sm">
      {isoDate ? isoDate.slice(0, 4) : 'N/A'}
    </span>
  );
}

// A real button, like InlineExpandToggle: the badge is the row's only
// expand control, so it has to be reachable and announced.
function ProductCountBadge({
  count,
  expanded,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className={cn(
        badgeVariants({ variant: 'secondary' }),
        'cursor-pointer gap-1 whitespace-nowrap tabular-nums hover:bg-primary/20',
      )}
    >
      {count} {count === 1 ? 'product' : 'products'}
      <ChevronDown
        className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')}
        aria-hidden
      />
    </button>
  );
}

// Bars scale to the largest vendor rather than to 100%, so the spread between
// vendors stays readable when no single vendor dominates; the label carries
// the true share.
function SpendShareCell({
  share,
  largestShare,
}: {
  share: number;
  largestShare: number;
}) {
  const fill = largestShare > 0 ? (share / largestShare) * 100 : 0;
  return (
    <div className="flex items-center gap-0">
      <Progress value={fill} className="h-1.5 flex-1" />
      <span className="w-10 shrink-0 text-right font-sans-neue text-xs leading-none text-muted-foreground">
        {(share * 100).toFixed(1)}%
      </span>
    </div>
  );
}

function largestSpendShare(rows: VendorTableRow[]): number {
  return rows.reduce(
    (max, row) => (isVendorRow(row) ? Math.max(max, row.spendShare) : max),
    0,
  );
}

const COLUMNS: ColumnDef<VendorTableRow>[] = [
  {
    id: 'vendor',
    accessorFn: (row) => (isVendorRow(row) ? row.name : undefined),
    header: ({ column }) => <ColumnHeader column={column} title="Vendor" />,
    cell: ({ row }) =>
      isVendorRow(row.original) ? (
        <Link
          href={`/vendors/${row.original.id}`}
          prefetch={false}
          className="flex min-w-0 items-center"
        >
          <VendorIcon
            name={row.original.name}
            domain={row.original.domain}
            width={36}
            height={36}
            className="shrink-0"
          />
          <span className="font-medium ml-4 block truncate font-sans text-[1.05em] leading-[1.15] tracking-[0.02rem] underline-offset-2 hover:underline">
            {row.original.name}
          </span>
        </Link>
      ) : null,
    meta: { className: 'w-1/4 min-w-[300px]' },
  },
  {
    id: 'activeAgreements',
    accessorFn: (row) => (isVendorRow(row) ? row.activeAgreements : undefined),
    header: ({ column }) => (
      <ColumnHeader column={column} title="Active Agreements" />
    ),
    cell: ({ row }) =>
      isVendorRow(row.original) ? (
        <Badge variant="secondary" className="tabular-nums">
          {row.original.activeAgreements}
        </Badge>
      ) : null,
  },
  {
    id: 'products',
    accessorFn: (row) => (isVendorRow(row) ? row.subRows.length : row.name),
    header: ({ column }) => <ColumnHeader column={column} title="Products" />,
    cell: ({ row }) => {
      if (!isVendorRow(row.original)) {
        return (
          <span className="line-clamp-2 font-sans text-[0.9rem] leading-tight tracking-[0.02rem]">
            {row.original.name}
          </span>
        );
      }
      return row.original.subRows.length > 0 ? (
        <ProductCountBadge
          count={row.original.subRows.length}
          expanded={row.getIsExpanded()}
          onToggle={() => row.toggleExpanded()}
        />
      ) : null;
    },
    meta: { className: 'min-w-[220px]' },
  },
  {
    id: 'cancelByDate',
    accessorFn: (row) =>
      isVendorRow(row) ? undefined : (row.cancelByDate ?? undefined),
    header: ({ column }) => <ColumnHeader column={column} title="Cancel By" />,
    cell: ({ row }) =>
      isVendorRow(row.original) ? null : (
        <ProductDateCell date={row.original.cancelByDate} />
      ),
    meta: { className: 'font-label' },
  },
  {
    id: 'termEndDate',
    accessorFn: (row) =>
      isVendorRow(row) ? undefined : (row.termEndDate ?? undefined),
    header: ({ column }) => <ColumnHeader column={column} title="End Date" />,
    cell: ({ row }) =>
      isVendorRow(row.original) ? null : (
        <ProductDateCell date={row.original.termEndDate} />
      ),
    meta: { className: 'font-label' },
  },
  {
    id: 'currentSpend',
    accessorKey: 'currentSpend',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Current Spend" align="right" />
    ),
    cell: ({ row }) => <SpendCell value={row.original.currentSpend} />,
    meta: { className: 'text-right' },
  },
  {
    id: 'projectedSpend',
    accessorKey: 'projectedSpend',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Projected Spend" align="right" />
    ),
    cell: ({ row }) => <SpendCell value={row.original.projectedSpend} />,
    meta: { className: 'text-right' },
  },
  {
    id: 'spendShare',
    accessorFn: (row) => (isVendorRow(row) ? row.spendShare : undefined),
    header: ({ column }) => (
      <ColumnHeader column={column} title="Share of Spend" />
    ),
    cell: ({ row, table }) =>
      isVendorRow(row.original) ? (
        <SpendShareCell
          share={row.original.spendShare}
          largestShare={largestSpendShare(table.options.data)}
        />
      ) : null,
    meta: { className: 'w-[220px] min-w-[180px]' },
  },
  {
    id: 'relationshipStart',
    accessorFn: (row) =>
      isVendorRow(row) ? (row.relationshipStartDate ?? undefined) : undefined,
    header: ({ column }) => <ColumnHeader column={column} title="Since" />,
    cell: ({ row }) =>
      isVendorRow(row.original) ? (
        <SinceCell isoDate={row.original.relationshipStartDate} />
      ) : null,
  },
  {
    id: 'assetClasses',
    accessorFn: (row) =>
      isVendorRow(row) ? row.assetClasses.join(', ') : undefined,
    header: ({ column }) => (
      <ColumnHeader column={column} title="Asset Classes" />
    ),
    cell: ({ row }) =>
      isVendorRow(row.original) && row.original.assetClasses.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {row.original.assetClasses.map((name) => (
            <Badge key={name} variant="secondary" className="text-xs">
              {name}
            </Badge>
          ))}
        </div>
      ) : null,
  },
];

const COLUMNS_BY_ID = new Map(COLUMNS.map((column) => [column.id, column]));

export function VendorsTable({ rows }: { rows: VendorListRow[] }) {
  const { layout } = useColumnLayout(LAYOUT_KEY);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'vendor', desc: false },
  ]);
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const columns = useMemo(
    () =>
      applyColumnLayout(VENDORS_LIST_COLUMNS, layout, LAYOUT_KEY).flatMap(
        (spec) => {
          const column = COLUMNS_BY_ID.get(columnSpecId(spec));
          return column ? [column] : [];
        },
      ),
    [layout],
  );

  const table = useReactTable<VendorTableRow>({
    data: rows,
    columns,
    state: { sorting, expanded },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getRowId: (row) => String(row.id),
    getSubRows: (row) => (isVendorRow(row) ? row.subRows : undefined),
    getRowCanExpand: (row) =>
      isVendorRow(row.original) && row.original.subRows.length > 0,
    paginateExpandedRows: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  });

  if (rows.length === 0) {
    return (
      <div className="rounded-md border p-12 text-center text-sm text-muted-foreground">
        No vendors found.
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-6 flex min-h-8 justify-end">
        <ColumnLayoutMenu
          viewKey={LAYOUT_KEY}
          defaults={VENDORS_LIST_COLUMNS}
        />
      </div>
      <Table stickyHeader scrollClassName="rounded-md border">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
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
            <TableRow
              key={row.id}
              className={cn(
                'leading-[1.15]',
                row.depth > 0 && 'bg-muted/50 dark:bg-muted/40',
              )}
            >
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
        </TableBody>
      </Table>
      <TablePagination table={table} showSizeSelector hideWhenSinglePage />
    </div>
  );
}
