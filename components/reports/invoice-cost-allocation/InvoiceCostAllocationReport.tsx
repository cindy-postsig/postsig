'use client';

import { useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { formatCurrency } from '@/app/lib/utils';
import {
  SUMMARY_CARD_SHELL,
  SummaryCard,
} from '@/components/cards/SummaryCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MultiSelectFilter } from '@/components/ui/data-table/components/MultiSelectFilter';
import { DateRangeControl } from '@/components/reports/DateRangeControl';
import { TargetDonut } from '@/components/contracts/cost-allocation/allocationDisplay';
import VendorIcon from '@/components/vendors/VendorIcon';
import { formatDate } from '@/lib/date-format';
import { cn } from '@/lib/utils';
import { formatPercent } from '@/lib/v2/cost-allocation/activity-labels';
import {
  filterInvoiceReportRows,
  invoiceReportTargetOptions,
  invoiceReportTargetTotals,
  invoiceReportTotalAmount,
  invoiceReportVendorOptions,
  sortInvoiceReportRows,
  type InvoiceReportData,
  type InvoiceReportSortKey,
  type InvoiceReportTarget,
  type InvoiceReportTargetTotal,
  type SortDirection,
} from '@/lib/v2/cost-allocation/invoice-report-rows';
import {
  DEFAULT_INVOICE_REPORT_PERIOD,
  REPORT_PERIOD_PHRASES,
} from '@/lib/v2/cost-allocation/report-window';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SortableHeader } from '@/components/ui/sortable-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { InvoiceAllocationSheet } from './InvoiceAllocationSheet';

const SORT_COLUMNS: {
  key: InvoiceReportSortKey;
  label: string;
  align: 'left' | 'right';
}[] = [
  { key: 'vendor', label: 'Vendor', align: 'left' },
  { key: 'product', label: 'Product', align: 'left' },
  { key: 'contract', label: 'Contract No.', align: 'left' },
  { key: 'invoiceNumber', label: 'Invoice No.', align: 'left' },
  { key: 'billingDate', label: 'Billing Date', align: 'left' },
  { key: 'amount', label: 'Invoice Amount', align: 'right' },
];

interface InvoiceCostAllocationReportProps {
  data: InvoiceReportData;
  canEdit: boolean;
  baseCurrency: string;
  dateFormat: string;
}

function TargetTotalsCard({
  totals,
  total,
  formatAmount,
}: {
  totals: InvoiceReportTargetTotal[];
  total: number;
  formatAmount: (value: number | null) => string;
}) {
  return (
    <div className={cn(SUMMARY_CARD_SHELL, 'p-4')}>
      <div className="mb-4 font-sans text-[0.8rem] leading-none">
        Spend by Allocation Target
        {totals.length > 0 && (
          <span className="text-muted-foreground"> ({totals.length})</span>
        )}
      </div>
      {totals.length > 0 ? (
        <ScrollArea className="h-[190px] [&_[data-orientation=vertical]>div]:bg-foreground/40">
          <ul
            tabIndex={0}
            aria-label={`Spend by allocation target, ${totals.length} targets`}
            className="flex flex-col gap-3 pr-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {totals.map((target) => {
              const share = total > 0 ? (target.amount / total) * 100 : 0;
              // A credit note makes the share negative, which is not a CSS length.
              const barWidth = Math.min(100, Math.max(0, share));
              return (
                <li key={target.key} className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-baseline gap-1.5">
                      <span className="font-medium truncate font-sans-neue text-[0.8rem] text-foreground">
                        {target.name}
                      </span>
                      {target.breadcrumb && (
                        <span className="shrink-0 font-sans-neue text-[0.7rem] leading-none text-muted-foreground">
                          · {target.breadcrumb}
                        </span>
                      )}
                      <span className="shrink-0 font-sans-neue text-[0.7rem] leading-none text-muted-foreground">
                        {target.typeLabel}
                      </span>
                    </div>
                    <span className="flex shrink-0 items-baseline gap-1.5">
                      <span className="font-sans-neue text-xs tabular-nums leading-none">
                        {formatAmount(target.amount)}
                      </span>
                      <span className="w-6 text-right font-sans-neue text-[0.7rem] tabular-nums leading-none text-gray-600">
                        {Math.round(share)}%
                      </span>
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-primary/10">
                    <div
                      className="h-full rounded-full bg-primary/60"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      ) : (
        <div className="flex flex-1 items-center font-sans-neue text-[0.8rem] leading-none text-gray-700">
          No allocation targets
        </div>
      )}
    </div>
  );
}

function AllocationTag({ target }: { target: InvoiceReportTarget }) {
  return (
    <Badge
      variant="outline"
      title={target.productName ? `${target.productName}` : undefined}
      className="gap-1.5 whitespace-nowrap"
    >
      <TargetDonut percent={target.percent} />
      {target.name}
      {target.breadcrumb && (
        <span className="text-xs text-muted-foreground">
          · {target.breadcrumb}
        </span>
      )}
      <span className="tabular-nums text-muted-foreground">
        {formatPercent(target.percent)}
      </span>
    </Badge>
  );
}

export function InvoiceCostAllocationReport({
  data,
  canEdit,
  baseCurrency,
  dateFormat,
}: InvoiceCostAllocationReportProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [targetFilter, setTargetFilter] = useState<string[]>([]);
  const [vendorFilter, setVendorFilter] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<InvoiceReportSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // null = the engine has no value for this record; a false zero on a money
  // field misleads, so it renders as a dash.
  const formatAmount = (value: number | null) =>
    value === null ? '—' : (formatCurrency(value, baseCurrency) ?? '');

  const targetOptions = useMemo(
    () => invoiceReportTargetOptions(data.rows),
    [data.rows],
  );
  const vendorOptions = useMemo(
    () => invoiceReportVendorOptions(data.rows),
    [data.rows],
  );
  const filteredRows = useMemo(
    () =>
      filterInvoiceReportRows(data.rows, {
        targetKeys: targetFilter,
        vendors: vendorFilter,
      }),
    [data.rows, targetFilter, vendorFilter],
  );
  const sortedRows = useMemo(
    () =>
      sortKey === null
        ? filteredRows
        : sortInvoiceReportRows(filteredRows, sortKey, sortDirection),
    [filteredRows, sortKey, sortDirection],
  );
  const totalAmount = invoiceReportTotalAmount(filteredRows);
  const targetTotals = useMemo(
    () => invoiceReportTargetTotals(filteredRows),
    [filteredRows],
  );
  const selectedRow = data.rows.find((row) => row.id === selectedId) ?? null;
  // A widened period is the report's own doing, not a filter the user set —
  // offering Reset for it would clear a URL that is already empty. A custom
  // range is its own period, so this covers a typed range too.
  const windowDeviatesFromDefault =
    data.widenedFrom === null && data.period !== DEFAULT_INVOICE_REPORT_PERIOD;
  const hasActiveFilters =
    targetFilter.length > 0 ||
    vendorFilter.length > 0 ||
    windowDeviatesFromDefault;

  const handleSort = (key: InvoiceReportSortKey) => {
    if (sortKey === key) {
      setSortDirection((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  // A search-param push does not re-enter loading.tsx, so the report would sit
  // unchanged while the server re-renders and the click would read as ignored.
  const [isPending, startTransition] = useTransition();

  const navigate = (query: string) =>
    startTransition(() => router.push(`${pathname}?${query}`));

  const resetFilters = () => {
    setTargetFilter([]);
    setVendorFilter([]);
    // The bare pathname drops period, from and to together.
    if (windowDeviatesFromDefault) {
      startTransition(() => router.push(pathname));
    }
  };

  return (
    <div className="pb-10">
      <div className="mb-10 font-sans text-foreground/70">
        Who pays for each invoice and how much lands on every allocation target.
      </div>

      <div
        className={cn(
          'mb-10 grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2',
          isPending && 'opacity-50',
        )}
      >
        <div className="grid grid-rows-2 gap-4">
          <SummaryCard
            title="Total Invoice Amount"
            description="Recorded amount across the invoices shown"
            amount={totalAmount}
            currency={baseCurrency}
          />
          <SummaryCard
            title="Number of Invoices"
            value={filteredRows.length}
            description={`Invoices billed ${REPORT_PERIOD_PHRASES[data.period]}`}
          />
        </div>
        <TargetTotalsCard
          totals={targetTotals}
          total={totalAmount}
          formatAmount={formatAmount}
        />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="w-[200px]">
          <MultiSelectFilter
            options={targetOptions}
            value={targetFilter}
            onValueChange={setTargetFilter}
            placeholder="All Allocation Targets"
          />
        </div>
        <DateRangeControl
          // The typed dates seed from data.custom, so a window change is a new
          // control: without this, leaving a custom range for a preset would
          // leave the old dates in the fields and let Apply navigate back to a
          // range the user already left.
          key={`${data.period}|${data.custom?.from ?? ''}|${data.custom?.to ?? ''}`}
          period={data.period}
          window={data.window}
          custom={data.custom}
          dateFormat={dateFormat}
          onNavigate={navigate}
          pending={isPending}
        />
        <div className="w-[170px]">
          <MultiSelectFilter
            options={vendorOptions}
            value={vendorFilter}
            onValueChange={setVendorFilter}
            placeholder="All Vendors"
          />
        </div>
        {hasActiveFilters && (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={resetFilters}
          >
            Reset
          </Button>
        )}
        {(data.widenedFrom !== null || data.undatedCount > 0) && (
          // Both notes are asides about the window, so they share one
          // right-aligned column rather than each fighting for `ml-auto`.
          <div className="ml-auto flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
            {data.widenedFrom && (
              <span>
                Nothing billed {REPORT_PERIOD_PHRASES[data.widenedFrom]} —
                showing {REPORT_PERIOD_PHRASES[data.period]}
              </span>
            )}
            {data.undatedCount > 0 && (
              <span>
                {data.undatedCount}{' '}
                {data.undatedCount === 1 ? 'invoice has' : 'invoices have'} no
                billing date and cannot be placed in a period
              </span>
            )}
          </div>
        )}
      </div>

      <div
        aria-busy={isPending}
        className={cn(
          'rounded border border-border transition-opacity',
          isPending && 'pointer-events-none opacity-50',
        )}
      >
        <Table stickyHeader>
          {/* ColumnHeader sets this size on every Contracts/Inventory header;
              TableHeader's own text-[.8em] renders smaller than any of them. */}
          <TableHeader className="text-[0.75rem] 3xl:text-[0.8rem]">
            <TableRow>
              {SORT_COLUMNS.map((column) => (
                <SortableHeader
                  key={column.key}
                  label={column.label}
                  direction={sortKey === column.key ? sortDirection : null}
                  align={column.align}
                  onSort={() => handleSort(column.key)}
                />
              ))}
              <TableHead className="border-l bg-gradient-to-r from-gray-700/5 pl-4">
                Allocation Targets
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={SORT_COLUMNS.length + 1}
                  className="p-8 text-center text-muted-foreground"
                >
                  {data.rows.length === 0
                    ? 'No invoices billed in this period.'
                    : 'No invoices match the selected filters.'}
                </TableCell>
              </TableRow>
            )}
            {sortedRows.map((row) => (
              <TableRow
                key={row.id}
                tabIndex={0}
                aria-label={`Open allocation for invoice ${row.invoiceNumber ?? row.id}`}
                onClick={() => setSelectedId(row.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(row.id);
                  }
                }}
                className="cursor-pointer border-border/60 focus-visible:bg-hover focus-visible:outline-none"
              >
                <TableCell className="font-medium font-sans text-foreground">
                  <div className="flex items-center gap-3">
                    <VendorIcon
                      name={row.vendor}
                      domain={row.vendorDomain}
                      width={36}
                      height={36}
                      lazy
                    />
                    {row.vendor}
                  </div>
                </TableCell>
                <TableCell className="font-sans text-foreground">
                  {row.product}
                  {row.products.length > 1 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      +{row.products.length - 1}
                    </span>
                  )}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {row.parentContract?.label ?? '—'}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {row.invoiceNumber ?? '—'}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {formatDate(row.billingDate, dateFormat)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums text-foreground">
                  {formatAmount(row.amount)}
                </TableCell>
                <TableCell className="border-l bg-gradient-to-r from-gray-700/5 pl-4">
                  {row.targets.length === 0 ? (
                    <span className="text-xs italic text-muted-foreground/70">
                      {row.provenance.kind === 'none'
                        ? 'Unassigned'
                        : row.hasScope
                          ? 'No linked active users'
                          : 'No scope for its products'}
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {row.targets.map((target) => (
                        <AllocationTag
                          key={`${target.productId ?? 'contract'}:${target.key}`}
                          target={target}
                        />
                      ))}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <InvoiceAllocationSheet
        row={selectedRow}
        canEdit={canEdit}
        formatAmount={formatAmount}
        dateFormat={dateFormat}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
