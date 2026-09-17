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
import { Metric, MetricStrip } from '@/components/bloomberg-sid/MetricStrip';
import { SearchInput } from '@/components/bloomberg-sid/SearchInput';
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
  buildPermissionRows,
  cancelByDate,
  matchesSearch,
  sidSubscriptionInactiveReasons,
  type SidAllocation,
  type SidPermissionRow,
} from '@/lib/v2/bloomberg-sid/transforms';
import { seatStatusLabel } from '@/lib/v2/seats/status';
import { cn } from '@/lib/utils';

const DEFAULT_FILTERS = {
  search: '',
  custNum: 'All',
  entityName: 'All',
  product: 'All',
};

function buildColumns(
  hrMatches: Record<string, SidHrMatch>,
  expanded: SidKey | null,
  onToggle: (key: SidKey) => void,
): ColumnDef<SidPermissionRow>[] {
  return [
    {
      id: 'expander',
      header: () => null,
      meta: { className: 'w-8 px-2' },
      cell: ({ row }) => {
        const key = sidKey(row.original.sub.sid, row.original.sub.sidInstNum);
        const open = expanded === key;
        return (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} details for SID ${row.original.sub.sid}`}
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
      id: 'custNum',
      accessorFn: (row) => row.sub.custNum,
      header: ({ column }) => <ColumnHeader column={column} title="Cust Num" />,
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.sub.custNum}</span>
      ),
    },
    {
      id: 'sid',
      accessorFn: (row) => row.sub.sid,
      header: ({ column }) => <ColumnHeader column={column} title="SID" />,
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.sub.sid}</span>
      ),
    },
    {
      accessorKey: 'entityName',
      header: ({ column }) => <ColumnHeader column={column} title="Entity" />,
    },
    {
      id: 'lastUser',
      accessorFn: (row) => row.sub.lastUser,
      header: ({ column }) => (
        <ColumnHeader column={column} title="Last User" />
      ),
      cell: ({ row }) => row.original.sub.lastUser,
    },
    {
      id: 'status',
      accessorFn: (row) =>
        seatStatusLabel(sidSubscriptionInactiveReasons(row.sub, hrMatches)),
      header: ({ column }) => <ColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <SeatStatusBadge
          reasons={sidSubscriptionInactiveReasons(row.original.sub, hrMatches)}
        />
      ),
      sortingFn: 'alphanumeric',
    },
    {
      id: 'product',
      accessorFn: (row) => row.sub.gpttDescription,
      header: ({ column }) => (
        <ColumnHeader column={column} title="Terminal Product" />
      ),
      cell: ({ row }) => row.original.sub.gpttDescription,
    },
    {
      id: 'contractDate',
      accessorFn: (row) => row.sub.contractDate,
      header: ({ column }) => (
        <ColumnHeader column={column} title="Contract Date" />
      ),
      cell: ({ row }) => <DateCell value={row.original.sub.contractDate} />,
      sortingFn: 'alphanumeric',
    },
    {
      id: 'cancelBy',
      accessorFn: (row) => cancelByDate(row.sub.renewalDate).getTime(),
      header: ({ column }) => (
        <ColumnHeader column={column} title="Cancel By" />
      ),
      cell: ({ row }) => (
        <CancelByCell renewalDate={row.original.sub.renewalDate} />
      ),
    },
    {
      id: 'renewalDate',
      accessorFn: (row) => row.sub.renewalDate,
      header: ({ column }) => (
        <ColumnHeader column={column} title="Renewal Date" />
      ),
      cell: ({ row }) => <DateCell value={row.original.sub.renewalDate} />,
      sortingFn: 'alphanumeric',
    },
    {
      id: 'exchanges',
      accessorFn: (row) => row.allocs.length,
      header: ({ column }) => (
        <ColumnHeader column={column} title="Exchanges" align="right" />
      ),
      cell: ({ row }) => (
        <span className="font-mono">{row.original.allocs.length}</span>
      ),
      meta: { className: 'text-right' },
    },
    {
      id: 'terminalCost',
      accessorFn: (row) => row.sub.price,
      header: ({ column }) => (
        <ColumnHeader column={column} title="Terminal Cost" align="right" />
      ),
      cell: ({ row }) => (
        <span className="font-mono">{usd(row.original.sub.price)}</span>
      ),
      meta: { className: 'text-right' },
    },
    {
      id: 'exchangeCost',
      accessorFn: (row) => row.exchangeCost,
      header: ({ column }) => (
        <ColumnHeader column={column} title="Exchange Cost" align="right" />
      ),
      cell: ({ row }) => (
        <span className="font-mono">
          {usd(row.original.exchangeCost)}
          {row.original.masked && (
            <span className="ml-1 text-amber-700">*</span>
          )}
        </span>
      ),
      meta: { className: 'text-right' },
    },
    {
      id: 'totalCost',
      accessorFn: (row) => row.totalCost,
      header: ({ column }) => (
        <ColumnHeader column={column} title="Actual Cost" align="right" />
      ),
      cell: ({ row }) => (
        <span className="font-semibold font-mono">
          {usd(row.original.totalCost)}
        </span>
      ),
      meta: { className: 'text-right' },
    },
  ];
}

// Terminal and exchange rows carry different dates: the seat's contract,
// cancel-by and renewal dates from the -2 file, and the month an exchange fee
// was billed from the -4 file. Each shows its own and leaves the rest blank
// rather than sharing "effective" columns that meant two different things.
function PermissionDetail({ row }: { row: SidPermissionRow }) {
  const blank = (
    <TableCell className="px-2 py-1 text-muted-foreground">—</TableCell>
  );

  return (
    <>
      <h4 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
        Permissions for SID {row.sub.sid} / {row.sub.sidInstNum} — SN/UUID{' '}
        {row.sub.serialNumber}
      </h4>
      <Table className="text-xs">
        <TableHeader className={TABLE_HEADER_CLASS}>
          <TableRow>
            <TableHead className="px-2 py-1">Type</TableHead>
            <TableHead className="px-2 py-1">Code</TableHead>
            <TableHead className="px-2 py-1">Subscription</TableHead>
            <TableHead className="px-2 py-1">RPT Month</TableHead>
            <TableHead className="px-2 py-1">Contract Date</TableHead>
            <TableHead className="px-2 py-1">Cancel By</TableHead>
            <TableHead className="px-2 py-1">Renewal Date</TableHead>
            <TableHead className="px-2 py-1 text-right">Actual Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="px-2 py-1">Terminal</TableCell>
            <TableCell className="px-2 py-1 font-mono">
              {row.sub.gptt}
            </TableCell>
            <TableCell className="px-2 py-1">
              {row.sub.gpttDescription}
            </TableCell>
            {blank}
            <TableCell className="px-2 py-1">
              <DateCell value={row.sub.contractDate} />
            </TableCell>
            <TableCell className="px-2 py-1">
              <CancelByCell renewalDate={row.sub.renewalDate} />
            </TableCell>
            <TableCell className="px-2 py-1">
              <DateCell value={row.sub.renewalDate} />
            </TableCell>
            <TableCell className="px-2 py-1 text-right font-mono">
              {usd(row.sub.price)}
            </TableCell>
          </TableRow>
          {row.allocs.map((alloc) => (
            <TableRow key={`${alloc.feeId}:${alloc.exchangeCode}`}>
              <TableCell className="px-2 py-1">Exchange</TableCell>
              <TableCell className="px-2 py-1 font-mono">
                {alloc.exchangeCode}
              </TableCell>
              <TableCell className="px-2 py-1">{alloc.exchangeName}</TableCell>
              <TableCell className="px-2 py-1">
                <DateCell value={alloc.rptMonth} />
              </TableCell>
              {blank}
              {blank}
              {blank}
              <TableCell className="px-2 py-1 text-right font-mono">
                {alloc.priceMasked || alloc.proRate == null ? (
                  <span className="text-amber-700">***</span>
                ) : (
                  usd(alloc.proRate)
                )}
              </TableCell>
            </TableRow>
          ))}
          {row.allocs.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={8}
                className="px-2 py-1 text-muted-foreground"
              >
                No exchange permissions for this SID.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </>
  );
}

export function AssignmentsTab({
  subscriptions,
  accounts,
  accountsByCustNum,
  allocationsBySid,
  hrMatches,
}: {
  subscriptions: SidSubscription[];
  accounts: SidAccount[];
  accountsByCustNum: Map<number, SidAccount>;
  allocationsBySid: Map<SidKey, SidAllocation[]>;
  hrMatches: Record<string, SidHrMatch>;
}) {
  const [expanded, setExpanded] = useState<SidKey | null>(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

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

  const rows = useMemo(() => {
    const matching = subscriptions.filter((sub) => {
      const entityName = accountsByCustNum.get(sub.custNum)?.name ?? '';
      if (!matchesSearch(filters.search, [sub.sid, sub.lastUser])) return false;
      if (filters.custNum !== 'All' && String(sub.custNum) !== filters.custNum)
        return false;
      if (filters.entityName !== 'All' && entityName !== filters.entityName)
        return false;
      if (filters.product !== 'All' && sub.gpttDescription !== filters.product)
        return false;
      return true;
    });
    return buildPermissionRows(matching, accountsByCustNum, allocationsBySid);
  }, [subscriptions, accountsByCustNum, allocationsBySid, filters]);

  const totals = useMemo(
    () => ({
      sids: rows.length,
      permissions: rows.reduce((sum, row) => sum + row.allocs.length + 1, 0),
      cost: rows.reduce((sum, row) => sum + row.totalCost, 0),
    }),
    [rows],
  );

  const columns = useMemo(
    () =>
      buildColumns(hrMatches, expanded, (key) => {
        setExpanded((current) => (current === key ? null : key));
      }),
    [hrMatches, expanded],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => sidKey(row.sub.sid, row.sub.sidInstNum),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      sorting: [{ id: 'totalCost', desc: true }],
      pagination: { pageSize: 25 },
    },
  });

  return (
    <div>
      <MetricStrip className="mb-6 grid grid-cols-3 gap-10">
        <Metric
          label="SIDs permissioned"
          value={totals.sids.toLocaleString()}
          note="one per terminal subscription"
        />
        <div className="border-l border-border pl-10">
          <Metric
            label="Total permissions"
            value={totals.permissions.toLocaleString()}
            note="terminal + exchange entitlements"
          />
        </div>
        <div className="border-l border-border pl-10">
          <Metric
            label="Actual cost"
            value={usd(totals.cost)}
            note="terminal price + pro-rated exchange"
          />
        </div>
      </MetricStrip>

      <h3 className="mb-6">Assignments</h3>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <SearchInput
          value={filters.search}
          placeholder="SID or last user"
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
          label="Entity"
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
        <ClearFiltersButton
          active={hasActiveFilters(filters, DEFAULT_FILTERS)}
          onClick={() => {
            setFilters(DEFAULT_FILTERS);
          }}
        />
        <span className="ml-auto self-center text-xs text-muted-foreground">
          {rows.length} of {subscriptions.length} SIDs
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
              const key = sidKey(
                row.original.sub.sid,
                row.original.sub.sidInstNum,
              );
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
                        <PermissionDetail row={row.original} />
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
