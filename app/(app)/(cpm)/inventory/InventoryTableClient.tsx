'use client';

import React, { useState, useMemo, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  useQueryStates,
  parseAsString,
  parseAsArrayOf,
  parseAsInteger,
} from 'nuqs';
import { useTableExpandedState } from '@/app/context/TableExpandedStateContext';
import { useInventory, INVENTORY_QUERY_KEYS } from '@/hooks/api/useInventory';
import {
  sidRollupInventoryHref,
  sidRollupVendorId,
} from '@/lib/v2/bloomberg-sid/keys';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  ExpandedState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getExpandedRowModel,
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
import { ChevronLeftIcon, ChevronRightIcon } from '@radix-ui/react-icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { createInventoryColumns, type InventoryItem } from './columns';
import { InventoryItemSheet } from './InventoryItemSheet';
import { MultiSelectFilter } from '@/components/ui/data-table/components/MultiSelectFilter';
import {
  buildFilterOptions,
  filterFunctions,
} from '@/components/ui/data-table/utils/filterUtils';

import { UserMetadata } from '@/constants/types';
import ExportReportCSVButton from '@/components/contracts/ExportReportCSVButton';
import { groupInventoryByVendor } from '@/lib/v2/inventory/transforms';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { ColumnLayoutMenu } from '@/components/contracts/ColumnLayoutMenu';
import {
  applyColumnLayout,
  columnSpecId,
  STRUCTURAL_COLUMN_IDS,
  type ColumnLayoutViewKey,
} from '@/components/contracts/columnLayout';
import { INVENTORY_LIST_COLUMNS } from '@/components/contracts/listViewDefaults';
import { useColumnLayout } from '@/contexts/ColumnLayoutContext';
import {
  stickyCellTint,
  stickyPrefixCount,
  STICKY_CELL_BASE,
  STICKY_CELL_STATE,
} from '@/components/contracts/stickyColumns';
import { useStickyPrefixOffsets } from '@/components/contracts/useStickyPrefixOffsets';
import { cn } from '@/lib/utils';

const INVENTORY_LAYOUT_KEY: ColumnLayoutViewKey = 'inventory.list';

const inventoryColumnId = (column: ColumnDef<InventoryItem>): string =>
  ('accessorKey' in column ? String(column.accessorKey) : undefined) ??
  column.id ??
  '';

export interface InventoryTableClientProps {
  initialData: InventoryItem[];
  groupByVendor?: boolean;
  defaultSortColumn?: string;
  defaultSortDirection?: 'asc' | 'desc';
  userMetadata: UserMetadata;
  costAllocationEnabled?: boolean;
}

type FilterConfig = {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  column: string;
  urlParam: string;
  multiSelect?: boolean;
  filterFn?: string;
  disabled?: boolean;
};

export function InventoryTableClient({
  initialData,
  groupByVendor = false,
  defaultSortColumn = 'endDate',
  defaultSortDirection = 'asc',
  userMetadata,
  costAllocationEnabled = false,
}: InventoryTableClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { layout: storedLayout } = useColumnLayout(INVENTORY_LAYOUT_KEY);

  // Use hook for data fetching with server-side initial data
  const { data: inventoryData } = useInventory(initialData);
  const data = inventoryData?.items || initialData;

  // Get table ID based on current page and props
  const tableId = useMemo(() => {
    // Create a unique ID based on the page path and any distinguishing props
    let id = pathname;
    if (groupByVendor) id += '-grouped';
    return id;
  }, [pathname, groupByVendor]);

  // Access the table expanded state context
  const { getExpandedState, setExpandedState } = useTableExpandedState();

  // Initialize sorting based on URL parameters or defaults
  const sorting = React.useMemo<SortingState>(() => {
    const sortParam = searchParams.get('sort');
    const orderParam = searchParams.get('order');

    // Use URL params if available, otherwise use defaults
    const sortBy = sortParam || defaultSortColumn;
    const sortOrder = (orderParam as 'asc' | 'desc') || defaultSortDirection;

    return [{ id: sortBy, desc: sortOrder === 'desc' }];
  }, [searchParams, defaultSortColumn, defaultSortDirection]);

  // Initialize pagination state from URL parameters
  const pagination = React.useMemo(() => {
    const pageParam = searchParams.get('page');
    const pageIndex = pageParam ? Math.max(0, parseInt(pageParam, 10) - 1) : 0; // Convert 1-based to 0-based
    return {
      pageIndex,
      pageSize: 50,
    };
  }, [searchParams]);

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  // Initialize expanded state from context or empty object
  const [expanded, setExpanded] = useState<ExpandedState>(() => {
    const savedState = getExpandedState(tableId);
    return Object.keys(savedState).length > 0 ? savedState : {};
  });
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const [isPending, startTransition] = useTransition();

  // nuqs state for filters
  const [filterParams, setFilterParams] = useQueryStates(
    {
      vendor: parseAsString.withDefault('all'),
      delivery: parseAsArrayOf(parseAsString).withDefault([]),
      sponsor: parseAsArrayOf(parseAsString).withDefault([]),
      group: parseAsString.withDefault('all'),
      page: parseAsInteger,
    },
    {
      history: 'replace',
      shallow: true,
      startTransition,
    },
  );

  // Define filter configuration
  const filterDefinitions: Omit<FilterConfig, 'options'>[] = useMemo(
    () => [
      {
        id: 'vendor',
        label: 'Vendors',
        column: 'vendor',
        urlParam: 'vendor',
      },
      {
        id: 'deliveryMethods',
        label: 'Delivery Methods',
        column: 'deliveryMethods',
        urlParam: 'delivery',
        multiSelect: true,
        filterFn: 'arrayIncludes',
      },
      {
        id: 'businessSponsor',
        label: 'Business Sponsors',
        column: 'businessSponsor',
        urlParam: 'sponsor',
        multiSelect: true,
        filterFn: 'arrayIncludes',
      },
      {
        id: 'businessGroup',
        label: 'Business Groups',
        column: 'businessGroup',
        urlParam: 'group',
        filterFn: 'subrowAware',
      },
    ],
    [],
  );

  // Build filter options from data
  const filterOptions = useMemo(() => {
    // Always use the original flat data for building filter options
    // This ensures we get all possible values regardless of grouping
    return buildFilterOptions(data, filterDefinitions);
  }, [data, filterDefinitions]);

  // Complete filter config with options
  const filterConfig: FilterConfig[] = useMemo(() => {
    return filterDefinitions.map((filter) => {
      const options = filterOptions[filter.id] || [];
      // Keep 'all' option for vendor and businessGroup
      const shouldKeepAllOption = ['vendor', 'businessGroup'].includes(
        filter.id,
      );
      const filteredOptions = shouldKeepAllOption
        ? options
        : options.filter((opt) => opt.value !== 'all');

      // Disable filter if there are no items
      const disabled = filteredOptions.length <= 1;

      return {
        ...filter,
        options: filteredOptions,
        disabled,
      };
    });
  }, [filterOptions, filterDefinitions]);

  // Function to update URL with pagination changes
  const updateUrlWithPagination = React.useCallback(
    (pageIndex: number) => {
      const current = new URLSearchParams(Array.from(searchParams.entries()));

      if (pageIndex === 0) {
        // Remove page parameter for first page (cleaner URLs)
        current.delete('page');
      } else {
        // Convert 0-based to 1-based for URL
        current.set('page', String(pageIndex + 1));
      }

      const search = current.toString();
      const query = search ? `?${search}` : '';

      // Use replace to avoid adding to history stack
      router.replace(`${pathname}${query}`, { scroll: false });
    },
    [router, searchParams, pathname],
  );

  // Function to update URL with sorting changes
  const updateUrlWithSorting = React.useCallback(
    (sortBy: string, sortOrder: 'asc' | 'desc') => {
      const current = new URLSearchParams(Array.from(searchParams.entries()));

      // Set or update sort parameters
      if (sortBy === defaultSortColumn && sortOrder === defaultSortDirection) {
        // Remove sort params if they match the defaults (cleaner URLs)
        current.delete('sort');
        current.delete('order');
      } else {
        current.set('sort', sortBy);
        current.set('order', sortOrder);
      }

      // Reset to first page when sorting changes
      current.delete('page');

      const search = current.toString();
      const query = search ? `?${search}` : '';

      // Use replace to avoid adding to history stack
      router.replace(`${pathname}${query}`, { scroll: false });
    },
    [router, searchParams, pathname, defaultSortColumn, defaultSortDirection],
  );

  // Custom sorting handler that updates URL
  const handleSortingChange = React.useCallback(
    (updaterOrValue: any) => {
      // Handle both function and direct value updates
      const newSorting =
        typeof updaterOrValue === 'function'
          ? updaterOrValue(sorting)
          : updaterOrValue;

      if (newSorting.length > 0) {
        const sortColumn = newSorting[0];
        const sortBy = sortColumn.id;
        const sortOrder = sortColumn.desc ? 'desc' : 'asc';
        updateUrlWithSorting(sortBy, sortOrder);
      } else {
        // If no sorting, use defaults
        updateUrlWithSorting(defaultSortColumn, defaultSortDirection);
      }
    },
    [sorting, updateUrlWithSorting, defaultSortColumn, defaultSortDirection],
  );

  // Column filters state
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // Handle single-select filter change
  const handleFilterChange = (filterId: string, value: string, table: any) => {
    const filterDef = filterConfig.find((f) => f.id === filterId);
    if (!filterDef) return;

    // Update nuqs state
    if (filterId === 'vendor') {
      setFilterParams({ vendor: value === 'all' ? null : value, page: null });
    } else if (filterId === 'businessGroup') {
      setFilterParams({ group: value === 'all' ? null : value, page: null });
    }

    // Update table filter
    if (value === 'all') {
      table.getColumn(filterDef.column)?.setFilterValue(undefined);
    } else {
      const column = table.getColumn(filterDef.column);
      if (column) {
        column.setFilterValue(value);
      }
    }
  };

  // Handle multi-select filter change
  const handleMultiSelectFilterChange = (
    filterId: string,
    values: string[],
    table: any,
  ) => {
    const filterDef = filterConfig.find((f) => f.id === filterId);
    if (!filterDef) return;

    // Update nuqs state
    if (filterId === 'deliveryMethods') {
      setFilterParams({
        delivery: values.length === 0 ? null : values,
        page: null,
      });
    } else if (filterId === 'businessSponsor') {
      setFilterParams({
        sponsor: values.length === 0 ? null : values,
        page: null,
      });
    }

    // Update table filter
    const column = table.getColumn(filterDef.column);
    if (column) {
      if (values.length === 0) {
        column.setFilterValue(undefined);
      } else {
        column.setFilterValue(values);
      }
      if (filterDef.filterFn) {
        // @ts-ignore
        column.columnDef.filterFn = filterDef.filterFn;
      }
    }
  };

  // Clear all filters
  const handleClearAllFilters = () => {
    setFilterParams({
      vendor: null,
      delivery: null,
      sponsor: null,
      group: null,
      page: null,
    });
  };

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      (filterParams.vendor && filterParams.vendor !== 'all') ||
      (filterParams.delivery && filterParams.delivery.length > 0) ||
      (filterParams.sponsor && filterParams.sponsor.length > 0) ||
      (filterParams.group && filterParams.group !== 'all')
    );
  }, [filterParams]);

  const handleRowClick = (item: InventoryItem, row: any) => {
    // If this is a grouped row with subrows and we're grouping, just expand/collapse it
    if (
      shouldGroup &&
      item.subRows &&
      Array.isArray(item.subRows) &&
      item.subRows.length > 0
    ) {
      row.toggleExpanded();
      return;
    }

    // The item sheet is contract-backed, so the Bloomberg rollup row goes to
    // the vendor's own inventory view instead.
    const sidVendorId = sidRollupVendorId(item.id);
    if (sidVendorId !== null) {
      router.push(sidRollupInventoryHref(sidVendorId));
      return;
    }

    // For individual items, open the sheet
    setSelectedItem(item);
    setIsSheetOpen(true);
  };

  const handleCloseSheet = () => {
    setIsSheetOpen(false);
    setSelectedItem(null);
  };

  const handleDataChange = () => {
    queryClient.invalidateQueries({ queryKey: INVENTORY_QUERY_KEYS.inventory });
  };

  const { baseCurrency } = useBaseCurrency();

  // Determine if we should group (disable grouping when searching or filtering)
  const shouldGroup = groupByVendor && !globalFilter && !hasActiveFilters;

  // Process data for table: group when needed, use flat data otherwise
  const tableData = useMemo(() => {
    if (shouldGroup) {
      return groupInventoryByVendor(data, baseCurrency);
    }
    return data;
  }, [data, shouldGroup, baseCurrency]);

  // Determine which columns to use based on grouping
  const columnsToUse = useMemo(() => {
    const advanceNoticePeriod =
      userMetadata?.userProfile?.advance_notice_period || 90;
    let columns = [
      ...createInventoryColumns(advanceNoticePeriod, userMetadata?.dateFormat),
    ];
    if (shouldGroup) {
      // Move expander column to the front if grouping by vendor
      const expanderColumn = columns.find((col) => col.id === 'expander');
      const otherColumns = columns.filter((col) => col.id !== 'expander');
      if (expanderColumn) {
        columns = [expanderColumn, ...otherColumns];
      }
    } else {
      // Remove expander column if not grouping
      columns = columns.filter((col) => col.id !== 'expander');
    }

    // Apply the user's saved layout. Inventory builds ColumnDefs directly
    // rather than resolving ids, so project to ids, reorder/filter there, and
    // map back — the ordering and locking rules stay in one place.
    const byId = new Map(columns.map((col) => [inventoryColumnId(col), col]));
    return applyColumnLayout(
      columns.map(inventoryColumnId),
      storedLayout,
      INVENTORY_LAYOUT_KEY,
    ).flatMap((spec) => {
      const column = byId.get(columnSpecId(spec));
      return column ? [column] : [];
    });
  }, [
    shouldGroup,
    storedLayout,
    userMetadata?.userProfile?.advance_notice_period,
    userMetadata?.dateFormat,
  ]);

  // Custom global filter function that searches vendor names, product names, active users, and business sponsors
  const customGlobalFilter = (row: any, columnId: string, value: string) => {
    const search = value.toLowerCase();
    const rowData = row.original;

    // Search in vendor name
    if (rowData.vendor?.toLowerCase().includes(search)) return true;

    // Search in product names array
    if (rowData.productName && Array.isArray(rowData.productName)) {
      if (
        rowData.productName.some((name: string) =>
          name.toLowerCase().includes(search),
        )
      )
        return true;
    }

    // Search in active users (names and emails)
    if (rowData.activeUsers && Array.isArray(rowData.activeUsers)) {
      if (
        rowData.activeUsers.some(
          (user: any) =>
            user.name?.toLowerCase().includes(search) ||
            user.email?.toLowerCase().includes(search),
        )
      )
        return true;
    }

    // Search in business sponsors (array)
    if (rowData.businessSponsor && Array.isArray(rowData.businessSponsor)) {
      if (
        rowData.businessSponsor.some((sponsor: string) =>
          sponsor?.toLowerCase().includes(search),
        )
      )
        return true;
    }

    return false;
  };

  const table = useReactTable({
    data: tableData,
    columns: columnsToUse,
    onSortingChange: handleSortingChange,
    onColumnFiltersChange: setColumnFilters,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: customGlobalFilter,
    getSubRows: (row: InventoryItem) => (shouldGroup ? row.subRows : undefined),
    getRowCanExpand: (row) =>
      shouldGroup &&
      !!(row.original as InventoryItem).subRows &&
      (row.original as InventoryItem).subRows!.length > 0,
    paginateExpandedRows: false, // Don't paginate expanded child rows
    filterFns: filterFunctions,
    defaultColumn: {
      sortingFn: 'basic',
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      expanded,
      globalFilter,
      pagination,
    },
    initialState: {},
    meta: {
      groupByVendor: shouldGroup,
      userMetadata,
    },
  });

  // Apply filters from nuqs state to table
  React.useEffect(() => {
    if (isPending) return;

    // Clear all filters first
    filterConfig.forEach((config) => {
      const column = table.getColumn(config.column);
      if (column) {
        column.setFilterValue(undefined);
      }
    });

    // Apply vendor filter
    if (filterParams.vendor && filterParams.vendor !== 'all') {
      const column = table.getColumn('vendor');
      if (column) {
        column.setFilterValue(filterParams.vendor);
      }
    }

    // Apply delivery methods filter
    if (filterParams.delivery && filterParams.delivery.length > 0) {
      const column = table.getColumn('deliveryMethods');
      if (column) {
        column.setFilterValue(filterParams.delivery);
        // @ts-ignore
        column.columnDef.filterFn = 'arrayIncludes';
      }
    }

    // Apply business sponsor filter
    if (filterParams.sponsor && filterParams.sponsor.length > 0) {
      const column = table.getColumn('businessSponsor');
      if (column) {
        column.setFilterValue(filterParams.sponsor);
        // @ts-ignore
        column.columnDef.filterFn = 'arrayIncludes';
      }
    }

    // Apply business group filter
    if (filterParams.group && filterParams.group !== 'all') {
      const column = table.getColumn('businessGroup');
      if (column) {
        column.setFilterValue(filterParams.group);
        // @ts-ignore
        column.columnDef.filterFn = 'subrowAware';
      }
    }
  }, [table, filterParams, isPending, filterConfig]);

  // Custom pagination handlers that update URL only
  const handlePreviousPage = () => {
    const newPageIndex = Math.max(0, pagination.pageIndex - 1);
    updateUrlWithPagination(newPageIndex);
  };

  const handleNextPage = () => {
    const maxPage =
      Math.ceil(
        table.getPrePaginationRowModel().rows.length / pagination.pageSize,
      ) - 1;
    const newPageIndex = Math.min(maxPage, pagination.pageIndex + 1);
    updateUrlWithPagination(newPageIndex);
  };

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const stickyCount = stickyPrefixCount(
    table.getVisibleLeafColumns().map((column) => column.id),
  );
  const stickyOffsets = useStickyPrefixOffsets(scrollContainerRef, stickyCount);
  const pinnedCount = stickyOffsets.length === stickyCount ? stickyCount : 0;

  // Synchronize expanded state with context when it changes
  // Using a ref to prevent an infinite update loop
  const previousExpandedState = React.useRef<string>('');

  React.useEffect(() => {
    // Save expanded state when it changes
    // Convert to JSON string for comparison
    const expandedJson = JSON.stringify(expanded);
    if (previousExpandedState.current !== expandedJson) {
      previousExpandedState.current = expandedJson;

      // Only save object expanded state, not true
      if (expanded !== true) {
        setExpandedState(tableId, expanded);
      }
    }
  }, [expanded, tableId, setExpandedState]);

  return (
    <div className="w-full space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col gap-4">
        {/* Search Bar and Dropdowns */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search inventory"
                value={globalFilter}
                onChange={(event) => setGlobalFilter(event.target.value)}
                className="h-8 w-[220px] pl-8 text-sm"
              />
            </div>

            {/* Shared Filter Components */}
            {filterConfig.map((filter) => {
              if (filter.multiSelect) {
                // Use MultiSelectFilter for multi-select filters
                const currentValue =
                  filter.id === 'deliveryMethods'
                    ? filterParams.delivery
                    : filter.id === 'businessSponsor'
                      ? filterParams.sponsor
                      : [];
                return (
                  <div key={filter.id} className="min-w-[180px]">
                    <MultiSelectFilter
                      options={filter.options}
                      value={currentValue || []}
                      onValueChange={(values) =>
                        handleMultiSelectFilterChange(filter.id, values, table)
                      }
                      placeholder={`All ${filter.label}`}
                      disabled={filter.disabled}
                    />
                  </div>
                );
              } else {
                // Use regular Select for single-select filters
                const currentValue =
                  filter.id === 'vendor'
                    ? filterParams.vendor
                    : filter.id === 'businessGroup'
                      ? filterParams.group
                      : 'all';
                return (
                  <div key={filter.id} className="min-w-[180px]">
                    <Select
                      onValueChange={(value) =>
                        handleFilterChange(filter.id, value, table)
                      }
                      value={currentValue || 'all'}
                      disabled={filter.disabled}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder={`All ${filter.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {filter.options.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
            })}

            {/* Reset button */}
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

          {/* Grouped so `justify-between` splits the row in two, not three */}
          <div className="flex items-center gap-2">
            <ColumnLayoutMenu
              viewKey={INVENTORY_LAYOUT_KEY}
              defaults={INVENTORY_LIST_COLUMNS}
            />

            {/* Export Button */}
            <ExportReportCSVButton
              label={`Export (${table.getFilteredRowModel().rows.length})`}
              reportTitle="Inventory"
              variant="inventory"
              exportType="inventory"
              inventoryData={table
                .getFilteredRowModel()
                .rows.map((row) => row.original)}
              columnOrder={table
                .getVisibleLeafColumns()
                .map((column) => column.id)
                .filter((id) => !STRUCTURAL_COLUMN_IDS.has(id))}
              disabled={table.getFilteredRowModel().rows.length === 0}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div
        ref={scrollContainerRef}
        className="max-h-[calc(100vh-320px)] min-h-[240px] overflow-auto rounded border"
      >
        {/* border-separate: sticky cells drop their borders under border-collapse */}
        <Table className="border-separate border-spacing-0">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header, headerIndex) => {
                  const isPinned = headerIndex < pinnedCount;
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        header.column.columnDef.meta?.className,
                        'sticky top-0 z-20 border-b bg-background',
                        isPinned && 'left-[var(--sticky-left)] z-30',
                        isPinned &&
                          headerIndex === pinnedCount - 1 &&
                          'border-r',
                      )}
                      style={
                        isPinned
                          ? ({
                              '--sticky-left': `${stickyOffsets[headerIndex]}px`,
                            } as React.CSSProperties)
                          : undefined
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
              (() => {
                let topLevelCount = -1;
                let subRowCount = 0;
                return table.getRowModel().rows.map((row, index) => {
                  if (row.depth === 0) {
                    topLevelCount++;
                    subRowCount = 0;
                  } else {
                    subRowCount++;
                  }
                  const isBanded =
                    row.depth === 0
                      ? topLevelCount % 2 === 1
                      : subRowCount % 2 === 1;
                  return (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      className={cn(
                        'group/row cursor-pointer leading-[1.15] [&>td]:border-b',
                        row.depth === 0 && isBanded && 'bg-muted/40',
                        row.depth > 0 &&
                          (isBanded
                            ? 'bg-muted/80 dark:bg-muted/70'
                            : 'bg-muted/50 dark:bg-muted/40'),
                      )}
                      onClick={() => handleRowClick(row.original, row)}
                    >
                      {row.getVisibleCells().map((cell, cellIndex) => {
                        const isPinned = cellIndex < pinnedCount;
                        return (
                          <TableCell
                            key={cell.id}
                            className={cn(
                              cell.column.columnDef.meta?.className,
                              isPinned && [
                                'left-[var(--sticky-left)]',
                                STICKY_CELL_BASE,
                                STICKY_CELL_STATE,
                                stickyCellTint({
                                  depth: row.depth,
                                  isBanded,
                                  isProductSubRow: false,
                                  isInactive: false,
                                }),
                                cellIndex === pinnedCount - 1 && 'border-r',
                              ],
                            )}
                            style={
                              isPinned
                                ? ({
                                    '--sticky-left': `${stickyOffsets[cellIndex]}px`,
                                  } as React.CSSProperties)
                                : undefined
                            }
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                });
              })()
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columnsToUse.length}
                  className="h-24 text-center"
                >
                  No inventory items found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination controls */}
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between space-x-2 py-4 pb-0">
          <div className="flex-1 font-label text-xs text-muted-foreground">
            Showing{' '}
            {(() => {
              const totalRows = table.getPrePaginationRowModel().rows.length;
              const currentPage = pagination.pageIndex;
              const pageSize = pagination.pageSize;
              const startRow = currentPage * pageSize + 1;
              const endRow = Math.min((currentPage + 1) * pageSize, totalRows);
              return `${startRow} to ${endRow} of ${totalRows}`;
            })()}{' '}
            {groupByVendor ? 'Vendors' : 'Items'}
          </div>
          <div className="space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviousPage}
              disabled={pagination.pageIndex === 0}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={
                pagination.pageIndex >=
                Math.ceil(
                  table.getPrePaginationRowModel().rows.length /
                    pagination.pageSize,
                ) -
                  1
              }
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      )}

      {/* Inventory Item Detail Sheet */}
      <InventoryItemSheet
        item={selectedItem}
        isOpen={isSheetOpen}
        onClose={handleCloseSheet}
        onDataChange={handleDataChange}
        userMetadata={userMetadata}
        costAllocationEnabled={costAllocationEnabled}
      />
    </div>
  );
}
