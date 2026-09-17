'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MultiSelectFilter } from '@/components/ui/data-table/components/MultiSelectFilter';
import { BulkActionButtons } from './BulkActionButtons';
import { Table } from '@tanstack/react-table';
import { type ContractTableRow } from '@/lib/v2/core/types';
import { type ActionType } from '@/app/lib/definitions';
import ExportReportCSVButton from './ExportReportCSVButton';
import { useCanExportCsv } from '@/hooks/useCanExportCsv';
import { cn } from '@/lib/utils';
import type { FilterType } from './ContractsTableClient';

interface Folder {
  id: number;
  name: string;
}

interface FilterConfig {
  id: string;
  label: string;
  multiSelect?: boolean;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
}

interface BulkActionsBarProps {
  actionTypes: ActionType[];
  filters: FilterType[];
  table: Table<ContractTableRow>;
  rowSelection: Record<string, boolean>;
  canManageFolder: boolean;
  folders: Folder[];
  isPending: boolean;
  filterParams: {
    renewal: string;
    tags: string[];
    sponsor: string;
    group: string;
    invoiceStatus: string;
  };
  hasActiveFilters: boolean;
  FILTER_CONFIG: FilterConfig[];
  formatRenewalTypeLabel: (type: string) => string;
  handleFilterChange: (filterId: string, value: string) => void;
  handleMultiSelectFilterChange: (filterId: string, values: string[]) => void;
  handleClearAllFilters: () => void;
  handleAction: (action: string) => void;
  openBulkSharingDialog?: (rows: any[]) => void;
  setIsCreateFolderDialogOpen: (open: boolean) => void;
  filteredContractIds: number[];
  reportType?: string;
  onClientExport?: () => void;
  columnOrder?: string[];
  columnsMenu?: React.ReactNode;
}

export function BulkActionsBar({
  actionTypes,
  filters,
  table,
  rowSelection,
  canManageFolder,
  folders,
  isPending,
  filterParams,
  hasActiveFilters,
  FILTER_CONFIG,
  formatRenewalTypeLabel,
  handleFilterChange,
  handleMultiSelectFilterChange,
  handleClearAllFilters,
  handleAction,
  openBulkSharingDialog,
  setIsCreateFolderDialogOpen,
  filteredContractIds,
  reportType,
  onClientExport,
  columnOrder,
  columnsMenu,
}: BulkActionsBarProps) {
  const canExportCsv = useCanExportCsv('cpm');
  // Only return null if there is nothing at all to show
  const hasActions = actionTypes.length > 0 && !actionTypes.includes('none');
  const hasFilters = filters.length > 0;

  if (!hasActions && !hasFilters && !columnsMenu) {
    return null;
  }

  // If we have any actionTypes (besides 'none'), always render the container
  // Individual buttons inside will conditionally render based on selections

  // Filter to only actual contract rows (not vendor groups or product subRows) for accurate counts
  const contractRows = table.getSelectedRowModel().flatRows.filter((row) => {
    const original = row.original;
    // Exclude vendor groups
    if (original.isGroup) return false;
    // Exclude product subRows
    if (original.isProductRow) return false;
    // Exclude report subRows that point to a parent contract
    if (original.contract_id && original.contract_id !== original.id)
      return false;
    // Include everything else with an ID
    return !!original.id;
  });
  const contractRowCount = contractRows.length;

  return (
    <div id="tableActions" className="mb-6 flex min-h-8 justify-between gap-2">
      {/* Left container: Filters + Badges + Bulk Actions + DORA Actions */}
      <div className="flex items-center gap-2">
        {/* DORA ICT Actions */}
        {actionTypes.includes('confirmIct') && (
          <Button
            size={'sm'}
            onClick={() => handleAction('true')}
            disabled={contractRowCount === 0}
          >
            Confirm Vendors ({contractRowCount})
          </Button>
        )}

        {actionTypes.includes('addIct') && (
          <Button
            size={'sm'}
            variant={'outline'}
            onClick={() => handleAction('true')}
            disabled={contractRowCount === 0}
          >
            Mark as ICT Vendors ({contractRowCount})
          </Button>
        )}

        {actionTypes.includes('notIct') && (
          <Button
            size={'sm'}
            variant={'outline'}
            onClick={() => handleAction('false')}
            disabled={contractRowCount === 0}
          >
            Remove from ICT Vendors ({contractRowCount})
          </Button>
        )}

        {/* Filters */}
        {filters.length > 0 && (
          <div
            id="filters"
            className="flex items-center gap-2"
            style={{
              opacity: isPending ? 0.6 : 1,
              transition: 'opacity 150ms',
            }}
          >
            {FILTER_CONFIG.map((filter) => {
              if (filter.multiSelect) {
                const currentValue =
                  filter.id === 'tags' ? filterParams.tags : [];
                // For multi-select, remove 'all' option before checking if disabled
                const filteredOptions = filter.options.filter(
                  (opt) => opt.value !== 'all',
                );
                const disabled = filteredOptions.length <= 1;
                return (
                  <div key={filter.id}>
                    <MultiSelectFilter
                      options={filter.options}
                      value={currentValue || []}
                      onValueChange={(values) =>
                        handleMultiSelectFilterChange(filter.id, values)
                      }
                      placeholder={`Select ${filter.label}`}
                      className="w-[180px]"
                      disabled={disabled}
                    />
                  </div>
                );
              } else {
                const currentValue =
                  filter.id === 'renewalType'
                    ? filterParams.renewal
                    : filter.id === 'businessSponsor'
                      ? filterParams.sponsor
                      : filter.id === 'businessGroup'
                        ? filterParams.group
                        : filter.id === 'invoiceStatus'
                          ? filterParams.invoiceStatus
                          : 'all';
                // Keep 'all' option for single-select filters
                const shouldKeepAllOption = [
                  'renewalType',
                  'businessSponsor',
                  'businessGroup',
                  'invoiceStatus',
                ].includes(filter.id);
                const filteredOptions = shouldKeepAllOption
                  ? filter.options
                  : filter.options.filter((opt) => opt.value !== 'all');
                const disabled = filteredOptions.length <= 1;
                // Keep 'all' as selected value for single-select filters
                const shouldShowAllOption = [
                  'renewalType',
                  'businessSponsor',
                  'businessGroup',
                  'invoiceStatus',
                ].includes(filter.id);
                const selectValue = shouldShowAllOption
                  ? currentValue
                  : currentValue === 'all'
                    ? undefined
                    : currentValue;
                const isActive =
                  currentValue !== undefined &&
                  currentValue !== null &&
                  currentValue !== 'all';
                return (
                  <div key={filter.id}>
                    <Select
                      key={`${filter.id}-${selectValue === undefined ? 'empty' : 'filled'}`}
                      onValueChange={(value) =>
                        handleFilterChange(filter.id, value)
                      }
                      value={selectValue}
                      disabled={disabled}
                    >
                      <SelectTrigger
                        className={cn('w-[180px]', isActive && 'font-medium')}
                      >
                        <SelectValue placeholder={`All ${filter.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {filter.options.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            disabled={option.disabled}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
            })}

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
        )}

        {/* Active filter badges */}
        {filters.length > 0 && hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Tag badges */}
            {filterParams.tags &&
              filterParams.tags.map((tag: string) => (
                <Badge key={tag} variant="user" className="gap-0">
                  <span className="text-xs">{tag}</span>
                  <button
                    onClick={() => {
                      const newTags = filterParams.tags.filter(
                        (t: string) => t !== tag,
                      );
                      handleMultiSelectFilterChange('tags', newTags);
                    }}
                    className="ml-1 rounded-full hover:opacity-60"
                    aria-label={`Remove ${tag} filter`}
                  >
                    <span className="sr-only">Remove</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </Badge>
              ))}
          </div>
        )}

        {/* Bulk action buttons */}
        {Object.keys(rowSelection).length > 0 && (
          <BulkActionButtons
            selectedRows={contractRows}
            actionTypes={actionTypes}
            canManageFolder={canManageFolder}
            folders={folders}
            onAction={handleAction}
            onShareClick={() => {
              const selectedRows = contractRows.map((row) => row.original);
              openBulkSharingDialog?.(selectedRows);
            }}
            onCreateFolderClick={() => setIsCreateFolderDialogOpen(true)}
          />
        )}
      </div>

      {/* Right container: column picker + Export */}
      <div className="flex items-center gap-2">
        {columnsMenu}
        {actionTypes.includes('export') && canExportCsv && (
          <div id="export">
            {onClientExport ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onClientExport}
                disabled={filteredContractIds.length === 0}
              >
                Export CSV ({filteredContractIds.length})
              </Button>
            ) : (
              <ExportReportCSVButton
                label={`Export CSV (${filteredContractIds.length})`}
                reportTitle={
                  reportType
                    ? reportType.charAt(0).toUpperCase() + reportType.slice(1)
                    : 'Contracts'
                }
                reportType={reportType}
                contractIds={filteredContractIds}
                columnOrder={columnOrder}
                disabled={filteredContractIds.length === 0}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
