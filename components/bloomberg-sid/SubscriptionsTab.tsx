'use client';

import { Fragment, useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  TABLE_HEADER_CLASS,
  CancelByCell,
  ClearFiltersButton,
  DateCell,
  hasActiveFilters,
  usd,
} from '@/components/bloomberg-sid/bits';
import { FilterSelect } from '@/components/bloomberg-sid/FilterSelect';
import { SearchInput } from '@/components/bloomberg-sid/SearchInput';
import { SubscriptionDrawer } from '@/components/bloomberg-sid/SubscriptionDrawer';
import { ColumnHeader } from '@/components/contracts/ColumnHeader';
import { SeatStatusBadge } from '@/components/seats/SeatStatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TablePagination } from '@/components/ui/data-table/components/TablePagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  sidKey,
  type SidAccount,
  type SidHrMatch,
  type SidKey,
  type SidSubscription,
} from '@/lib/v2/bloomberg-sid/report';
import {
  DEFAULT_SUBSCRIPTION_FILTERS,
  filterSubscriptions,
  type SubscriptionFilters,
} from '@/lib/v2/bloomberg-sid/subscription-filters';
import {
  cancelByDate,
  sidSubscriptionInactiveReasons,
  type SidAllocation,
} from '@/lib/v2/bloomberg-sid/transforms';
import { seatStatusLabel } from '@/lib/v2/seats/status';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS = ['All', 'Active', 'Inactive'];

const RENEWING_WINDOW_DAYS = [30, 60, 90, 180];

function buildColumns(
  accountsByCustNum: Map<number, SidAccount>,
  hrMatches: Record<string, SidHrMatch>,
  expanded: SidKey | null,
  onToggle: (key: SidKey) => void,
): ColumnDef<SidSubscription>[] {
  return [
    {
      id: 'expander',
      header: () => null,
      meta: { className: 'w-8 px-2' },
      cell: ({ row }) => {
        const key = sidKey(row.original.sid, row.original.sidInstNum);
        const open = expanded === key;
        return (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} details for SID ${row.original.sid}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(key);
            }}
          >
            {open ? <ChevronDown /> : <ChevronRight />}
          </Button>
        );
      },
    },
    {
      accessorKey: 'custNum',
      header: ({ column }) => <ColumnHeader column={column} title="Cust Num" />,
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.custNum}</span>
      ),
    },
    {
      accessorKey: 'sid',
      header: ({ column }) => <ColumnHeader column={column} title="SID" />,
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.sid}</span>
      ),
    },
    {
      accessorKey: 'serialNumber',
      header: ({ column }) => <ColumnHeader column={column} title="SN/UUID" />,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.serialNumber}
        </span>
      ),
    },
    {
      accessorKey: 'lastUser',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Last User" />
      ),
    },
    {
      id: 'status',
      accessorFn: (sub) =>
        seatStatusLabel(sidSubscriptionInactiveReasons(sub, hrMatches)),
      header: ({ column }) => <ColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <SeatStatusBadge
          reasons={sidSubscriptionInactiveReasons(row.original, hrMatches)}
        />
      ),
      sortingFn: 'alphanumeric',
    },
    {
      accessorKey: 'gpttDescription',
      header: ({ column }) => <ColumnHeader column={column} title="Product" />,
    },
    {
      accessorKey: 'contractDate',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Contract Date" />
      ),
      cell: ({ row }) => <DateCell value={row.original.contractDate} />,
    },
    {
      id: 'cancelBy',
      accessorFn: (sub) => cancelByDate(sub.renewalDate).getTime(),
      header: ({ column }) => (
        <ColumnHeader column={column} title="Cancel By" />
      ),
      cell: ({ row }) => (
        <CancelByCell renewalDate={row.original.renewalDate} />
      ),
    },
    {
      accessorKey: 'renewalDate',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Renewal Date" />
      ),
      cell: ({ row }) => <DateCell value={row.original.renewalDate} />,
    },
    {
      accessorKey: 'price',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Price" align="right" />
      ),
      cell: ({ row }) => (
        <span className="font-mono">{usd(row.original.price)}</span>
      ),
      meta: { className: 'text-right' },
    },
    {
      accessorKey: 'ninetyDay',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Inactive Last 90 Days" />
      ),
      cell: ({ row }) => (row.original.ninetyDay ? '✓' : ''),
      meta: { className: 'text-center' },
    },
    {
      id: 'auto',
      accessorFn: (sub) => accountsByCustNum.get(sub.custNum)?.auto,
      header: ({ column }) => <ColumnHeader column={column} title="Auto" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {accountsByCustNum.get(row.original.custNum)?.auto ?? '—'}
        </span>
      ),
    },
    {
      id: 'term',
      accessorFn: (sub) => accountsByCustNum.get(sub.custNum)?.term,
      header: ({ column }) => <ColumnHeader column={column} title="Term" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {accountsByCustNum.get(row.original.custNum)?.term ?? '—'}
        </span>
      ),
    },
  ];
}

export function SubscriptionsTab({
  subscriptions,
  accounts,
  accountsByCustNum,
  allocationsBySid,
  hrMatches,
  filters,
  setFilters,
}: {
  subscriptions: SidSubscription[];
  accounts: SidAccount[];
  accountsByCustNum: Map<number, SidAccount>;
  allocationsBySid: Map<SidKey, SidAllocation[]>;
  hrMatches: Record<string, SidHrMatch>;
  filters: SubscriptionFilters;
  setFilters: (filters: SubscriptionFilters) => void;
}) {
  const [expanded, setExpanded] = useState<SidKey | null>(null);
  const today = useMemo(() => new Date(), []);

  const custNumOptions = useMemo(
    () => [
      'All',
      ...Array.from(new Set(subscriptions.map((sub) => sub.custNum)))
        .sort((a, b) => a - b)
        .map(String),
    ],
    [subscriptions],
  );
  const entityNameOptions = useMemo(
    () => [
      'All',
      ...Array.from(new Set(accounts.map((account) => account.name))).sort(),
    ],
    [accounts],
  );
  const productOptions = useMemo(
    () => [
      'All',
      ...Array.from(
        new Set(subscriptions.map((sub) => sub.gpttDescription)),
      ).sort(),
    ],
    [subscriptions],
  );

  // A window the renewals report linked in with is kept selectable, so the
  // select never shows a value missing from its own list.
  const renewingOptions = useMemo(() => {
    const windows = new Set(RENEWING_WINDOW_DAYS);
    if (filters.renewingWithinDays !== null) {
      windows.add(filters.renewingWithinDays);
    }
    return [
      { value: 'All', label: 'All' },
      ...Array.from(windows)
        .sort((a, b) => a - b)
        .map((days) => ({ value: String(days), label: `${days} days` })),
    ];
  }, [filters.renewingWithinDays]);

  const filtered = useMemo(
    () =>
      filterSubscriptions(subscriptions, filters, {
        accountsByCustNum,
        hrMatches,
        today,
      }),
    [subscriptions, accountsByCustNum, hrMatches, filters, today],
  );

  const columns = useMemo(
    () =>
      buildColumns(accountsByCustNum, hrMatches, expanded, (key) => {
        setExpanded((current) => (current === key ? null : key));
      }),
    [accountsByCustNum, hrMatches, expanded],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    getRowId: (row) => sidKey(row.sid, row.sidInstNum),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  return (
    <div>
      <h3 className="mb-6">Terminal Subscriptions</h3>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <SearchInput
          value={filters.search}
          placeholder="SID, SN/UUID or last user"
          onChange={(search) => {
            setFilters({ ...filters, search });
          }}
        />
        <FilterSelect
          label="Cust Num"
          value={filters.custNum}
          options={custNumOptions}
          onChange={(custNum) => {
            setFilters({ ...filters, custNum });
          }}
        />
        <FilterSelect
          label="Entity Name"
          value={filters.entityName}
          options={entityNameOptions}
          className="min-w-[180px]"
          onChange={(entityName) => {
            setFilters({ ...filters, entityName });
          }}
        />
        <FilterSelect
          label="Product"
          value={filters.product}
          options={productOptions}
          className="min-w-[180px]"
          onChange={(product) => {
            setFilters({ ...filters, product });
          }}
        />
        <FilterSelect
          label="Status"
          value={filters.status}
          options={STATUS_OPTIONS}
          className="min-w-[120px]"
          onChange={(status) => {
            setFilters({
              ...filters,
              status: status as SubscriptionFilters['status'],
            });
          }}
        />
        <FilterSelect
          label="Renewing"
          value={
            filters.renewingWithinDays === null
              ? 'All'
              : String(filters.renewingWithinDays)
          }
          options={renewingOptions}
          className="min-w-[120px]"
          onChange={(renewing) => {
            setFilters({
              ...filters,
              renewingWithinDays: renewing === 'All' ? null : Number(renewing),
            });
          }}
        />
        <ClearFiltersButton
          active={hasActiveFilters(filters, DEFAULT_SUBSCRIPTION_FILTERS)}
          onClick={() => {
            setFilters(DEFAULT_SUBSCRIPTION_FILTERS);
          }}
        />
        <span className="ml-auto self-center text-xs text-muted-foreground">
          {filtered.length} of {subscriptions.length} subscriptions
        </span>
      </div>

      <Card>
        <Table stickyHeader className="[&>thead]:bg-card">
          <TableHeader className={TABLE_HEADER_CLASS}>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/40">
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
            {table.getRowModel().rows.map((row) => {
              const key = sidKey(row.original.sid, row.original.sidInstNum);
              const open = expanded === key;
              return (
                <Fragment key={row.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => {
                      setExpanded(open ? null : key);
                    }}
                  >
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
                  {open && (
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={columns.length} className="px-6 py-4">
                        <SubscriptionDrawer
                          sub={row.original}
                          account={accountsByCustNum.get(row.original.custNum)}
                          allocs={allocationsBySid.get(key) ?? []}
                          hrMatch={hrMatches[row.original.lastUser]}
                          reasons={sidSubscriptionInactiveReasons(
                            row.original,
                            hrMatches,
                          )}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <TablePagination table={table} showSizeSelector />
    </div>
  );
}
