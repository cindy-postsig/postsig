'use client';

import { useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type Row,
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
import { InvoiceStatusCell } from '@/components/contracts/columns';
import VendorIcon from '@/components/vendors/VendorIcon';
import { Badge } from '@/components/ui/badge';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { formatDate } from '@/lib/date-format';
import { formatCurrency } from '@/app/lib/utils';
import { cn } from '@/lib/utils';
import type { ContractTableRow } from '@/lib/v2/core/types';
import type { InvoiceValidation } from '@/lib/v2/invoices/validation';
import type { ResolvedReportWindow } from '@/lib/v2/cost-allocation/report-window';
import { discrepancyColor } from '@/lib/v2/invoices/folders';
import { useInvoiceFilters } from './useInvoiceFilters';
import { productNames } from '@/lib/v2/invoices/productNames';
import { getInvoiceStatusLabel } from '@/constants/invoiceStatus';
import { contractRowHref } from '@/lib/v2/contracts/rowHref';

// A single, cohesive row shape — Due Date and the discrepancy Validation
// live on the row itself rather than in separate id-keyed lookup maps
// threaded alongside it, so there's one source of truth per invoice instead
// of three parallel structures that have to stay in sync by id.
export interface InvoiceRow extends ContractTableRow {
  dueDate: string | null;
  validation: InvoiceValidation | undefined;
}

const STICKY_STATUS_CLASS =
  'sticky right-0 bg-background bg-gradient-to-r from-gray-700/5 group-hover/row:bg-muted border-l pl-4 z-10 transition-colors';

interface DiscrepancyRow {
  validation: string;
  description: string;
  /** Overrides the row's default red — underbilling reads as green here
   * too, everywhere the discrepancy number itself appears. */
  color?: string;
}

function dateColumn(
  id: 'termStartDate' | 'termEndDate' | 'executionDate',
  title: string,
): ColumnDef<InvoiceRow> {
  return {
    id,
    // `?? undefined` + sortUndefined: 'last' pushes blank dates to the
    // bottom regardless of sort direction (same convention as
    // ProductExplorerTable's asset-class/fee columns — a custom sortingFn
    // wouldn't, since TanStack still flips a plain -1/1 result for desc).
    // Without it, TanStack's 'auto' sortingFn compares a null date against
    // a string with `>`/`<`, which is neither <, >, nor === in either
    // direction — a non-transitive comparator that leaves blanks wherever
    // the sort algorithm happens to drop them, not chronological at all.
    accessorFn: (row) => row[id] ?? undefined,
    sortUndefined: 'last',
    header: ({ column }) => <ColumnHeader column={column} title={title} />,
    cell: ({ row }) => {
      const value = row.original[id];
      return value ? (
        <span className="whitespace-nowrap text-sm">{formatDate(value)}</span>
      ) : null;
    },
  };
}

function getDiscrepancies(
  validation: InvoiceValidation,
  currency: string,
): DiscrepancyRow[] {
  const rows: DiscrepancyRow[] = [];
  if (!validation.amountMatch) {
    const amountSign = validation.amountDifference >= 0 ? '+' : '';
    const pctSign = validation.amountDifferencePercent >= 0 ? '+' : '';
    rows.push({
      validation: 'Invoice Amount',
      description: `${amountSign}${formatCurrency(validation.amountDifference, currency, true)} (${pctSign}${validation.amountDifferencePercent.toFixed(2)}%)`,
      color: discrepancyColor(validation.amountDifference),
    });
  }
  if (!validation.frequencyMatch) {
    rows.push({
      validation: 'Frequency',
      description: `${validation.invoiceBillingFrequency} instead of ${validation.parentBillingFrequency}`,
    });
  }
  if (!validation.serviceOrderAvailable) {
    rows.push({ validation: 'Service Order', description: 'Missing' });
  }
  if (!validation.productsMatch) {
    rows.push({
      validation: 'Product Consistency',
      description: 'Unexpected products',
    });
  }
  return rows;
}

// A stable module-level column list — no per-render data needs to be
// injected via closure anymore now that Due Date and Validation live on the
// row itself, so this no longer needs to be rebuilt (or memoized) per render.
const COLUMNS: ColumnDef<InvoiceRow>[] = [
  {
    id: 'vendor',
    accessorKey: 'vendor',
    header: ({ column }) => <ColumnHeader column={column} title="Vendor" />,
    // Row-level click already opens the invoice; this cell is just a label.
    cell: ({ row }) => (
      <div className="flex min-w-0 items-center gap-2">
        <VendorIcon
          name={row.original.vendor}
          domain={row.original.vendorDomain}
          width={28}
          height={28}
          className="shrink-0 rounded-sm"
        />
        <span className="font-medium truncate font-sans text-sm text-foreground">
          {row.original.vendor}
        </span>
      </div>
    ),
  },
  {
    id: 'product',
    accessorFn: (row) => productNames(row),
    header: ({ column }) => <ColumnHeader column={column} title="Product" />,
    cell: ({ getValue }) => (
      <span className="line-clamp-2 text-balance font-sans text-sm leading-tight">
        {getValue<string>()}
      </span>
    ),
    meta: { className: 'min-w-[200px]' },
  },
  {
    id: 'orderNumber',
    accessorKey: 'orderNumber',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Invoice No." />
    ),
    cell: ({ row }) =>
      row.original.orderNumber ? (
        <span className="font-mono text-sm">{row.original.orderNumber}</span>
      ) : null,
  },
  {
    id: 'recordedAmount',
    // Archived invoices never get an engine spend stamp (only the active
    // fetch pipeline computes recordedAmount), so it's always null there —
    // validation.invoiceAmount is engine-independent and already computed
    // for every invoice with a linked parent, so it fills the gap. An
    // invoice with no linked Service Order has no parent to validate
    // against, so validation.invoiceAmount comes back a hardcoded 0 rather
    // than a real read — currentBudget (the legacy price-history amount,
    // unrelated to SO linkage) is the last fallback, same as the
    // Discrepancy Report's billedInvoiceAmount uses.
    accessorFn: (row) =>
      row.recordedAmount ??
      (row.validation?.serviceOrderAvailable
        ? row.validation.invoiceAmount
        : (row.currentBudget ?? 0)),
    header: ({ column }) => (
      <ColumnHeader column={column} title="Billed Amount" align="right" />
    ),
    cell: ({ row, getValue }) => (
      <span className="block text-right text-sm tabular-nums">
        {formatCurrency(getValue<number>(), row.original.currency)}
      </span>
    ),
    meta: { className: 'text-right' },
  },
  {
    id: 'invoiceValidation',
    accessorFn: (row) => row.validation?.discrepancyCount ?? -1,
    header: ({ column }) => (
      <ColumnHeader column={column} title="Invoice Validation" />
    ),
    cell: ({ row }) =>
      row.original.validation ? (
        <InvoiceValidationBadge
          validation={row.original.validation}
          currency={row.original.currency}
        />
      ) : null,
  },
  dateColumn('termStartDate', 'Billing Period Start Date'),
  dateColumn('termEndDate', 'Billing Period End Date'),
  dateColumn('executionDate', 'Invoice Date'),
  {
    id: 'dueDate',
    // Same reasoning as dateColumn() above.
    accessorFn: (row) => row.dueDate ?? undefined,
    sortUndefined: 'last',
    header: ({ column }) => <ColumnHeader column={column} title="Due Date" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm">
        {row.original.dueDate ? formatDate(row.original.dueDate) : 'N/A'}
      </span>
    ),
  },
  {
    id: 'businessSponsor',
    accessorFn: (row) =>
      Array.isArray(row.businessSponsor)
        ? row.businessSponsor.join(', ')
        : (row.businessSponsor ?? ''),
    header: ({ column }) => (
      <ColumnHeader column={column} title="Business Sponsor" />
    ),
    cell: ({ getValue }) => {
      const label = getValue<string>();
      return label ? (
        <span className="whitespace-nowrap text-sm">{label}</span>
      ) : null;
    },
  },
  {
    id: 'businessGroup',
    accessorKey: 'businessGroup',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Business Group" />
    ),
    cell: ({ row }) =>
      row.original.businessGroup ? (
        <span className="whitespace-nowrap text-sm">
          {row.original.businessGroup}
        </span>
      ) : null,
  },
  {
    id: 'tags',
    accessorFn: (row) => (row.tags ?? []).map((tag) => tag.name).join(', '),
    header: ({ column }) => <ColumnHeader column={column} title="Tags" />,
    cell: ({ row }) => {
      const tags = row.original.tags ?? [];
      if (tags.length === 0) return null;
      return (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge key={tag.id} variant="secondary" className="text-xs">
              {tag.name}
            </Badge>
          ))}
        </div>
      );
    },
  },
  {
    id: 'invoiceStatus',
    accessorFn: (row) => getInvoiceStatusLabel(row.invoiceStatus),
    header: ({ column }) => <ColumnHeader column={column} title="Status" />,
    cell: ({ row }: { row: Row<InvoiceRow> }) => (
      <div onClick={(e) => e.stopPropagation()}>
        {/* InvoiceStatusCell only reads fields InvoiceRow inherits from
            ContractTableRow; TanStack's Row<T> is invariant in T so the
            wider InvoiceRow needs an explicit cast here. */}
        <InvoiceStatusCell row={row as unknown as Row<ContractTableRow>} />
      </div>
    ),
    meta: { className: STICKY_STATUS_CLASS },
  },
];

// Standalone (not tied to a TanStack cell context) so the dashboard's
// condensed Invoice Discrepancies preview can render the identical badge.
export function InvoiceValidationBadge({
  validation,
  currency,
}: {
  validation: InvoiceValidation;
  currency: string;
}) {
  const hasDiscrepancies = validation.discrepancyCount > 0;

  const badge = (
    <Badge
      variant="outline"
      className="cursor-default whitespace-nowrap rounded-md text-xs"
      style={{
        borderColor: hasDiscrepancies ? '#CC003F' : '#00A86B',
        color: hasDiscrepancies ? '#CC003F' : '#00A86B',
        backgroundColor: hasDiscrepancies
          ? 'rgba(204, 0, 63, 0.1)'
          : 'rgba(0, 168, 107, 0.1)',
      }}
    >
      {hasDiscrepancies
        ? `${validation.discrepancyCount} Discrepanc${validation.discrepancyCount === 1 ? 'y' : 'ies'}`
        : 'No Discrepancies'}
    </Badge>
  );

  if (!hasDiscrepancies) return badge;

  const discrepancies = getDiscrepancies(validation, currency);

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{badge}</HoverCardTrigger>
      <HoverCardContent
        className="w-auto min-w-[300px] p-2"
        side="bottom"
        align="start"
        sideOffset={4}
      >
        <table className="w-full border-collapse">
          <tbody>
            {discrepancies.map((discrepancy, i) => (
              <tr
                key={discrepancy.validation}
                className={i < discrepancies.length - 1 ? 'border-b' : ''}
              >
                <td className="font-normal py-1.5 pr-4 align-top font-sans text-xs text-foreground">
                  {discrepancy.validation}
                </td>
                <td
                  className="font-normal py-1.5 align-top font-sans text-xs"
                  style={{ color: discrepancy.color ?? '#CC003F' }}
                >
                  {discrepancy.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </HoverCardContent>
    </HoverCard>
  );
}

export function InvoicesTable({
  rows,
  optionRows,
  showDateFilter = true,
  showStatusFilter = true,
  fiscalConfig,
  dateFormat,
  onDateWindowChange,
  onVendorFilterChange,
  onTagFilterChange,
  onGroupFilterChange,
  onSponsorFilterChange,
}: {
  rows: InvoiceRow[];
  /** Row set the Vendor/Tags/Sponsor/Group dropdowns build their options
   * from — defaults to `rows`. Pass the full cross-folder set when `rows` is
   * scoped to one folder, so a filter persisted from another folder tab
   * still has a matching option here. */
  optionRows?: InvoiceRow[];
  /** Off where the rows are already one vendor's, so its whole history shows. */
  showDateFilter?: boolean;
  /** Off for folders already pre-filtered to one status — the dropdown
   * would only ever repeat it. */
  showStatusFilter?: boolean;
  /** Only meaningful while the date filter shows — it resolves the same
   * fiscal-year-aware presets as the Invoice Cost Allocation report. */
  fiscalConfig?: { startMonth: number };
  dateFormat?: string;
  /** Fires when the date window, vendor, tag, group, or sponsor filter
   * changes, purely so something else that isn't rendered here (the stat
   * tiles) can mirror the same value. See useInvoiceFilters. */
  onDateWindowChange?: (window: ResolvedReportWindow) => void;
  onVendorFilterChange?: (value: string) => void;
  onTagFilterChange?: (value: string) => void;
  onGroupFilterChange?: (value: string) => void;
  onSponsorFilterChange?: (value: string) => void;
}) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'vendor', desc: false },
  ]);
  const { filteredRows, filterBar } = useInvoiceFilters(rows, {
    showDate: showDateFilter,
    showStatus: showStatusFilter,
    fiscalConfig,
    dateFormat,
    optionRows,
    onDateWindowChange,
    onVendorFilterChange,
    onTagFilterChange,
    onGroupFilterChange,
    onSponsorFilterChange,
  });

  const table = useReactTable({
    data: filteredRows,
    columns: COLUMNS,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 50 },
      columnVisibility: { businessSponsor: false, businessGroup: false },
    },
  });

  if (rows.length === 0) {
    return (
      <div className="rounded-md border p-12 text-center text-sm text-muted-foreground">
        No invoices found.
      </div>
    );
  }

  return (
    <>
      {filterBar}
      {filteredRows.length === 0 ? (
        <div className="rounded-md border p-12 text-center text-sm text-muted-foreground">
          No invoices match your filters.
        </div>
      ) : (
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
                className="group/row cursor-pointer"
                tabIndex={0}
                aria-label={`Open invoice ${row.original.orderNumber ?? row.original.id}`}
                onClick={() => router.push(contractRowHref(row.original.id))}
                onKeyDown={(e: KeyboardEvent) => {
                  // Only the row itself, not a focused descendant (e.g. a
                  // textarea inside an in-cell dialog), should navigate on
                  // Space/Enter — otherwise typing a space there bubbles up
                  // and navigates away instead of inserting the space.
                  if (
                    (e.key === 'Enter' || e.key === ' ') &&
                    e.target === e.currentTarget
                  ) {
                    e.preventDefault();
                    router.push(contractRowHref(row.original.id));
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
      )}
      {filteredRows.length > 0 && (
        <TablePagination table={table} showSizeSelector hideWhenSinglePage />
      )}
    </>
  );
}
