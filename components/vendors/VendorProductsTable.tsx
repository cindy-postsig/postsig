'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
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
import { createInventoryColumns } from '@/app/(app)/(cpm)/inventory/columns';
import { InventoryItemSheet } from '@/app/(app)/(cpm)/inventory/InventoryItemSheet';
import { ColumnHeader } from '@/components/contracts/ColumnHeader';
import VendorIcon from '@/components/vendors/VendorIcon';
import { sidSubscriptionsHref } from '@/lib/v2/bloomberg-sid/keys';
import type { InventoryItem } from '@/lib/v2/inventory/types';
import type { UserMetadata } from '@/constants/types';
import { cn } from '@/lib/utils';

// Inventory columns reused as-is, minus vendor (the page is the vendor),
// status (every row here is on an active contract) and the alert, delivery
// and ownership columns. The product column is this table's own.
const INVENTORY_COLUMN_IDS = [
  'licensesCount',
  'activeUsers',
  'startDate',
  'endDate',
  'cost',
] as const;

// Pinned so the product column takes the slack; the Inventory page lets
// active users grow instead.
const WIDTH_OVERRIDES: Partial<Record<string, string>> = {
  licensesCount: 'w-28 text-center font-label',
  activeUsers: 'w-28 text-center font-label',
};

const columnId = (column: ColumnDef<InventoryItem>): string =>
  ('accessorKey' in column ? String(column.accessorKey) : undefined) ??
  column.id ??
  '';

const PRODUCT_COLUMN: ColumnDef<InventoryItem> = {
  accessorKey: 'productName',
  header: ({ column }) => <ColumnHeader column={column} title="Product" />,
  cell: ({ row }) => (
    <div className="flex min-w-0 items-center gap-3">
      <VendorIcon
        name={row.original.vendor}
        domain={row.original.vendorDomain}
        width={28}
        height={28}
        className="shrink-0"
      />
      <span className="font-medium font-sans text-[0.9rem] leading-tight tracking-[0.02rem]">
        {row.original.productName.join(', ')}
      </span>
    </div>
  ),
  meta: { className: 'w-full min-w-[280px]' },
};

export function VendorProductsTable({
  items,
  userMetadata,
  costAllocationEnabled,
}: {
  items: InventoryItem[];
  userMetadata: UserMetadata;
  costAllocationEnabled: boolean;
}) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'endDate', desc: false },
  ]);
  const [selected, setSelected] = useState<InventoryItem | null>(null);

  // The item sheet is contract-backed, so a SID row goes to its own view.
  const openRow = (item: InventoryItem) => {
    if (item.source === 'bloomberg-sid' && item.vendorId != null) {
      const [productName] = item.productName;
      router.push(
        sidSubscriptionsHref(item.vendorId, { product: productName }),
      );
      return;
    }
    setSelected(item);
  };

  const columns = useMemo(() => {
    const advanceNoticePeriod =
      userMetadata.userProfile?.advance_notice_period || 90;
    const byId = new Map(
      createInventoryColumns(advanceNoticePeriod, userMetadata.dateFormat).map(
        (column) => [columnId(column), column],
      ),
    );
    return [
      PRODUCT_COLUMN,
      ...INVENTORY_COLUMN_IDS.flatMap((id) => {
        const column = byId.get(id);
        if (!column) return [];
        const className = WIDTH_OVERRIDES[id];
        return className
          ? { ...column, meta: { ...column.meta, className } }
          : column;
      }),
    ];
  }, [userMetadata]);

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (items.length === 0) {
    return (
      <div className="rounded-md border p-12 text-center text-sm text-muted-foreground">
        No products in inventory for this vendor.
      </div>
    );
  }

  return (
    <>
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
              tabIndex={0}
              className="cursor-pointer leading-[1.15]"
              onClick={() => openRow(row.original)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openRow(row.original);
                }
              }}
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
      <InventoryItemSheet
        item={selected}
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        onDataChange={() => router.refresh()}
        userMetadata={userMetadata}
        costAllocationEnabled={costAllocationEnabled}
      />
    </>
  );
}
