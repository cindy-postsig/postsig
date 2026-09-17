'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  PieChart,
  Pie,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { handleDownload } from '@/app/lib/utils';
import {
  exportCapTableExcel,
  exportCapTableCSV,
} from '@/app/lib/actions/investor/export';
import { useCanExportCsv } from '@/hooks/useCanExportCsv';
import { useDateFormat } from '@/hooks/useDateFormat';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ColumnDef,
  ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { CapTableData, SecurityRow } from '../../types';
import { getSecurityColor } from '@/app/(app)/(investor)/investor/colors';
import _ from 'lodash';
import {
  buildPreferredStageRows,
  normalizeOurPreferredPct,
  percentOfTotal,
  snapshotsFromRestatementBoundary,
  type CapTableRow,
} from '@/app/(app)/(investor)/investor/cap-table-utils';
import { formatNumber, formatPercent } from './companyDetailsFormat';
import { TabHeader, TabEmptyState } from './companyDetailsPrimitives';

function securitiesFromTableData(rows: CapTableRow[]): SecurityRow[] {
  const result: SecurityRow[] = [];
  for (const row of rows) {
    result.push({
      id: row.id,
      name: row.name,
      units: row.units,
      fdPercent: row.fdPercent,
      myUnits: row.myUnits,
      myFdPercent: row.myFdPercent,
    });
    if (row.subRows) {
      for (const sub of row.subRows) {
        result.push({
          id: sub.id,
          name: sub.name,
          parentId: row.id,
          units: sub.units,
          fdPercent: sub.fdPercent,
          myUnits: sub.myUnits,
          myFdPercent: sub.myFdPercent,
        });
      }
    }
  }
  return result;
}

const PORTFOLIO_IMPORT_TYPE = 'portfolio_import';

export function CapTableContent({
  capTable,
  companyName,
}: {
  capTable?: CapTableData;
  companyName: string;
}) {
  // Exclude portfolio_import snapshots from the capitalization view
  const filteredSnapshots = useMemo(
    () =>
      capTable?.snapshots.filter(
        (s) => s.snapshotTypeCode !== PORTFOLIO_IMPORT_TYPE,
      ) ?? [],
    [capTable],
  );
  const filteredDates = useMemo(
    () => filteredSnapshots.map((s) => s.asOfDate),
    [filteredSnapshots],
  );

  const { formatDate } = useDateFormat();
  const [selectedDate, setSelectedDate] = useState<string>('');

  useEffect(() => {
    setSelectedDate((prev) =>
      filteredDates.includes(prev) ? prev : (filteredDates[0] ?? ''),
    );
  }, [filteredDates]);
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const [isExporting, setIsExporting] = useState(false);
  const canExport = useCanExportCsv('investor');

  const currentSnapshot = useMemo(() => {
    if (!filteredSnapshots.length) return null;
    return (
      filteredSnapshots.find((s) => s.asOfDate === selectedDate) ||
      filteredSnapshots[0]
    );
  }, [filteredSnapshots, selectedDate]);

  const tableData = useMemo(() => {
    if (!currentSnapshot) return [];

    const result: CapTableRow[] = [];
    const makeLeafRow = (
      id: string,
      name: string,
      units: number,
      fdPercent: number,
      myUnits?: number,
      myFdPercent?: number,
    ): CapTableRow => ({
      id,
      isCategory: false,
      name,
      units,
      fdPercent,
      myUnits,
      myFdPercent,
    });

    // Returns undefined when no security has data, preserving genuine 0 totals
    const sumOptional = (
      securities: SecurityRow[],
      field: 'myUnits' | 'myFdPercent',
    ): number | undefined => {
      const hasData = securities.some((s) => s[field] != null);
      if (!hasData) return undefined;
      return securities.reduce((sum, s) => sum + (s[field] ?? 0), 0);
    };

    // Filter transactions by snapshot date for "My" calculations
    const txForDate = (capTable?.transactions ?? []).filter(
      (t) => t.transactionDate <= currentSnapshot.asOfDate,
    );

    // Snapshot-level columns are the source of truth for common totals
    if (currentSnapshot.commonOutstanding != null) {
      const commonUnits = currentSnapshot.commonOutstanding;
      const commonFdPercent = percentOfTotal(
        commonUnits,
        currentSnapshot.fullyDilutedTotal,
      );

      // Derive "My" from transactions when available, fall back to snapshot
      const commonTx = txForDate.filter((t) => t.securityType === 'common');
      const commonMyUnits =
        commonTx.length > 0
          ? commonTx.reduce((sum, t) => sum + t.signedUnits, 0)
          : (currentSnapshot.ourCommonShares ?? undefined);
      const commonMyFdPercent =
        commonMyUnits != null
          ? percentOfTotal(commonMyUnits, currentSnapshot.fullyDilutedTotal)
          : undefined;

      result.push({
        id: 'common',
        isCategory: true,
        name: 'Common Stock',
        units: commonUnits,
        fdPercent: commonFdPercent,
        myUnits: commonMyUnits,
        myFdPercent: commonMyFdPercent,
        subRows: [
          makeLeafRow(
            'common-sub',
            'Common',
            commonUnits,
            commonFdPercent,
            commonMyUnits,
            commonMyFdPercent,
          ),
        ],
      });
    }

    // Collect preferred securities from the snapshots up to the selected date,
    // starting at the restatement boundary so classes restated away by a
    // reclassification or split stop rendering.
    // Later snapshots override earlier ones (by name) so we get the latest values per class.
    // Also track each security's snapshot ourPreferredPct for "My" fallback.
    const preferredByName = new Map<string, SecurityRow>();
    const pctBySecurityName = new Map<string, number | null>();
    const snapshotsUpToDate = snapshotsFromRestatementBoundary(
      filteredSnapshots,
      currentSnapshot.asOfDate,
    );
    for (const snap of snapshotsUpToDate) {
      for (const sec of snap.securities.filter(
        (s) => s.securityType === 'preferred',
      )) {
        preferredByName.set(sec.name, sec);
        pctBySecurityName.set(sec.name, snap.ourPreferredPct);
      }
    }
    const preferredSecurities = Array.from(preferredByName.values()).reverse();

    if (
      currentSnapshot.preferredOutstanding != null ||
      preferredSecurities.length > 0
    ) {
      const preferredUnits = currentSnapshot.preferredOutstanding ?? 0;
      const preferredFdPercent = percentOfTotal(
        preferredUnits,
        currentSnapshot.fullyDilutedTotal,
      );

      // Build per-class subrows from cap_table_detail securities, or
      // fall back to per-stage rows derived from snapshot deltas
      let subRows: CapTableRow[];

      if (preferredSecurities.length > 0) {
        subRows = preferredSecurities.map((s) => {
          // Derive "My" from the snapshot's ourPreferredPct for this security
          const snapPct = normalizeOurPreferredPct(
            pctBySecurityName.get(s.name),
          );
          const myUnits = !_.isNil(snapPct)
            ? Math.round(s.units * snapPct)
            : undefined;
          const myFdPercent = !_.isNil(myUnits)
            ? percentOfTotal(myUnits, currentSnapshot.fullyDilutedTotal)
            : undefined;
          return makeLeafRow(
            `preferred-${s.id}`,
            s.name,
            s.units,
            s.fdPercent,
            myUnits,
            myFdPercent,
          );
        });
      } else {
        subRows = buildPreferredStageRows(
          snapshotsUpToDate,
          currentSnapshot.fullyDilutedTotal,
        );

        if (subRows.length === 0) {
          const fallbackPct = normalizeOurPreferredPct(
            currentSnapshot.ourPreferredPct,
          );
          const fallbackMyUnits =
            fallbackPct != null
              ? Math.round(preferredUnits * fallbackPct)
              : undefined;
          subRows = [
            makeLeafRow(
              'preferred-sub',
              currentSnapshot.stageName || 'Preferred Stock',
              preferredUnits,
              preferredFdPercent,
              fallbackMyUnits,
              fallbackMyUnits != null
                ? percentOfTotal(
                    fallbackMyUnits,
                    currentSnapshot.fullyDilutedTotal,
                  )
                : undefined,
            ),
          ];
        }
      }

      // Rollup "My" from sub-row totals
      const hasSubRowMyData = subRows.some((r) => !_.isNil(r.myUnits));
      const preferredMyUnits = hasSubRowMyData
        ? subRows.reduce(
            (sum, r) => (!_.isNil(r.myUnits) ? sum + r.myUnits : sum),
            0,
          )
        : undefined;
      const preferredMyFdPercent =
        preferredMyUnits != null
          ? percentOfTotal(preferredMyUnits, currentSnapshot.fullyDilutedTotal)
          : undefined;

      result.push({
        id: 'preferred',
        isCategory: true,
        name: 'Preferred Stock',
        units: preferredUnits,
        fdPercent: preferredFdPercent,
        myUnits: preferredMyUnits,
        myFdPercent: preferredMyFdPercent,
        subRows,
      });
    }

    // Find the most relevant equity plan snapshot for the selected date
    const relevantPlanSnapshot = (capTable?.equityPlanSnapshots ?? [])
      .filter((s) => s.effectiveDate <= currentSnapshot.asOfDate)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];

    const OPTION_WARRANT_TYPES = ['option', 'warrant'];
    const optionSecurities = currentSnapshot.securities.filter(
      (s) =>
        s.securityType != null && OPTION_WARRANT_TYPES.includes(s.securityType),
    );

    if (
      relevantPlanSnapshot ||
      optionSecurities.length > 0 ||
      currentSnapshot.optionPoolOutstanding != null
    ) {
      let optionUnits: number;
      let optionFdPercent: number;

      if (relevantPlanSnapshot) {
        optionUnits = relevantPlanSnapshot.issuedShares ?? 0;
        optionFdPercent = percentOfTotal(
          optionUnits,
          currentSnapshot.fullyDilutedTotal,
        );
      } else if (optionSecurities.length > 0) {
        optionUnits = optionSecurities.reduce((sum, s) => sum + s.units, 0);
        optionFdPercent = percentOfTotal(
          optionUnits,
          currentSnapshot.fullyDilutedTotal,
        );
      } else {
        optionUnits = currentSnapshot.optionPoolAuthorized ?? 0;
        optionFdPercent =
          currentSnapshot.optionPoolFdPercent ??
          percentOfTotal(optionUnits, currentSnapshot.fullyDilutedTotal);
      }

      // VCs don't hold employee options — "My" is always 0 when equity plan data exists
      const optionMyUnits = relevantPlanSnapshot
        ? 0
        : sumOptional(optionSecurities, 'myUnits');
      const optionMyFdPercent = relevantPlanSnapshot
        ? 0
        : sumOptional(optionSecurities, 'myFdPercent');

      result.push({
        id: 'options-warrants',
        isCategory: true,
        name: 'Options & Warrants',
        units: optionUnits,
        fdPercent: optionFdPercent,
        myUnits: optionMyUnits,
        myFdPercent: optionMyFdPercent,
        subRows: [
          makeLeafRow(
            'employee-options',
            'Employee Options',
            optionUnits,
            optionFdPercent,
            optionMyUnits,
            optionMyFdPercent,
          ),
        ],
      });
    }

    return result;
  }, [currentSnapshot, capTable, filteredSnapshots]);

  const pieData = useMemo(() => {
    return tableData
      .filter((row) => row.fdPercent > 0)
      .map((row) => ({
        name: row.name,
        value: row.fdPercent,
        fill: getSecurityColor(row.id),
      }));
  }, [tableData]);

  const totals = useMemo(() => {
    if (!tableData.length || !currentSnapshot)
      return { units: 0, fdPercent: 0, myUnits: 0, myFdPercent: 0 };

    const fdPercent = tableData.reduce((acc, row) => acc + row.fdPercent, 0);
    const hasMyData = tableData.some((row) => row.myUnits != null);
    const myUnits = hasMyData
      ? tableData.reduce((acc, row) => acc + (row.myUnits ?? 0), 0)
      : 0;
    const myFdPercent = hasMyData
      ? tableData.reduce((acc, row) => acc + (row.myFdPercent ?? 0), 0)
      : 0;

    return {
      units: currentSnapshot.fullyDilutedTotal ?? 0,
      fdPercent,
      myUnits,
      myFdPercent,
    };
  }, [tableData, currentSnapshot]);

  const columns = useMemo<ColumnDef<CapTableRow>[]>(
    () => [
      {
        id: 'expander',
        header: () => null,
        size: 32,
        cell: ({ row }) => {
          if (!row.original.isCategory || !row.original.subRows?.length)
            return null;
          return (
            <button
              onClick={(e) => {
                e.stopPropagation();
                row.toggleExpanded();
              }}
              className="p-1"
            >
              {row.getIsExpanded() ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          );
        },
      },
      {
        accessorKey: 'name',
        header: 'Security',
        cell: ({ row }) => {
          const isChild = !row.original.isCategory;
          return (
            <div className={`flex items-center gap-2 ${isChild ? 'pl-6' : ''}`}>
              {row.original.isCategory && (
                <div
                  className="h-3 w-3 rounded-sm"
                  style={{
                    backgroundColor: getSecurityColor(row.original.id),
                  }}
                />
              )}
              <span className={row.original.isCategory ? 'font-medium' : ''}>
                {row.original.name}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'units',
        header: 'Units',
        cell: ({ row }) => (
          <span className="font-sans-neue tabular-nums">
            {formatNumber(row.original.units)}
          </span>
        ),
        meta: { className: 'text-right w-32' },
      },
      {
        accessorKey: 'fdPercent',
        header: 'FD%',
        cell: ({ row }) => (
          <span className="font-sans-neue tabular-nums">
            {formatPercent(row.original.fdPercent)}
          </span>
        ),
        meta: { className: 'text-right w-24' },
      },
      {
        accessorKey: 'myUnits',
        header: 'My Units',
        cell: ({ row }) => (
          <span className="font-sans-neue tabular-nums text-primary">
            {formatNumber(row.original.myUnits)}
          </span>
        ),
        meta: { className: 'text-right w-32' },
      },
      {
        accessorKey: 'myFdPercent',
        header: 'My FD%',
        cell: ({ row }) => (
          <span className="font-sans-neue tabular-nums text-primary">
            {formatPercent(row.original.myFdPercent)}
          </span>
        ),
        meta: { className: 'text-right w-24' },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: tableData,
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  const handleExportExcel = async () => {
    if (!currentSnapshot) return;
    setIsExporting(true);
    try {
      const result = await exportCapTableExcel({
        companyName,
        asOfDate: selectedDate,
        securities: securitiesFromTableData(tableData),
        snapshotTotals: {
          totalUnits: currentSnapshot.fullyDilutedTotal,
          myUnits: currentSnapshot.ourTotalShares,
          myFdPercent: currentSnapshot.ourFdOwnershipPercent,
        },
      });
      const blob = new Blob([new Uint8Array(result)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      await handleDownload(
        blob,
        `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Cap_Table_${selectedDate}.xlsx`,
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = async () => {
    if (!currentSnapshot) return;
    setIsExporting(true);
    try {
      const csvContent = await exportCapTableCSV({
        companyName,
        asOfDate: selectedDate,
        securities: securitiesFromTableData(tableData),
        snapshotTotals: {
          totalUnits: currentSnapshot.fullyDilutedTotal,
          myUnits: currentSnapshot.ourTotalShares,
          myFdPercent: currentSnapshot.ourFdOwnershipPercent,
        },
      });
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      await handleDownload(
        blob,
        `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Cap_Table_${selectedDate}.csv`,
      );
    } finally {
      setIsExporting(false);
    }
  };

  if (!capTable || filteredSnapshots.length === 0) {
    return (
      <TabEmptyState title="Capitalization">
        No cap table data available for this company.
      </TabEmptyState>
    );
  }

  return (
    <div className="space-y-12 pb-12">
      <TabHeader
        title="Capitalization"
        action={
          <>
            <div className="flex items-center gap-2">
              <span className="font-label text-xs uppercase tracking-wider text-foreground/60">
                As Of
              </span>
              <Select value={selectedDate} onValueChange={setSelectedDate}>
                <SelectTrigger className="h-8 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {filteredDates.map((date) => (
                    <SelectItem key={date} value={date}>
                      {formatDate(date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canExport && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isExporting}>
                    Export <ChevronDown className="h-2 w-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportExcel}>
                    Export to Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportCSV}>
                    Export to CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      {/* Donut Pie Chart */}
      {pieData.length > 0 && (
        <div className="flex items-center gap-8">
          <div className="h-[180px] w-[180px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  strokeWidth={2}
                  stroke="hsl(var(--background))"
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0];
                    return (
                      <div className="rounded-lg border bg-background px-3 py-2 shadow-lg">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{
                              backgroundColor: item.payload.fill as string,
                            }}
                          />
                          <span className="text-sm">{item.name}</span>
                        </div>
                        <div className="mt-1 font-sans-neue text-sm tabular-nums text-muted-foreground">
                          {(item.value as number).toFixed(1)}%
                        </div>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-2">
            {pieData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: entry.fill }}
                />
                <span className="text-sm text-muted-foreground">
                  {entry.name}
                </span>
                <span className="font-sans-neue text-sm tabular-nums">
                  {entry.value.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hierarchical Table */}
      <div className="overflow-hidden rounded border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as
                    | { className?: string }
                    | undefined;
                  return (
                    <TableHead
                      key={header.id}
                      className={
                        header.id === 'expander'
                          ? 'w-10 py-0 pl-3 pr-0'
                          : meta?.className || ''
                      }
                    >
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
            {table.getRowModel().rows?.length ? (
              <>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={`
                      ${row.original.isCategory ? 'font-medium bg-card hover:bg-muted/20' : 'bg-background hover:bg-muted/20'}
                      cursor-pointer
                    `}
                    onClick={() => {
                      if (
                        row.original.isCategory &&
                        row.original.subRows?.length
                      ) {
                        row.toggleExpanded();
                      }
                    }}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as
                        | { className?: string }
                        | undefined;
                      const isSubrow = !row.original.isCategory;
                      return (
                        <TableCell
                          key={cell.id}
                          className={`
                            ${cell.column.id === 'expander' ? 'w-10 py-0 pl-3 pr-0' : meta?.className || ''}
                            ${isSubrow ? 'py-2' : ''}
                          `}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                {/* Totals Row */}
                <TableRow className="font-bold border-t-2 border-foreground/20 bg-muted/30">
                  <TableCell className="w-10 py-0 pl-3 pr-0" />
                  <TableCell>Total</TableCell>
                  <TableCell className="w-32 text-right">
                    <span className="font-sans-neue tabular-nums">
                      {formatNumber(totals.units)}
                    </span>
                  </TableCell>
                  <TableCell className="w-24 text-right">
                    <span className="font-sans-neue tabular-nums">
                      {formatPercent(totals.fdPercent)}
                    </span>
                  </TableCell>
                  <TableCell className="w-32 text-right">
                    <span className="font-sans-neue tabular-nums text-primary">
                      {formatNumber(totals.myUnits)}
                    </span>
                  </TableCell>
                  <TableCell className="w-24 text-right">
                    <span className="font-sans-neue tabular-nums text-primary">
                      {formatPercent(totals.myFdPercent)}
                    </span>
                  </TableCell>
                </TableRow>
              </>
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No cap table data found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
