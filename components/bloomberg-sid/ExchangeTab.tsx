'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Table as TanstackTable,
} from '@tanstack/react-table';
import {
  TABLE_HEADER_CLASS,
  ClearFiltersButton,
  hasActiveFilters,
  PriceCell,
  usd,
} from '@/components/bloomberg-sid/bits';
import { FilterSelect } from '@/components/bloomberg-sid/FilterSelect';
import { SearchInput } from '@/components/bloomberg-sid/SearchInput';
import { ColumnHeader } from '@/components/contracts/ColumnHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TablePagination } from '@/components/ui/data-table/components/TablePagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useDateFormat } from '@/hooks/useDateFormat';
import {
  sidKey,
  type SidAccount,
  type SidSubscription,
} from '@/lib/v2/bloomberg-sid/report';
import {
  currencyLabel,
  matchesSearch,
  topExchangesByCount,
  topExchangesByKnownCost,
  type SidAggregate,
  type SidAllocation,
} from '@/lib/v2/bloomberg-sid/transforms';
import { cn } from '@/lib/utils';

export type ExchangeView = 'Aggregate' | 'SID Allocation';

const DEFAULT_FILTERS = {
  search: '',
  custNum: 'All',
  entityName: 'All',
  exchangeCode: 'All',
};

const EXCHANGE_VIEWS: ExchangeView[] = ['Aggregate', 'SID Allocation'];

function MonthCell({ value }: { value: string }) {
  const { formatDate } = useDateFormat();
  return <span className="text-xs">{formatDate(value)}</span>;
}

// A $0 row is still Bloomberg's to bill; only a masked price means the
// exchange bills the client directly.
function PriceStatusBadge({ masked }: { masked: boolean }) {
  if (masked) {
    return (
      <Badge variant="notice" size="sm">
        Direct bill to vendor
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" size="sm">
      Direct to BBG
    </Badge>
  );
}

const AGGREGATE_COLUMNS: ColumnDef<SidAggregate>[] = [
  {
    accessorKey: 'custNum',
    header: ({ column }) => <ColumnHeader column={column} title="Cust Num" />,
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.custNum}</span>
    ),
  },
  {
    accessorKey: 'rptMonth',
    header: ({ column }) => <ColumnHeader column={column} title="RPT Month" />,
    cell: ({ row }) => <MonthCell value={row.original.rptMonth} />,
  },
  {
    accessorKey: 'exchangeCode',
    header: ({ column }) => <ColumnHeader column={column} title="Exchange" />,
    cell: ({ row }) => (
      <span className="font-mono">{row.original.exchangeCode}</span>
    ),
  },
  {
    accessorKey: 'exchangeName',
    header: ({ column }) => <ColumnHeader column={column} title="Name" />,
  },
  {
    accessorKey: 'subscriptions',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Subs" align="right" />
    ),
    meta: { className: 'text-right' },
  },
  {
    id: 'currency',
    accessorFn: (row) => currencyLabel(row.currencyCode),
    header: ({ column }) => <ColumnHeader column={column} title="Currency" />,
    cell: ({ row }) => currencyLabel(row.original.currencyCode),
  },
  {
    accessorKey: 'totalPrice',
    header: ({ column }) => (
      <ColumnHeader column={column} title="Total Price" align="right" />
    ),
    cell: ({ row }) => (
      <PriceCell
        amount={row.original.totalPrice}
        masked={row.original.priceMasked}
      />
    ),
    meta: { className: 'text-right' },
  },
  {
    id: 'priceStatus',
    accessorFn: (row) => row.priceMasked,
    header: ({ column }) => (
      <ColumnHeader column={column} title="Price Status" />
    ),
    cell: ({ row }) => <PriceStatusBadge masked={row.original.priceMasked} />,
  },
];

function buildAllocationColumns(
  serialNumberBySid: Map<string, string>,
): ColumnDef<SidAllocation>[] {
  return [
    {
      accessorKey: 'custNum',
      header: ({ column }) => <ColumnHeader column={column} title="Cust Num" />,
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.custNum}</span>
      ),
    },
    {
      accessorKey: 'rptMonth',
      header: ({ column }) => (
        <ColumnHeader column={column} title="RPT Month" />
      ),
      cell: ({ row }) => <MonthCell value={row.original.rptMonth} />,
    },
    {
      accessorKey: 'exchangeCode',
      header: ({ column }) => <ColumnHeader column={column} title="Exchange" />,
      cell: ({ row }) => (
        <span className="font-mono">{row.original.exchangeCode}</span>
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
      id: 'uuid',
      accessorFn: (row) =>
        serialNumberBySid.get(sidKey(row.sid, row.sidInstNum)),
      header: ({ column }) => <ColumnHeader column={column} title="SN/UUID" />,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {serialNumberBySid.get(
            sidKey(row.original.sid, row.original.sidInstNum),
          ) ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'sidInstNum',
      header: ({ column }) => <ColumnHeader column={column} title="Inst" />,
    },
    {
      accessorKey: 'proRate',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Pro Rate" align="right" />
      ),
      cell: ({ row }) => (
        <PriceCell
          amount={row.original.proRate}
          masked={row.original.priceMasked}
        />
      ),
      meta: { className: 'text-right' },
    },
    {
      id: 'priceStatus',
      accessorFn: (row) => row.priceMasked,
      header: ({ column }) => (
        <ColumnHeader column={column} title="Price Status" />
      ),
      cell: ({ row }) => <PriceStatusBadge masked={row.original.priceMasked} />,
    },
  ];
}

function ExchangeRows<TData>({ table }: { table: TanstackTable<TData> }) {
  return (
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
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
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
  );
}

export function ExchangeTab({
  aggregates,
  allocations,
  accounts,
  accountsByCustNum,
  subscriptions,
  view,
  onSetView,
}: {
  aggregates: SidAggregate[];
  allocations: SidAllocation[];
  accounts: SidAccount[];
  accountsByCustNum: Map<number, SidAccount>;
  subscriptions: SidSubscription[];
  view: ExchangeView;
  onSetView: (view: ExchangeView) => void;
}) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const topByCost = useMemo(
    () => topExchangesByKnownCost(aggregates),
    [aggregates],
  );
  const topByCount = useMemo(
    () => topExchangesByCount(aggregates),
    [aggregates],
  );

  const serialNumberBySid = useMemo(
    () =>
      new Map(
        subscriptions.map((sub) => [
          sidKey(sub.sid, sub.sidInstNum),
          sub.serialNumber,
        ]),
      ),
    [subscriptions],
  );

  const custNumOptions = useMemo(
    () => [
      'All',
      ...Array.from(new Set(accounts.map((account) => account.custNum)))
        .sort((a, b) => a - b)
        .map(String),
    ],
    [accounts],
  );
  const entityNameOptions = useMemo(
    () => [
      'All',
      ...Array.from(new Set(accounts.map((account) => account.name))).sort(),
    ],
    [accounts],
  );
  const exchangeCodeOptions = useMemo(
    () => [
      'All',
      ...Array.from(
        new Set(aggregates.map((aggregate) => aggregate.exchangeCode)),
      ).sort(),
    ],
    [aggregates],
  );

  const matchesFilters = useCallback(
    (custNum: number, exchangeCode: string) => {
      const entityName = accountsByCustNum.get(custNum)?.name ?? '';
      if (filters.custNum !== 'All' && String(custNum) !== filters.custNum)
        return false;
      if (filters.entityName !== 'All' && entityName !== filters.entityName)
        return false;
      if (
        filters.exchangeCode !== 'All' &&
        exchangeCode !== filters.exchangeCode
      )
        return false;
      return true;
    },
    [accountsByCustNum, filters],
  );

  const filteredAggRows = useMemo(
    () =>
      aggregates
        .filter(
          (row) =>
            matchesFilters(row.custNum, row.exchangeCode) &&
            matchesSearch(filters.search, [row.exchangeCode, row.exchangeName]),
        )
        .sort((a, b) => a.exchangeCode.localeCompare(b.exchangeCode)),
    [aggregates, matchesFilters, filters.search],
  );

  const filteredAllocRows = useMemo(
    () =>
      allocations.filter(
        (row) =>
          matchesFilters(row.custNum, row.exchangeCode) &&
          matchesSearch(filters.search, [
            row.sid,
            serialNumberBySid.get(sidKey(row.sid, row.sidInstNum)),
            row.exchangeCode,
            row.exchangeName,
          ]),
      ),
    [allocations, matchesFilters, filters.search, serialNumberBySid],
  );

  const allocationColumns = useMemo(
    () => buildAllocationColumns(serialNumberBySid),
    [serialNumberBySid],
  );

  const aggregateTable = useReactTable({
    data: filteredAggRows,
    columns: AGGREGATE_COLUMNS,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const allocationTable = useReactTable({
    data: filteredAllocRows,
    columns: allocationColumns,
    getRowId: (row) =>
      `${row.feeId}:${row.sid}:${row.sidInstNum}:${row.eidNumber}`,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Top latest-month exchanges by DIRECT cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {topByCost.map((exchange) => (
                <div
                  key={exchange.code}
                  className="flex justify-between text-xs"
                >
                  <span>
                    <span className="font-mono">{exchange.code}</span> —{' '}
                    {exchange.name}
                  </span>
                  <span className="font-mono">{usd(exchange.price)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Top latest-month exchanges by SUBSCRIPTION count
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {topByCount.map((exchange) => (
                <div
                  key={exchange.code}
                  className="flex justify-between text-xs"
                >
                  <span>
                    <span className="font-mono">{exchange.code}</span> —{' '}
                    {exchange.name}
                  </span>
                  <span>
                    {exchange.subs} subs ·{' '}
                    {exchange.masked ? (
                      <span className="text-amber-700">
                        direct bill to vendor
                      </span>
                    ) : (
                      <span className="text-emerald-700">direct to BBG</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <h3 className="pt-4">Exchange Entitlements</h3>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <ToggleGroup
            type="single"
            variant="segmented"
            size="xs"
            aria-label="Exchange view"
            value={view}
            onValueChange={(next) => {
              if (next) onSetView(next as ExchangeView);
            }}
          >
            {EXCHANGE_VIEWS.map((option) => (
              <ToggleGroupItem
                key={option}
                value={option}
                className="whitespace-nowrap"
              >
                {option}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <SearchInput
            value={filters.search}
            placeholder="SID, SN/UUID or exchange"
            onChange={(search) => {
              setFilters((current) => ({ ...current, search }));
            }}
          />
          <FilterSelect
            label="Cust Num"
            value={filters.custNum}
            options={custNumOptions}
            onChange={(custNum) => {
              setFilters((current) => ({ ...current, custNum }));
            }}
          />
          <FilterSelect
            label="Entity Name"
            value={filters.entityName}
            options={entityNameOptions}
            className="min-w-[180px]"
            onChange={(entityName) => {
              setFilters((current) => ({ ...current, entityName }));
            }}
          />
          <FilterSelect
            label="Exchange Code"
            value={filters.exchangeCode}
            options={exchangeCodeOptions}
            onChange={(exchangeCode) => {
              setFilters((current) => ({ ...current, exchangeCode }));
            }}
          />
          <ClearFiltersButton
            active={hasActiveFilters(filters, DEFAULT_FILTERS)}
            onClick={() => {
              setFilters(DEFAULT_FILTERS);
            }}
          />
        </div>
        <span className="self-center text-xs text-muted-foreground">
          {view === 'Aggregate'
            ? `${filteredAggRows.length} of ${aggregates.length} aggregate rows`
            : `${filteredAllocRows.length} of ${allocations.length} allocation rows`}
        </span>
      </div>

      {view === 'Aggregate' ? (
        <div>
          <Card>
            <ExchangeRows table={aggregateTable} />
          </Card>
          <TablePagination table={aggregateTable} showSizeSelector />
        </div>
      ) : (
        <div>
          <Card>
            <ExchangeRows table={allocationTable} />
          </Card>
          <TablePagination table={allocationTable} showSizeSelector />
        </div>
      )}
    </div>
  );
}
