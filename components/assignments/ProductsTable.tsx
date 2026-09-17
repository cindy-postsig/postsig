'use client';

import { Fragment, useCallback, useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getGroupedRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type Row,
  type SortingState,
} from '@tanstack/react-table';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BaseCurrencyCell } from '@/components/ui/data-table/money';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ProductRow, VendorGroup } from '@/lib/v2/assignments/rows';
import {
  SID_ENTITLEMENTS_PRODUCT_NAME,
  isSidContractId,
  sidExchangeHref,
  sidSubscriptionsHref,
} from '@/lib/v2/bloomberg-sid/keys';
import { ariaSort } from './ariaSort';
import type { ProductSheetTab } from './ProductSheet';

const GROUP_BY_VENDOR = ['vendorName'];

/**
 * The shared `ColumnHeader` re-sorts on every click; this table cycles a third
 * time back to the order `buildProductRows` handed over, which is what
 * TanStack's own toggle handler does.
 */
function SortHeader<TData>({
  column,
  title,
}: {
  column: Column<TData, unknown>;
  title: string;
}) {
  const sorted = column.getIsSorted();
  return (
    <Button
      variant="link"
      onClick={column.getToggleSortingHandler()}
      className={cn(
        'h-auto gap-1 whitespace-nowrap p-0 text-[0.75rem] hover:bg-transparent 3xl:text-[0.8rem]',
        sorted
          ? 'font-medium text-foreground'
          : 'font-normal text-muted-foreground',
      )}
    >
      {title}
      {sorted === 'asc' && <ArrowUp className="h-4 w-4" />}
      {sorted === 'desc' && <ArrowDown className="h-4 w-4" />}
    </Button>
  );
}

function buildColumns(
  onOpen: (product: ProductRow, tab: ProductSheetTab) => void,
  split: ReadonlySet<string>,
  onToggleSplit: (key: string) => void,
): ColumnDef<ProductRow>[] {
  return [
    {
      id: 'vendorName',
      accessorKey: 'vendorName',
      header: ({ column }) => <SortHeader column={column} title="Vendor" />,
      // The vendor is named once, on the group row above its products.
      cell: () => null,
    },
    {
      id: 'productName',
      accessorKey: 'productName',
      header: ({ column }) => <SortHeader column={column} title="Product" />,
      cell: ({ row }) => {
        const product = row.original;
        const open = split.has(product.key);
        return (
          <span className="flex items-center gap-1">
            {/* Every row keeps the slot, so names line up whether or not
                there is anything to open. */}
            <span className="-ml-1 inline-flex size-4 shrink-0">
              {product.entitledSeatCount > 0 && (
                <button
                  type="button"
                  aria-label={`${open ? 'Hide' : 'Show'} the cost split of ${product.productName}`}
                  aria-expanded={open}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => onToggleSplit(product.key)}
                >
                  {open ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                </button>
              )}
            </span>
            <button
              type="button"
              className="font-medium text-left hover:underline"
              onClick={() => onOpen(product, 'details')}
            >
              {product.productName}
            </button>
          </span>
        );
      },
    },
    {
      id: 'userCount',
      accessorKey: 'userCount',
      aggregationFn: 'sum',
      header: ({ column }) => <SortHeader column={column} title="Users" />,
      meta: { className: 'text-right' },
      cell: ({ row }) => (
        <button
          type="button"
          className="hover:underline"
          aria-label={`${row.original.userCount} users of ${row.original.productName}`}
          onClick={() => onOpen(row.original, 'users')}
        >
          {row.original.userCount}
        </button>
      ),
    },
    {
      id: 'inactiveCount',
      accessorKey: 'inactiveCount',
      aggregationFn: 'sum',
      header: ({ column }) => <SortHeader column={column} title="Inactive" />,
      meta: { className: 'text-right' },
      cell: ({ row }) => (
        <button
          type="button"
          className={cn(
            'hover:underline',
            row.original.inactiveCount > 0 && 'text-destructive',
          )}
          aria-label={`${row.original.inactiveCount} inactive seats of ${row.original.productName}`}
          onClick={() => onOpen(row.original, 'inactive')}
        >
          {row.original.inactiveCount}
        </button>
      ),
    },
    {
      id: 'monthlyCost',
      accessorKey: 'monthlyCost',
      aggregationFn: 'sum',
      header: ({ column }) => (
        <TooltipProvider>
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={column.getToggleSortingHandler()}
                className={cn(
                  'underline decoration-dotted underline-offset-4',
                  column.getIsSorted()
                    ? 'font-medium text-foreground'
                    : 'font-normal text-muted-foreground',
                )}
              >
                Monthly
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="w-72">
              Each holder&apos;s allocated cost, apportioned across their seats
              by the allocation line that funds each one. Per-user and per-scope
              totals are exact; the split across products is derived.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),
      meta: { className: 'text-right' },
      cell: ({ row }) => (
        <BaseCurrencyCell amount={row.original.monthlyCost} showCents />
      ),
    },
  ];
}

/**
 * Products in scope, listed flat under a collapsible row per vendor that
 * carries the subtotal. Three click targets per product — name, users,
 * inactive — because each opens the detail panel on a different tab. A
 * Bloomberg product whose terminals carry exchange entitlements folds their
 * charges into its figure, and a chevron opens the terminal-versus-
 * entitlements split.
 */
export function ProductsTable({
  groups,
  onOpen,
}: {
  groups: VendorGroup[];
  onOpen: (product: ProductRow, tab: ProductSheetTab) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [split, setSplit] = useState<ReadonlySet<string>>(() => new Set());

  const toggleSplit = useCallback(
    (key: string) =>
      setSplit((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );

  const data = useMemo(
    () => groups.flatMap((group) => group.products),
    [groups],
  );
  const columns = useMemo(
    () => buildColumns(onOpen, split, toggleSplit),
    [onOpen, split, toggleSplit],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, grouping: GROUP_BY_VENDOR },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    initialState: { expanded: true },
    autoResetPageIndex: false,
  });

  return (
    <section className="rounded-lg border border-border">
      <header className="border-b border-border px-4 py-3">
        <h2 className="font-medium font-sans text-base leading-none">
          Products in scope
        </h2>
      </header>

      {groups.length === 0 ? (
        <p className="px-4 py-8 text-sm text-muted-foreground">
          No products are assigned to anyone in this scope.
        </p>
      ) : (
        <div className="max-h-[60vh] overflow-auto">
          <Table className="border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-10 bg-background">
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
              {table.getRowModel().rows.map((row) =>
                row.getIsGrouped() ? (
                  <VendorRow key={row.id} row={row} />
                ) : (
                  <Fragment key={row.id}>
                    <TableRow>
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
                    {split.has(row.original.key) && (
                      <SplitRows product={row.original} />
                    )}
                  </Fragment>
                ),
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function VendorRow({ row }: { row: Row<ProductRow> }) {
  const inactiveCount = row.getValue<number>('inactiveCount');
  return (
    <TableRow className="bg-muted/40 hover:bg-muted/40">
      <TableCell className="font-medium">
        <button
          type="button"
          aria-expanded={row.getIsExpanded()}
          onClick={row.getToggleExpandedHandler()}
          className="flex items-center gap-1"
        >
          {row.getIsExpanded() ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
          {row.getValue<string>('vendorName')}
        </button>
      </TableCell>
      <TableCell />
      <TableCell className="font-medium text-right">
        {row.getValue<number>('userCount')}
      </TableCell>
      <TableCell
        className={cn(
          'font-medium text-right',
          inactiveCount > 0 && 'text-destructive',
        )}
      >
        {inactiveCount}
      </TableCell>
      <TableCell className="font-medium text-right">
        <BaseCurrencyCell
          amount={row.getValue<number>('monthlyCost')}
          showCents
        />
      </TableCell>
    </TableRow>
  );
}

// Each half of the split opens the inventory view's own tab for it.
function SplitRows({ product }: { product: ProductRow }) {
  const sidVendorId =
    product.vendorId !== null && product.contractIds.every(isSidContractId)
      ? product.vendorId
      : null;
  return (
    <>
      <SplitRow
        label="Terminal"
        note={`${product.userCount} ${product.userCount === 1 ? 'seat' : 'seats'}`}
        value={product.monthlyCost - product.entitlementsMonthlyCost}
        href={
          sidVendorId === null
            ? undefined
            : sidSubscriptionsHref(sidVendorId, {
                product: product.productName,
              })
        }
      />
      <SplitRow
        label={SID_ENTITLEMENTS_PRODUCT_NAME}
        note={`${product.entitledSeatCount} ${product.entitledSeatCount === 1 ? 'seat' : 'seats'}`}
        value={product.entitlementsMonthlyCost}
        href={sidVendorId === null ? undefined : sidExchangeHref(sidVendorId)}
      />
    </>
  );
}

function SplitRow({
  label,
  note,
  value,
  href,
}: {
  label: string;
  note: string;
  value: number;
  href?: string;
}) {
  return (
    <TableRow className="bg-muted/20 hover:bg-muted/20">
      <TableCell />
      <TableCell className="pl-10 text-sm text-muted-foreground">
        {href ? (
          <Link href={href} className="hover:underline">
            {label}
          </Link>
        ) : (
          label
        )}
        <span className="ml-2 text-xs">{note}</span>
      </TableCell>
      <TableCell />
      <TableCell />
      <TableCell className="text-right text-sm text-muted-foreground">
        <BaseCurrencyCell amount={value} showCents />
      </TableCell>
    </TableRow>
  );
}
