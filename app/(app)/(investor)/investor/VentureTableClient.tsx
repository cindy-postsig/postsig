'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryStates, parseAsString, parseAsInteger } from 'nuqs';
import {
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  useReactTable,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TablePagination } from '@/components/ui/data-table/components/TablePagination';
import { Search, Settings2 } from 'lucide-react';
import { createColumns, TRIAL_COLUMN_IDS } from './columns';
import type { PortfolioCompany } from '@/app/(app)/(investor)/investor/types';
import type {
  RangeFilter,
  FilterValue,
} from '@/components/ui/data-table/components/FilterableColumnHeader';
import { useMode } from '@/contexts/ModeContext';
import { exportPortfolioCSV } from '@/app/lib/actions/investor/export';
import { useCanExportCsv } from '@/hooks/useCanExportCsv';
import { handleDownload } from '@/app/lib/utils';
import logger from '@/utils/pino';

export interface VentureTableClientProps {
  initialData: PortfolioCompany[];
  defaultSortColumn?: string;
  defaultSortDirection?: 'asc' | 'desc';
  isInvestorTrial?: boolean;
}

const COLUMN_LABELS: Record<string, string> = {
  company: 'Company',
  stage: 'Stage',
  stageAtEntry: 'Stage at Entry',
  investmentStatus: 'Status',
  dataCoverage: 'Data Coverage',
  myTotalFMV: 'My FMV',
  postMoneyValuation: 'Post-Money',
  tags: 'Tags',
  fund: 'Fund',
  industry: 'Industry',
  myAggregateCost: 'Aggregate Cost',
  multiple: 'MOIC',
  myFullyDilutedPercent: 'My FD%',
  totalEquityFinancing: 'Total Financing',
  lastTransactionDate: 'Last Transaction',
  foundedYear: 'Founded',
  headquarters: 'HQ',
};

const DEFAULT_HIDDEN_COLUMNS: Record<string, boolean> = {
  fund: true,
  industry: true,
  totalEquityFinancing: true,
  lastTransactionDate: true,
  foundedYear: true,
  headquarters: true,
};

const SESSION_STORAGE_KEY = 'investor-table-filters';

export function VentureTableClient({
  initialData,
  defaultSortColumn = 'company',
  defaultSortDirection = 'asc',
  isInvestorTrial = false,
}: VentureTableClientProps) {
  const router = useRouter();
  const { selectedFunds } = useMode();

  const [urlState, setUrlState] = useQueryStates(
    {
      sort: parseAsString.withDefault(defaultSortColumn),
      order: parseAsString.withDefault(defaultSortDirection),
      page: parseAsInteger.withDefault(1),
    },
    { shallow: true },
  );

  const filteredByFund = useMemo(() => {
    if (selectedFunds.includes('all') || selectedFunds.length === 0) {
      return initialData;
    }

    const numericFundIds = selectedFunds.filter(
      (id): id is number => typeof id === 'number',
    );

    return initialData.filter((company) => {
      const companyFunds = company.funds || [];
      return companyFunds.some((f) => numericFundIds.includes(f.id));
    });
  }, [initialData, selectedFunds]);

  // Persists across navigations (nav link clears URL params, so sessionStorage is used instead)
  const [filtersParam, setFiltersParam] = useState<Record<
    string,
    FilterValue
  > | null>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.filters && Object.keys(parsed.filters).length > 0) {
          return parsed.filters;
        }
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  });

  const setColumnFilter = (columnId: string, values: FilterValue) => {
    setFiltersParam((prev) => {
      const next = { ...(prev || {}) };
      const isEmpty = Array.isArray(values)
        ? values.length === 0
        : values.min === undefined && values.max === undefined;

      if (isEmpty) {
        delete next[columnId];
      } else {
        next[columnId] = values;
      }
      return Object.keys(next).length ? next : null;
    });
  };

  const sorting = useMemo<SortingState>(() => {
    return [{ id: urlState.sort, desc: urlState.order === 'desc' }];
  }, [urlState.sort, urlState.order]);

  const pagination = useMemo(() => {
    return {
      pageIndex: Math.max(0, urlState.page - 1),
      pageSize: 50,
    };
  }, [urlState.page]);

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    () => {
      const hidden: VisibilityState = {};
      Object.keys(DEFAULT_HIDDEN_COLUMNS).forEach((key) => {
        hidden[key] = false; // false = hidden in tanstack table's VisibilityState
      });
      return hidden;
    },
  );
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.globalFilter) return parsed.globalFilter;
      }
    } catch {
      // Ignore parse errors
    }
    return '';
  });
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  useEffect(() => {
    const hasFilters =
      Object.keys(filtersParam || {}).length > 0 || globalFilter.length > 0;

    if (hasFilters) {
      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ filters: filtersParam, globalFilter }),
      );
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, [filtersParam, globalFilter]);

  const [isExporting, setIsExporting] = useState(false);
  const canExportPortfolio = useCanExportCsv('investor');

  const handleSortingChange = React.useCallback(
    (updaterOrValue: SortingState | ((old: SortingState) => SortingState)) => {
      const newSorting =
        typeof updaterOrValue === 'function'
          ? updaterOrValue(sorting)
          : updaterOrValue;

      if (newSorting.length > 0) {
        const sortColumn = newSorting[0];
        const sortBy = sortColumn.id;
        const sortOrder = sortColumn.desc ? 'desc' : 'asc';

        // null removes default values from the URL (nuqs convention)
        setUrlState({
          sort: sortBy === defaultSortColumn ? null : sortBy,
          order: sortOrder === defaultSortDirection ? null : sortOrder,
          page: null,
        });
      } else {
        setUrlState({ sort: null, order: null, page: null });
      }
    },
    [sorting, setUrlState, defaultSortColumn, defaultSortDirection],
  );

  const handleClearAllFilters = () => {
    setFiltersParam(null);
    setGlobalFilter('');
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  };

  const hasActiveFilters = useMemo(() => {
    const hasColumnFilters =
      filtersParam && Object.keys(filtersParam).length > 0;
    return hasColumnFilters || globalFilter.length > 0;
  }, [filtersParam, globalFilter]);

  const handleRowClick = (company: PortfolioCompany) => {
    // Don't navigate to company page in trial mode
    if (isInvestorTrial) return;
    router.push(`/investor/company/${company.id}`);
  };

  const customGlobalFilter = (
    row: { original: PortfolioCompany },
    _columnId: string,
    value: string,
  ) => {
    const search = value.toLowerCase();
    const rowData = row.original;

    if (rowData.name?.toLowerCase().includes(search)) return true;

    return false;
  };

  const columns = useMemo(() => {
    const allColumns = createColumns(isInvestorTrial);
    if (!isInvestorTrial) {
      return allColumns;
    }
    return TRIAL_COLUMN_IDS.map((id) =>
      allColumns.find(
        (col) =>
          col.id === id || ('accessorKey' in col && col.accessorKey === id),
      ),
    ).filter(Boolean) as typeof allColumns;
  }, [isInvestorTrial]);

  const table = useReactTable({
    data: filteredByFund,
    columns,
    onSortingChange: handleSortingChange,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: customGlobalFilter,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
      pagination,
    },
    meta: {
      filters: filtersParam || {},
      onFilterChange: setColumnFilter,
    },
  });

  useEffect(() => {
    table.getAllColumns().forEach((col) => col.setFilterValue(undefined));
    Object.entries(filtersParam || {}).forEach(([columnId, values]) => {
      table.getColumn(columnId)?.setFilterValue(values);
    });
  }, [table, filtersParam]);

  const handlePageChange = (pageIndex: number) => {
    setUrlState({ page: pageIndex === 0 ? null : pageIndex + 1 });
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const filteredRows = table
        .getSortedRowModel()
        .rows.map((row) => row.original);
      const csvContent = await exportPortfolioCSV(filteredRows);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      await handleDownload(blob, 'portfolio-companies.csv');
    } catch (error) {
      logger.error({ error }, 'Portfolio CSV export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search"
                value={globalFilter}
                onChange={(event) => setGlobalFilter(event.target.value)}
                className="h-8 w-[220px] pl-8 text-sm"
              />
            </div>

            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAllFilters}
                className="h-8"
              >
                Reset
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="pr-2 text-xs text-muted-foreground">
              {table.getFilteredRowModel().rows.length} companies
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <Settings2 className="h-4 w-4" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {table
                  .getAllColumns()
                  .filter(
                    (column) => column.getCanHide() && column.id !== 'company',
                  )
                  .map((column) => {
                    const label =
                      COLUMN_LABELS[column.id] ||
                      column.id.charAt(0).toUpperCase() + column.id.slice(1);
                    return (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) =>
                          column.toggleVisibility(!!value)
                        }
                        onSelect={(e) => e.preventDefault()}
                      >
                        {label}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                <DropdownMenuSeparator />
                <Button
                  variant="ghost"
                  size="sm"
                  className="font-normal w-full justify-start"
                  onClick={() => {
                    const reset: VisibilityState = {};
                    Object.keys(DEFAULT_HIDDEN_COLUMNS).forEach((key) => {
                      reset[key] = false;
                    });
                    setColumnVisibility(reset);
                  }}
                >
                  Reset to default
                </Button>
              </DropdownMenuContent>
            </DropdownMenu>

            {canExportPortfolio && (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={handleExportCSV}
                disabled={
                  isExporting || table.getFilteredRowModel().rows.length === 0
                }
              >
                {isExporting ? 'Exporting...' : 'Export CSV'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-scroll rounded border">
        <Table className="min-w-max">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      className={header.column.columnDef.meta?.className}
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
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className={`leading-[1.15] ${isInvestorTrial ? '' : 'cursor-pointer'}`}
                  onClick={() => handleRowClick(row.original)}
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
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No portfolio companies found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        table={table}
        hideWhenSinglePage
        onPageChange={handlePageChange}
      />
    </div>
  );
}
