'use client';

import React, { useMemo, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQueryStates, parseAsString, parseAsArrayOf } from 'nuqs';
import { useTableExpandedState } from '@/app/context/TableExpandedStateContext';
import {
  filterFunctions,
  matchesAllActiveFiltersForRow,
} from '@/components/ui/data-table/utils/filterUtils';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  ExpandedState,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getExpandedRowModel,
  Row,
  Table as TanStackTable,
} from '@tanstack/react-table';
import { columns as allColumns } from './columns';
import { buildColumnFilters, buildFilterUrlKeys } from './ContractTableFilters';
import { ColumnHeader } from './ColumnHeader';
import { type ContractTableRow } from '@/lib/v2/core/types';
import { isSidRollupKey } from '@/lib/v2/bloomberg-sid/keys';
import { ProcessedContract } from '@/app/lib/definitions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  TablePagination,
  PAGINATION_FOOTPRINT_CLASS,
} from '@/components/ui/data-table/components/TablePagination';
import { conditionalSort } from '@/app/lib/utils';
import { BulkActionsBar } from './BulkActionsBar';
import { ColumnLayoutMenu } from './ColumnLayoutMenu';
import {
  applyColumnLayout,
  columnSpecId,
  STRUCTURAL_COLUMN_IDS,
  type ColumnLayoutViewKey,
} from './columnLayout';
import { useColumnLayout } from '@/contexts/ColumnLayoutContext';
import {
  stickyCellTint,
  stickyPrefixCount,
  STICKY_CELL_BASE,
  STICKY_CELL_STATE,
} from './stickyColumns';
import { useStickyPrefixOffsets } from './useStickyPrefixOffsets';
import { isLeafDetailRow } from './rowTypeGuards';
import { pruneRowsByFilters } from '@/lib/v2/contracts/tableFiltering';
import { toast } from '../ui/use-toast';
import { UserMetadata } from '@/constants/types';
import { cn } from '@/lib/utils';
import { useFolderContext } from '@/app/(app)/(cpm)/contracts/(views)/FolderContext';
import { useSharingDialog } from '@/app/(app)/SharingDialogContext';
import { ContractRowContextMenu } from './ContractRowContextMenu';
import logger from '@/utils/pino';
import { CreateFolderDialog } from './CreateFolderDialog';
import { useAbility } from '@/components/providers/AbilityProvider';
import { useFolderAssignment } from '@/hooks/useFolderAssignment';
import { useArchiveChildrenConfirm } from '@/components/providers/ArchiveChildrenConfirmProvider';
import { useReactivateChildrenSelect } from '@/components/providers/ReactivateChildrenDialogProvider';
import {
  reactivateChildrenAfterParent,
  requestArchiveWithChildren,
} from '@/lib/contracts/archiveClient';
import type { ActionType } from '@/app/lib/definitions';
import { exportTableToCSV } from '@/utils/table-export';
import { logExportBeacon } from '@/utils/audit-export';
import {
  getInvoiceStatusLabel,
  INVOICE_STATUS_LABELS,
} from '@/constants/invoiceStatus';

type CustomColumn = {
  id: string;
  header: string;
};

const DEFAULT_COLUMN_SPEC = [
  'vendor',
  'product',
  'type',
  'cancelByDate',
  'termEndDate',
  'totalContractValue',
];

const FILTER_COLUMN_IDS = [
  'businessSponsor',
  'businessGroup',
  'tags',
  'renewalType',
  'invoiceStatus',
];

const LINEAGE_SORTED_COLUMN_IDS = new Set(['termEndDate', 'cancelByDate']);

const LINEAGE_ROLLUP_KEYS: Record<string, keyof ContractTableRow> = {
  termEndDate: 'subtreeEarliestTermEndDate',
  cancelByDate: 'subtreeEarliestCancelByDate',
};

function columnDefId(column: {
  accessorKey?: unknown;
  id?: string;
}): string | undefined {
  return (
    (column.accessorKey !== undefined
      ? String(column.accessorKey)
      : undefined) ?? column.id
  );
}

function lineageAwareDateSort(
  rowA: Row<ContractTableRow>,
  rowB: Row<ContractTableRow>,
  columnId: string,
): number {
  const rollupKey = LINEAGE_ROLLUP_KEYS[columnId];
  const read = (row: Row<ContractTableRow>): string => {
    const rollup = rollupKey
      ? (row.original[rollupKey] as string | null | undefined)
      : undefined;
    return (
      rollup ?? (row.getValue(columnId) as string | null | undefined) ?? ''
    );
  };

  const a = read(rowA);
  const b = read(rowB);
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

export type FilterType =
  | 'tags'
  | 'renewalType'
  | 'businessSponsor'
  | 'businessGroup'
  | 'invoiceStatus';

type ContractsTableClientProps = {
  data: ContractTableRow[];
  columns?: readonly (string | CustomColumn)[];
  groupByVendor?: boolean;
  itemsPerPage?: number;
  isVendorsPage?: boolean;
  hidePagination?: boolean;
  userMetadata: UserMetadata;
  replacementFlaggedContractIds?: readonly number[];
  includeReportSubRows?: boolean;
  reportType?: string;
  actionType?: ActionType | ActionType[];
  onActionExecute?: (action: string, selectedRows: any[]) => Promise<void>;
  defaultSortColumn?: string;
  defaultSortDirection?: 'asc' | 'desc';
  foldersView?: boolean;
  fillViewport?: boolean;
  stickyHeader?: boolean;
  compact?: boolean;
  filters?: FilterType[];
  defaultInvoiceStatus?: string;
  layoutKey?: ColumnLayoutViewKey;
  nestByLineage?: boolean;
  filterKeyPrefix?: string;
  /** Report usage: the row itself opens a panel (via `onRowClick`), so
   * cell-level navigation links (e.g. the product column) are disabled. */
  enableDiscrepancySheet?: boolean;
  /** Fires on a click anywhere on a contract row except the vendor icon/link,
   * the expander, and the select checkbox — only meaningful alongside
   * `enableDiscrepancySheet`. */
  onRowClick?: (row: Row<ContractTableRow>) => void;
};

/**
 * Checks if a row is an actual contract (not a vendor group or product subrow)
 */
function isContractRow<T extends ContractTableRow>(row: Row<T> | T): boolean {
  const original = 'original' in row ? row.original : row;

  // Vendor groups are not contracts
  if (original.isGroup) return false;

  // Product subRows are not contracts
  if (original.isProductRow) return false;

  // Report subRows that point to a parent contract are not the contract itself
  if (original.contract_id && original.contract_id !== original.id)
    return false;

  // Everything else with an ID is a contract
  return !!original.id;
}

/**
 * Extracts contract IDs from selected table rows, handling both grouped and individual rows
 */
function getContractIdsFromRows(rows: any[]): number[] {
  return Array.from(new Set(collectContractIds(rows)));
}

function collectContractIds(rows: any[]): number[] {
  return rows.flatMap((row) => {
    const original = row.original || row;

    const ownId = isContractRow(row)
      ? (() => {
          const id =
            typeof original.id === 'string'
              ? parseInt(original.id, 10)
              : original.id;
          return typeof id === 'number' && !isNaN(id) ? [id] : [];
        })()
      : [];

    const childIds = original.subRows?.length
      ? collectContractIds(original.subRows)
      : [];

    return [...ownId, ...childIds];
  });
}

/**
 * Gets selected rows from the table, handling both grouped and non-grouped views correctly
 * - For grouped vendor views: uses flatRows + filters to contract rows (excluding vendor groups and product subRows)
 * - For non-grouped views (reports): uses rows directly (keeps parent rows with subRows)
 */
function getSelectedRows(
  table: TanStackTable<ContractTableRow>,
  groupByVendor: boolean,
): Row<ContractTableRow>[] {
  const allSelectedRows = groupByVendor
    ? table.getSelectedRowModel().flatRows
    : table.getSelectedRowModel().rows;

  // For grouped vendor views, filter to only contract rows (not vendor groups or product subRows)
  // For reports, we want parent contract rows even if they have report subRows
  return groupByVendor ? getContractRows(allSelectedRows) : allSelectedRows;
}

/**
 * Filters table rows to only actual contract rows.
 * Excludes vendor groups (isGroup) and product subRows (isProductRow).
 */
function getContractRows<T extends ContractTableRow>(rows: Row<T>[]): Row<T>[] {
  return rows.filter((row) => isContractRow(row));
}

type FilterConfig = {
  id: string;
  label: string;
  options: {
    value: string;
    label: string;
  }[];
  column: string;
  urlParam: string;
  multiSelect?: boolean;
};

const getDefaultFilterConfig = (): Omit<FilterConfig, 'options'>[] => [
  {
    id: 'renewalType',
    label: 'Renewal Types',
    column: 'renewalType',
    urlParam: 'renewal',
  },
  {
    id: 'tags',
    label: 'Tags',
    column: 'tags',
    urlParam: 'tags',
    multiSelect: true,
  },
  {
    id: 'businessSponsor',
    label: 'Business Sponsors',
    column: 'businessSponsor',
    urlParam: 'sponsor',
  },
  {
    id: 'businessGroup',
    label: 'Business Groups',
    column: 'businessGroup',
    urlParam: 'group',
  },
  {
    id: 'invoiceStatus',
    label: 'Statuses',
    column: 'invoiceStatus',
    urlParam: 'invoiceStatus',
  },
];

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char] as string,
  );

const formatRenewalTypeLabel = (value: string): string => {
  const lowerValue = value.toLowerCase();

  if (lowerValue === 'auto') return 'Auto Renewal';
  if (lowerValue === 'manual') return 'Manual Renewal';
  if (lowerValue === 'one-time') return 'One-Time';

  return value;
};

export function ContractsTableClient({
  data,
  columns: columnsProp,
  groupByVendor = false,
  itemsPerPage = 50,
  isVendorsPage = false,
  hidePagination = false,
  userMetadata,
  replacementFlaggedContractIds,
  includeReportSubRows = false,
  reportType,
  actionType = 'none',
  onActionExecute,
  defaultSortColumn = 'termEndDate',
  defaultSortDirection = 'asc',
  foldersView = false,
  fillViewport = false,
  stickyHeader = false,
  compact = false,
  filters = ['tags', 'renewalType', 'businessSponsor', 'businessGroup'],
  defaultInvoiceStatus = 'all',
  layoutKey,
  nestByLineage = false,
  filterKeyPrefix,
  enableDiscrepancySheet = false,
  onRowClick,
}: ContractsTableClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const folderContext = useFolderContext();
  const folders = folderContext?.folders || [];
  const organizationId = folderContext?.organizationId || '';
  const userId = folderContext?.userId || '';
  const { openSharingDialog } = useSharingDialog();
  const ability = useAbility();
  const canManageFolder = ability.can('manage', 'Folder');
  const confirmArchiveChildren = useArchiveChildrenConfirm();
  const selectReactivateChildren = useReactivateChildrenSelect();
  const { assignToFolder } = useFolderAssignment();

  const actionTypes = Array.isArray(actionType) ? actionType : [actionType];
  const { layout: storedLayout } = useColumnLayout(layoutKey);

  // Use the filters prop directly
  const visibleFilters = filters;

  const [isPending, startTransition] = useTransition();

  // Helper function to collect contracts and open sharing dialog
  // Automatically detects single vs bulk and opens the appropriate dialog
  const openBulkSharingDialog = (rows: any[]) => {
    const contractIds: number[] = [];
    const contracts: any[] = [];

    // Filter to only actual contract rows (not vendor groups or product subRows)
    const contractRows = rows.filter(isContractRow);

    contractRows.forEach((row) => {
      // Handle both string and number IDs
      const numericId =
        typeof row.id === 'string' ? parseInt(row.id, 10) : row.id;
      if (typeof numericId === 'number' && !isNaN(numericId)) {
        contractIds.push(numericId);
        contracts.push({
          id: numericId,
          vendor: row.vendor,
          vendorDomain: row.vendorDomain,
          product: row.product,
          products: row.currentYearProducts || [],
          uploadedBy: row.uploadedBy,
          type: row.type,
          typeId: row.typeId,
        });
      }
    });

    if (contractIds.length === 0) return;

    // Single contract: use single sharing dialog
    if (contractIds.length === 1) {
      const contract = contracts[0];
      openSharingDialog({
        itemId: contract.id,
        itemType: 'contract',
        contract: {
          id: contract.id,
          vendors: {
            name: contract.vendor,
            domain: contract.vendorDomain,
          },
          contract_types: {
            id: contract.typeId,
            name: contract.type,
          },
          uploaded_by: contract.uploadedBy,
        },
      });
    } else {
      // Multiple contracts: use bulk sharing dialog
      const firstContract = contracts[0];
      openSharingDialog({
        itemId: contractIds[0],
        itemType: 'contract',
        bulkContracts: {
          contractIds,
          vendor: firstContract?.vendor || 'Multiple vendors',
          vendorDomain: firstContract?.vendorDomain,
          count: contractIds.length,
          contracts,
        },
      });
    }
  };

  const filterUrlKeys = useMemo(
    () => buildFilterUrlKeys(filterKeyPrefix),
    [filterKeyPrefix],
  );

  const [filterParams, setFilterParams] = useQueryStates(
    {
      renewal: parseAsString.withDefault('all'),
      tags: parseAsArrayOf(parseAsString).withDefault([]),
      sponsor: parseAsString.withDefault('all'),
      group: parseAsString.withDefault('all'),
      invoiceStatus: parseAsString.withDefault(defaultInvoiceStatus),
      page: parseAsString,
    },
    {
      history: 'replace',
      startTransition,
      urlKeys: filterUrlKeys,
    },
  );

  const tableId = useMemo(() => {
    let id = pathname;
    if (reportType) id += `-${reportType}`;
    if (isVendorsPage) id += '-vendors';
    if (groupByVendor) id += '-grouped';
    if (nestByLineage) id += '-lineage';
    return id;
  }, [pathname, reportType, isVendorsPage, groupByVendor, nestByLineage]);

  const { getExpandedState, setExpandedState } = useTableExpandedState();

  const filterOptions = useMemo(() => {
    const filterDefinitions = getDefaultFilterConfig();

    const optionsMap: Record<
      string,
      { value: string; label: string; disabled?: boolean }[]
    > = {};

    filterDefinitions.forEach((filter) => {
      optionsMap[filter.id] = [{ value: 'all', label: `All ${filter.label}` }];
    });

    const uniqueValuesMap: Record<string, Set<string>> = {};
    filterDefinitions.forEach((filter) => {
      uniqueValuesMap[filter.id] = new Set<string>();
    });

    const processTags = (item: any) => {
      if (item.tags && Array.isArray(item.tags)) {
        item.tags.forEach((tag: any) => {
          if (tag.name && !uniqueValuesMap['tags'].has(tag.name)) {
            uniqueValuesMap['tags'].add(tag.name);
            optionsMap['tags'].push({
              value: tag.name.toLowerCase(),
              label: tag.name,
            });
          }
        });
      }
    };

    const processBusinessSponsor = (item: any) => {
      if (item.businessSponsor && Array.isArray(item.businessSponsor)) {
        item.businessSponsor.forEach((sponsor: string) => {
          if (sponsor && !uniqueValuesMap['businessSponsor'].has(sponsor)) {
            uniqueValuesMap['businessSponsor'].add(sponsor);
            optionsMap['businessSponsor'].push({
              value: sponsor,
              label: sponsor,
            });
          }
        });
      }
    };

    const processBusinessGroups = (item: any) => {
      if (item.businessGroups && Array.isArray(item.businessGroups)) {
        item.businessGroups.forEach((group: any) => {
          const groupId = String(group.id);
          if (group.id && !uniqueValuesMap['businessGroup'].has(groupId)) {
            uniqueValuesMap['businessGroup'].add(groupId);
            optionsMap['businessGroup'].push({
              value: groupId,
              label: group.name || '',
            });
          }
        });
      }
    };

    const processInvoiceStatus = (item: any) => {
      const value = item.invoiceStatus;
      if (value && typeof value === 'string' && value.trim() !== '') {
        uniqueValuesMap['invoiceStatus'].add(value);
      }
    };

    const processStandardValue = (
      item: any,
      filterId: string,
      column: string,
    ) => {
      if (
        filterId === 'tags' ||
        filterId === 'businessSponsor' ||
        filterId === 'businessGroup' ||
        filterId === 'invoiceStatus'
      )
        return;

      const value = item[column];
      if (value && typeof value === 'string' && value.trim() !== '') {
        if (!uniqueValuesMap[filterId].has(value)) {
          uniqueValuesMap[filterId].add(value);
          optionsMap[filterId].push({
            value: value,
            label: value,
          });
        }
      }
    };

    const processItem = (item: any) => {
      processTags(item);
      processBusinessSponsor(item);
      processBusinessGroups(item);
      processInvoiceStatus(item);

      filterDefinitions.forEach((filter) => {
        if (
          filter.id !== 'tags' &&
          filter.id !== 'businessSponsor' &&
          filter.id !== 'businessGroup' &&
          filter.id !== 'invoiceStatus'
        ) {
          processStandardValue(item, filter.id, filter.column);
        }
      });
    };

    const processTree = (item: any) => {
      processItem(item);
      if (Array.isArray(item?.subRows)) item.subRows.forEach(processTree);
    };
    data.forEach(processTree);

    const activeStatuses = uniqueValuesMap['invoiceStatus'];
    for (const [status, label] of Object.entries(INVOICE_STATUS_LABELS)) {
      optionsMap['invoiceStatus'].push({
        value: status,
        label,
        disabled: !activeStatuses.has(status),
      });
    }

    Object.keys(optionsMap).forEach((filterId) => {
      optionsMap[filterId].sort((a, b) => {
        if (a.value === 'all') return -1; // "All" options should always be first
        if (b.value === 'all') return 1;
        return a.label.localeCompare(b.label);
      });
    });

    return optionsMap;
  }, [data]);

  const FILTER_CONFIG: FilterConfig[] = useMemo(() => {
    const allFilters = getDefaultFilterConfig().map((filter) => {
      const options = filterOptions[filter.id] || [
        { value: 'all', label: `All ${filter.label}` },
      ];
      // Keep 'all' option for single-select filters
      const shouldKeepAllOption = [
        'renewalType',
        'businessSponsor',
        'businessGroup',
        'invoiceStatus',
      ].includes(filter.id);
      const filteredOptions = shouldKeepAllOption
        ? options
        : options.filter((opt) => opt.value !== 'all');
      return {
        ...filter,
        options: filteredOptions,
      };
    });

    if (visibleFilters && visibleFilters.length > 0) {
      return allFilters.filter((filter) =>
        visibleFilters.includes(filter.id as FilterType),
      );
    }

    return allFilters;
  }, [filterOptions, visibleFilters]);

  const sorting = React.useMemo<SortingState>(() => {
    const sortParam = searchParams.get('sort');
    const orderParam = searchParams.get('order');

    const sortBy = sortParam || defaultSortColumn;
    const sortOrder = (orderParam as 'asc' | 'desc') || defaultSortDirection;

    return [{ id: sortBy, desc: sortOrder === 'desc' }];
  }, [searchParams, defaultSortColumn, defaultSortDirection]);

  const columnFilters = React.useMemo<ColumnFiltersState>(
    () => buildColumnFilters(filterParams),
    [filterParams],
  );

  const baseColumnSpec = columnsProp || DEFAULT_COLUMN_SPEC;

  const effectiveColumnSpec = useMemo(
    () =>
      layoutKey
        ? applyColumnLayout(baseColumnSpec, storedLayout, layoutKey)
        : baseColumnSpec,
    [baseColumnSpec, storedLayout, layoutKey],
  );

  const effectiveColumnIds = useMemo(
    () => effectiveColumnSpec.map(columnSpecId),
    [effectiveColumnSpec],
  );

  const selectionEnabled = !actionTypes.includes('none');

  const columnVisibility = useMemo<VisibilityState>(() => {
    const visibility: VisibilityState = { select: selectionEnabled };
    for (const columnId of FILTER_COLUMN_IDS) {
      if (!effectiveColumnIds.includes(columnId)) visibility[columnId] = false;
    }
    return visibility;
  }, [effectiveColumnIds, selectionEnabled]);
  const [rowSelection, setRowSelection] = React.useState({});
  const [isCreateFolderDialogOpen, setIsCreateFolderDialogOpen] =
    React.useState(false);
  const [pendingFolderAssignment, setPendingFolderAssignment] = React.useState<
    number[] | null
  >(null);

  const [expanded, setExpanded] = React.useState<ExpandedState>(() => {
    const savedState = getExpandedState(tableId);
    return Object.keys(savedState).length > 0 ? savedState : {};
  });

  const tableData = React.useMemo(() => {
    if (!groupByVendor && !nestByLineage) return data || [];
    if (!columnFilters || columnFilters.length === 0) return data || [];

    return pruneRowsByFilters(data || [], columnFilters);
  }, [data, groupByVendor, nestByLineage, columnFilters]);

  const pagination = React.useMemo(() => {
    // Without a visible bar there is no way off a nonzero page, so a stale
    // ?page in the URL would render an empty table.
    const pageParam = hidePagination ? null : searchParams.get('page');
    const pageIndex = pageParam ? Math.max(0, parseInt(pageParam, 10) - 1) : 0;
    return {
      pageIndex,
      pageSize: itemsPerPage,
    };
  }, [searchParams, itemsPerPage, hidePagination]);

  const updateUrlWithPagination = React.useCallback(
    (pageIndex: number) => {
      const current = new URLSearchParams(Array.from(searchParams.entries()));

      if (pageIndex === 0) {
        current.delete('page');
      } else {
        current.set('page', String(pageIndex + 1));
      }

      const search = current.toString();
      const query = search ? `?${search}` : '';

      router.replace(`${pathname}${query}`, { scroll: false });
    },
    [router, searchParams, pathname],
  );

  const updateUrlWithSorting = React.useCallback(
    (sortBy: string, sortOrder: 'asc' | 'desc') => {
      const current = new URLSearchParams(Array.from(searchParams.entries()));

      if (sortBy === defaultSortColumn && sortOrder === defaultSortDirection) {
        current.delete('sort');
        current.delete('order');
      } else {
        current.set('sort', sortBy);
        current.set('order', sortOrder);
      }

      current.delete('page');

      const search = current.toString();
      const query = search ? `?${search}` : '';

      router.replace(`${pathname}${query}`, { scroll: false });
    },
    [router, searchParams, pathname, defaultSortColumn, defaultSortDirection],
  );

  const columnsToUse = useMemo(() => {
    const allColumnsWithInvoice = [...allColumns];

    const columnMap = allColumnsWithInvoice.reduce(
      (acc, col) => {
        const key =
          ('accessorKey' in col ? col.accessorKey : undefined) || col.id;
        if (key) {
          acc[key as string] = col;
        }
        return acc;
      },
      {} as { [key: string]: ColumnDef<ContractTableRow> },
    );

    let selectedColumns = effectiveColumnSpec
      .map((col) => {
        if (typeof col === 'string') {
          return columnMap[col];
        } else if (typeof col === 'object' && col.id && col.header) {
          const originalCol = columnMap[col.id];
          if (!originalCol) return null;

          return {
            ...originalCol,
            header: ({ column }: { column: any }) => (
              <ColumnHeader
                column={column}
                title={col.header}
                align={
                  (originalCol.meta as any)?.className?.includes('text-right')
                    ? 'right'
                    : 'left'
                }
              />
            ),
          };
        }
        return null;
      })
      .filter(Boolean);

    if (nestByLineage) {
      selectedColumns = selectedColumns.map((col) => {
        const columnId = col ? columnDefId(col) : undefined;
        return columnId && LINEAGE_SORTED_COLUMN_IDS.has(columnId)
          ? ({ ...col, sortingFn: 'lineageAware' } as typeof col)
          : col;
      });
    }

    if (groupByVendor) {
      selectedColumns = selectedColumns.filter(
        (col: any) => col?.id !== 'expander',
      );
      const selectColumn = selectedColumns.find(
        (col: any) => col?.id === 'select',
      );
      selectedColumns = selectedColumns.filter(
        (col: any) => col?.id !== 'select',
      );
      if (selectColumn) {
        selectedColumns = [
          selectColumn,
          columnMap['expander'],
          ...selectedColumns,
        ];
      } else {
        selectedColumns = [columnMap['expander'], ...selectedColumns];
      }
    }

    FILTER_COLUMN_IDS.forEach((colId) => {
      const hasColumn = selectedColumns.some(
        (col: any) =>
          col?.id === colId ||
          ('accessorKey' in col && col.accessorKey === colId),
      );
      if (!hasColumn && columnMap[colId]) {
        selectedColumns.push(columnMap[colId]);
      }
    });

    return selectedColumns;
  }, [effectiveColumnSpec, groupByVendor, nestByLineage]);

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

  const table = useReactTable({
    data: tableData,
    columns: columnsToUse as ColumnDef<ContractTableRow, any>[],
    getRowId: (row) => String(row.id),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      expanded,
      pagination,
    },
    onSortingChange: handleSortingChange,
    onRowSelectionChange: setRowSelection,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    enableRowSelection: true,
    enableSubRowSelection: true,
    getSubRows: (row) => row.subRows as ContractTableRow[] | undefined,
    getRowCanExpand: (row) =>
      !!row.original.subRows && row.original.subRows.length > 0,
    paginateExpandedRows: false,
    filterFromLeafRows: false,
    maxLeafRowFilterDepth: 0,
    sortingFns: {
      conditional: conditionalSort,
      lineageAware: lineageAwareDateSort,
    },
    defaultColumn: {
      sortingFn: 'basic',
    },
    filterFns: filterFunctions,
    meta: {
      groupByVendor: groupByVendor,
      nestByLineage: nestByLineage,
      includeReportSubRows: includeReportSubRows,
      isVendorsPage: isVendorsPage,
      userMetadata: userMetadata,
      replacementFlaggedContractIds: replacementFlaggedContractIds,
      reportType: reportType,
      compact: compact,
      enableDiscrepancySheet: enableDiscrepancySheet,
      onCreateFolderRequest: (contractIds: number[]) => {
        setPendingFolderAssignment(contractIds);
        setIsCreateFolderDialogOpen(true);
      },
    },
  });

  const previousExpandedState = React.useRef<string>('');

  React.useEffect(() => {
    const expandedJson = JSON.stringify(expanded);
    if (previousExpandedState.current !== expandedJson) {
      previousExpandedState.current = expandedJson;

      if (expanded !== true) {
        setExpandedState(tableId, expanded);
      }
    }
  }, [expanded, tableId, setExpandedState]);

  // Handle single-select filter change: nuqs is the single source of truth,
  // columnFilters is derived from it
  const handleFilterChange = (filterId: string, value: string) => {
    if (filterId === 'renewalType') {
      setFilterParams({ renewal: value === 'all' ? null : value, page: null });
    } else if (filterId === 'businessSponsor') {
      setFilterParams({ sponsor: value === 'all' ? null : value, page: null });
    } else if (filterId === 'businessGroup') {
      setFilterParams({ group: value === 'all' ? null : value, page: null });
    } else if (filterId === 'invoiceStatus') {
      setFilterParams({ invoiceStatus: value, page: null });
    }
  };

  const handleMultiSelectFilterChange = (
    filterId: string,
    values: string[],
  ) => {
    if (filterId === 'tags') {
      setFilterParams({
        tags: values.length === 0 ? null : values,
        page: null,
      });
    }
  };

  const handleClearAllFilters = () => {
    setFilterParams({
      renewal: null,
      tags: null,
      sponsor: null,
      group: null,
      invoiceStatus: 'all',
      page: null,
    });
  };

  const hasActiveFilters = useMemo(() => {
    // Check column filters
    const hasColumnFilters = columnFilters.some((filter) => {
      const value = filter.value;
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value !== undefined && value !== null && value !== 'all';
    });

    // Also check group filter from URL params
    const hasGroupFilter = Boolean(
      filterParams.group && filterParams.group !== 'all',
    );

    return hasColumnFilters || hasGroupFilter;
  }, [columnFilters, filterParams.group]);

  const handleRowClick = (
    event: React.MouseEvent,
    row: any,
    isProductSubRow: boolean,
  ) => {
    const isVendorOrExpander = (event.target as HTMLElement).closest(
      '[data-column-id="vendor"], [data-column-id="expander"], [data-column-id="select"]',
    );
    const isVendorAndProduct = (event.target as HTMLElement).closest(
      '[data-column-id="vendorAndProduct"]',
    );

    if (isVendorAndProduct) {
      return;
    }

    if (row.original.isGroup) {
      event.stopPropagation();
      row.toggleExpanded();
      return;
    }

    if (
      enableDiscrepancySheet &&
      onRowClick &&
      !isVendorOrExpander &&
      !isProductSubRow
    ) {
      onRowClick(row);
    }
  };

  const handleStatusUpdate = async (status: 'active' | 'inactive') => {
    const selectedRows = getSelectedRows(table, groupByVendor);
    const contractIds = selectedRows.map((row) => row.original.id);

    try {
      const response =
        status === 'inactive'
          ? await requestArchiveWithChildren(
              contractIds,
              confirmArchiveChildren,
            )
          : await fetch('/api/contracts/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contractIds, status }),
            });

      if (!response.ok) throw new Error('Failed to update contracts');

      const result = await response.json();

      toast({
        title: 'Contract Status Updated',
        description: `Successfully updated ${result.data.length} contracts to ${status}.`,
      });

      if (status === 'active') {
        await reactivateChildrenAfterParent(
          contractIds,
          selectReactivateChildren,
        );
      }

      table.toggleAllRowsSelected(false);
      router.refresh();
    } catch (error) {
      console.error('Error updating contract status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update contract status. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleAction = async (action: string) => {
    const selectedRows = getSelectedRows(table, groupByVendor);

    // Handle folder assignment
    if (action.startsWith('folder:')) {
      const folderId = parseInt(action.replace('folder:', ''), 10);
      const contractIds = getContractIdsFromRows(selectedRows);
      await assignToFolder(contractIds, folderId);
      table.toggleAllRowsSelected(false);
      return;
    }

    if (onActionExecute) {
      try {
        await onActionExecute(action, selectedRows);
        table.toggleAllRowsSelected(false);
      } catch (error) {
        logger.error(
          { error, action, selectedRowCount: selectedRows.length },
          'Error executing action on selected contracts',
        );
        toast({
          title: 'Error',
          description: `Failed to execute action. Please try again.`,
          variant: 'destructive',
        });
      }
    } else if (action === 'active' || action === 'inactive') {
      handleStatusUpdate(action as 'active' | 'inactive');
    } else if (
      actionTypes.some((type) =>
        ['confirmIct', 'addIct', 'notIct'].includes(type),
      )
    ) {
      await handleIctProviderUpdate(
        actionTypes.some((type) => ['confirmIct', 'addIct'].includes(type)),
      );
    }
  };

  const handleIctProviderUpdate = async (isIctProvider: boolean) => {
    const selectedRows = getSelectedRows(table, groupByVendor);

    const uniqueVendorIds = Array.from(
      new Set(selectedRows.map((row) => row.original.vendorId)),
    );

    try {
      const response = await fetch('/api/vendors/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorIds: uniqueVendorIds,
          isIctProvider: isIctProvider,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || 'Failed to update ICT provider status',
        );
      }

      const result = await response.json();

      toast({
        title: 'ICT Provider Status Updated',
        description: `Successfully updated ${result.data.length} vendors.`,
      });

      table.toggleAllRowsSelected(false);
      router.refresh();
    } catch (error) {
      console.error('Error updating ICT provider status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update ICT provider status. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleClientExport = async () => {
    try {
      const filename = `${reportType || 'contracts'}-${new Date().toISOString().split('T')[0]}.csv`;
      await exportTableToCSV(table, filename, {
        expandProductSubRows: reportType === 'budget',
      });
      const visibleRowCount = table.getFilteredRowModel().rows.length;
      await logExportBeacon(
        reportType === 'budget'
          ? 'budget-table-client-csv'
          : 'contracts-table-client-csv',
        {
          format: 'csv',
          filename,
          rowCount: visibleRowCount,
          reportType,
        },
      );
    } catch (error) {
      logger.error({ error, reportType }, 'Failed to export table to CSV');
      toast({
        title: 'Export Failed',
        description: 'Failed to export table to CSV. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const filteredContractIds = useMemo(() => {
    const contractIds: number[] = [];

    // Walk the whole subtree, not one level: a lineage chain nests contracts
    // arbitrarily deep, and a partial id set would silently narrow bulk
    // actions and CSV export.
    const collect = (rows: Row<ContractTableRow>[]) => {
      for (const row of rows) {
        if (!row.original.isGroup && !isLeafDetailRow(row)) {
          const id = parseInt(row.id, 10);
          if (!Number.isNaN(id)) contractIds.push(id);
        }
        if (row.subRows.length > 0) collect(row.subRows);
      }
    };
    collect(table.getFilteredRowModel().rows);

    return Array.from(new Set(contractIds));
  }, [table.getFilteredRowModel().rows, columnFilters]);

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const scrollPositionRef = React.useRef(0);

  React.useEffect(() => {
    if (!foldersView) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const historyKey = window.history.state?.key || pathname;
    const storageKey = `table-scroll-${historyKey}`;

    const savedPosition = sessionStorage.getItem(storageKey);

    if (savedPosition) {
      const scrollTop = parseInt(savedPosition, 10);
      if (!isNaN(scrollTop) && scrollTop > 0) {
        setTimeout(() => {
          if (container) {
            container.scrollTop = scrollTop;
            scrollPositionRef.current = scrollTop;
          }
        }, 100);
      }
    }

    const handleScroll = () => {
      scrollPositionRef.current = container.scrollTop;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      if (link && link.href) {
        sessionStorage.setItem(
          storageKey,
          scrollPositionRef.current.toString(),
        );
      }
    };

    document.addEventListener('click', handleClick, true);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      document.removeEventListener('click', handleClick, true);
    };
  }, [foldersView, pathname]);

  const scrollsInPlace = foldersView || fillViewport || stickyHeader;
  const paginationVisible = !hidePagination && table.getPageCount() > 1;
  const visibleColumnIds = table
    .getVisibleLeafColumns()
    .map((column) => column.id);
  const exportColumnIds = visibleColumnIds.filter(
    (id) => !STRUCTURAL_COLUMN_IDS.has(id),
  );
  const stickyCount = scrollsInPlace ? stickyPrefixCount(visibleColumnIds) : 0;
  const stickyOffsets = useStickyPrefixOffsets(scrollContainerRef, stickyCount);
  const pinnedCount = stickyOffsets.length === stickyCount ? stickyCount : 0;

  return (
    <div
      className={cn(
        'relative w-full',
        fillViewport && 'flex min-h-0 flex-1 flex-col',
      )}
    >
      <BulkActionsBar
        actionTypes={actionTypes}
        filters={visibleFilters}
        table={table}
        rowSelection={rowSelection}
        canManageFolder={canManageFolder}
        folders={folders}
        isPending={isPending}
        filterParams={filterParams}
        hasActiveFilters={hasActiveFilters}
        FILTER_CONFIG={FILTER_CONFIG}
        formatRenewalTypeLabel={formatRenewalTypeLabel}
        handleFilterChange={handleFilterChange}
        handleMultiSelectFilterChange={handleMultiSelectFilterChange}
        handleClearAllFilters={handleClearAllFilters}
        handleAction={handleAction}
        openBulkSharingDialog={openBulkSharingDialog}
        setIsCreateFolderDialogOpen={setIsCreateFolderDialogOpen}
        filteredContractIds={filteredContractIds}
        reportType={reportType}
        onClientExport={
          reportType === 'budget' ? handleClientExport : undefined
        }
        columnOrder={exportColumnIds}
        columnsMenu={
          layoutKey ? (
            <ColumnLayoutMenu viewKey={layoutKey} defaults={baseColumnSpec} />
          ) : undefined
        }
      />
      <div
        ref={scrollContainerRef}
        className={cn(
          'rounded-md border',
          foldersView
            ? 'h-[calc(100vh-260px)] overflow-auto'
            : fillViewport
              ? 'min-h-[240px] flex-1 overflow-auto'
              : stickyHeader
                ? 'max-h-[calc(100vh-320px)] min-h-[240px] overflow-auto'
                : 'overflow-x-auto',
          // Reserve the pagination bar's footprint so every report ends at the
          // same baseline whether or not it paginates.
          fillViewport && !paginationVisible && PAGINATION_FOOTPRINT_CLASS,
        )}
      >
        <Table
          className={cn(scrollsInPlace && 'border-separate border-spacing-0')}
        >
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
                        compact && 'px-2',
                        scrollsInPlace &&
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
            {(() => {
              const rows = table.getRowModel().rows;
              const renewalFilter = table
                .getColumn('renewalType')
                ?.getFilterValue();
              const tagsFilter = table.getColumn('tags')?.getFilterValue();
              const hasRenewalFilter = Boolean(
                renewalFilter && renewalFilter !== 'all',
              );
              const hasTagsFilter = Array.isArray(tagsFilter)
                ? tagsFilter.length > 0
                : Boolean(tagsFilter && tagsFilter !== 'all');

              if (rows.length === 0 && hasActiveFilters) {
                return (
                  <TableRow>
                    <TableCell
                      colSpan={table.getVisibleLeafColumns().length}
                      className="h-24 text-center text-sm text-muted-foreground"
                    >
                      No contracts match the criteria
                      {hasRenewalFilter || hasTagsFilter ? (
                        <>
                          {' '}
                          for the selected
                          {hasRenewalFilter && ' renewal type'}
                          {hasRenewalFilter && hasTagsFilter && ' and'}
                          {hasTagsFilter && ' tags'}.
                        </>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              }

              let topLevelCount = -1;
              let subRowCount = 0;
              return rows.map((row, index) => {
                if (row.depth === 0) {
                  topLevelCount++;
                  subRowCount = 0;
                } else {
                  subRowCount++;
                }
                const isProductSubRow = isLeafDetailRow(row);
                const isBanded =
                  row.depth === 0
                    ? topLevelCount % 2 === 1
                    : subRowCount % 2 === 1;
                const isDraggable = foldersView && !isLeafDetailRow(row);
                const isGroupHeader = row.original.isGroup === true;

                const handleDragStart = (e: React.DragEvent) => {
                  const vendor = row.original.vendor || '';
                  const vendorDomain = row.original.vendorDomain || '';
                  let product = '';

                  if (!isGroupHeader) {
                    const products =
                      row.original.currentYearProducts || row.original.product;
                    const productCount = Array.isArray(products)
                      ? products.length
                      : products
                        ? 1
                        : 0;

                    if (productCount > 0) {
                      product = Array.isArray(products)
                        ? products[0]?.vendor_products?.name || ''
                        : typeof products === 'string'
                          ? products
                          : '';
                    }
                  }

                  e.dataTransfer.effectAllowed = 'move';

                  let contractIds: number[] = [];
                  if (isGroupHeader && row.original.subRows) {
                    contractIds = row.original.subRows.map((subRow: any) =>
                      Number(subRow.contract_id),
                    );
                  } else {
                    contractIds = [Number(row.original.contract_id)];
                  }

                  e.dataTransfer.setData(
                    'application/json',
                    JSON.stringify({
                      contractIds,
                      vendor,
                      product,
                      isGroupHeader,
                    }),
                  );

                  const dragImage = document.createElement('div');
                  dragImage.className =
                    'inline-flex items-center gap-2 rounded-md bg-card px-3 py-1.5 text-sm shadow-xl';

                  const vendorIconElement = e.currentTarget.querySelector(
                    'img[alt*="logo"]',
                  ) as HTMLImageElement;
                  const vendorIconSrc = vendorIconElement?.src;

                  let iconHtml = '';
                  if (vendorIconSrc) {
                    iconHtml = `<img src="${escapeHtml(vendorIconSrc)}" alt="${escapeHtml(vendor)}" class="h-7 w-7 border border-border/70 rounded-sm" style="object-fit: contain;" />`;
                  } else {
                    iconHtml = `<div class="flex h-7 w-7 border items-center justify-center rounded-sm bg-gray-700 text-white text-xs">${escapeHtml(vendor.charAt(0))}</div>`;
                  }

                  const truncatedProduct =
                    product.length > 40
                      ? product.substring(0, 40) + '...'
                      : product;

                  dragImage.innerHTML = `
                      ${iconHtml}
                      <div class="flex flex-col whitespace-nowrap">
                        <span class="font-medium text-xs leading-[.9rem]">${escapeHtml(vendor)}</span>
                        ${truncatedProduct ? `<span class="text-xs text-muted-foreground leading-[.9rem]">${escapeHtml(truncatedProduct)}</span>` : isGroupHeader ? `<span class="text-xs text-muted-foreground">All vendor contracts</span>` : ''}
                      </div>
                    `;
                  dragImage.style.position = 'absolute';
                  dragImage.style.top = '-1000px';
                  document.body.appendChild(dragImage);

                  e.dataTransfer.setDragImage(dragImage, -20, 10);

                  setTimeout(() => {
                    document.body.removeChild(dragImage);
                  }, 0);
                };

                const handleShareClick = async () => {
                  // Check if this is a grouped row with multiple contracts
                  if (
                    row.original.isGroup &&
                    row.original.subRows &&
                    row.original.subRows.length > 0
                  ) {
                    // For grouped rows (bulk sharing) - pass subRows directly
                    openBulkSharingDialog(row.original.subRows);
                  } else {
                    // Single contract sharing - dialog will fetch folder ACLs internally
                    openSharingDialog({
                      itemId: row.original.id,
                      itemType: 'contract',
                      contract: {
                        id: row.original.id,
                        vendors: {
                          name: row.original.vendor,
                          domain: row.original.vendorDomain,
                        },
                        contract_types: {
                          id: row.original.typeId,
                          name: row.original.type,
                        },
                        uploaded_by: row.original.uploadedBy,
                      },
                    });
                  }
                };

                const opensDiscrepancySheet =
                  enableDiscrepancySheet && !isProductSubRow;

                const tableRow = (
                  <TableRow
                    key={row.id}
                    draggable={isDraggable}
                    onDragStart={isDraggable ? handleDragStart : undefined}
                    onClick={(e) => handleRowClick(e, row, isProductSubRow)}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    {...(opensDiscrepancySheet && {
                      tabIndex: 0,
                      onKeyDown: (e: React.KeyboardEvent) => {
                        // Only the row itself, not a focused descendant (e.g.
                        // a textarea inside an in-cell dialog), should open
                        // the sheet on Space/Enter — otherwise typing a space
                        // there bubbles up and opens the sheet instead of
                        // inserting the space.
                        if (
                          (e.key === 'Enter' || e.key === ' ') &&
                          e.target === e.currentTarget
                        ) {
                          e.preventDefault();
                          onRowClick?.(row);
                        }
                      },
                    })}
                    className={cn(
                      'group/row leading-[1.15]',
                      opensDiscrepancySheet && 'cursor-pointer',
                      !isProductSubRow &&
                        row.depth === 0 &&
                        isBanded &&
                        'bg-muted/40',
                      !isProductSubRow &&
                        row.depth > 0 &&
                        (isBanded
                          ? 'bg-muted/80 dark:bg-muted/70'
                          : 'bg-muted/50 dark:bg-muted/40'),
                      isProductSubRow &&
                        'bg-gray-700/10 dark:bg-black/25 dark:hover:bg-black/30',
                      row.original.contractStatus &&
                        row.original.contractStatus !== 4 &&
                        'bg-gray-700/10',
                      scrollsInPlace && '[&>td]:border-b',
                      nestByLineage &&
                        row.depth > 0 &&
                        !isLeafDetailRow(row) &&
                        '[&>td:first-child]:shadow-[inset_3px_0_0_0_hsl(var(--primary)/0.35)]',
                      nestByLineage && row.depth === 1 && '[&>td]:pt-5',
                      row.original.isGroup && 'cursor-pointer',
                    )}
                  >
                    {row.getVisibleCells().map((cell, cellIndex) => {
                      const isPinned = cellIndex < pinnedCount;
                      return (
                        <TableCell
                          key={cell.id}
                          data-column-id={cell.column.id}
                          className={cn(
                            cell.column.columnDef.meta?.className,
                            compact && 'px-2 py-2',
                            isPinned && [
                              'left-[var(--sticky-left)]',
                              STICKY_CELL_BASE,
                              STICKY_CELL_STATE,
                              stickyCellTint({
                                depth: row.depth,
                                isBanded,
                                isProductSubRow,
                                isInactive: Boolean(
                                  row.original.contractStatus &&
                                  row.original.contractStatus !== 4,
                                ),
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

                // A Bloomberg rollup row has no contract to share or file.
                if (isSidRollupKey(row.original.id)) {
                  return (
                    <React.Fragment key={row.id}>{tableRow}</React.Fragment>
                  );
                }

                return (
                  <React.Fragment key={row.id}>
                    <ContractRowContextMenu
                      row={row}
                      folders={folders}
                      onShareClick={handleShareClick}
                    >
                      {tableRow}
                    </ContractRowContextMenu>
                  </React.Fragment>
                );
              });
            })()}
          </TableBody>
        </Table>
      </div>
      {!hidePagination && (
        <TablePagination
          table={table}
          hideWhenSinglePage
          onPageChange={updateUrlWithPagination}
        />
      )}

      {/* Create Folder Dialog */}
      <CreateFolderDialog
        open={isCreateFolderDialogOpen}
        onOpenChange={(open) => {
          setIsCreateFolderDialogOpen(open);
          if (!open) {
            setPendingFolderAssignment(null);
          }
        }}
        onFolderCreated={async (folderId, folderName) => {
          const numericFolderId = parseInt(folderId, 10);
          if (!isNaN(numericFolderId)) {
            // If triggered from a cell, use pending assignment
            // Otherwise get IDs from selected rows (bulk action)
            const contractIds =
              pendingFolderAssignment ||
              getContractIdsFromRows(getSelectedRows(table, groupByVendor));

            if (contractIds.length > 0) {
              await assignToFolder(contractIds, numericFolderId);
              table.toggleAllRowsSelected(false);
            }
          }
          setIsCreateFolderDialogOpen(false);
          setPendingFolderAssignment(null);
        }}
        description={
          pendingFolderAssignment
            ? `Enter a name for the new folder. ${pendingFolderAssignment.length > 1 ? 'All contracts' : 'The contract'} will be automatically added to it.`
            : 'Enter a name for the new folder. All selected contracts will be automatically added to it.'
        }
        organizationId={organizationId}
        userId={userId}
      />
    </div>
  );
}
