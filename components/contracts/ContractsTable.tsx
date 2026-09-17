import { type ActionType } from '@/app/lib/definitions';
import { type ContractTableRow } from '@/lib/v2/core/types';
import { ContractsTableClient, type FilterType } from './ContractsTableClient';
import { getUserMetadata } from '@/data/users';
import { buildContractTableRows } from '@/lib/v2/contracts/transforms';
import { type EnrichedContract } from '@/lib/v2/contracts/service';
import logger from '@/utils/pino';
import { type ColumnLayoutViewKey } from './columnLayout';
import type { RelationshipEdge } from '@/lib/v2/spend';

type CustomColumn = {
  id: string;
  header: string;
};

type ContractsTableProps = {
  contracts: EnrichedContract[];
  columns?: readonly (string | CustomColumn)[];
  groupByVendor?: boolean;
  itemsPerPage?: number;
  isVendorsPage?: boolean;
  hidePagination?: boolean;
  reportType?: string;
  actionType?: ActionType | ActionType[];
  onActionExecute?: (action: string, selectedRows: any[]) => Promise<void>;
  onFilteredIdsChange?: (contractIds: number[]) => void;
  defaultSortColumn?: string;
  defaultSortDirection?: 'asc' | 'desc';
  compact?: boolean;
  foldersView?: boolean;
  filters?: FilterType[];
  defaultInvoiceStatus?: string;
  layoutKey?: ColumnLayoutViewKey;
  stickyHeader?: boolean;
  /** Nest contracts under their MSA/SO parents. Needs `relationships`. */
  nestByLineage?: boolean;
  relationships?: readonly RelationshipEdge[];
  replacementFlaggedContractIds?: readonly number[];
  /** Rows with no contract behind them (the Bloomberg seat rollup), listed after the contracts. */
  extraRows?: ContractTableRow[];
};

/**
 * Validates that an object has the required keys to be a ContractTableRow
 */
function isValidContractTableRow(obj: unknown): obj is ContractTableRow {
  if (!obj || typeof obj !== 'object') return false;

  const row = obj as Record<string, unknown>;

  // Check required fields that should always be present
  return (
    typeof row.id === 'string' &&
    typeof row.vendor === 'string' &&
    typeof row.vendorId === 'string' &&
    (typeof row.type === 'string' || Array.isArray(row.type)) &&
    typeof row.typeId === 'number'
  );
}

/**
 * Validates that data is an array of valid ContractTableRow objects
 */
function validateContractTableRows(
  data: unknown[],
): asserts data is ContractTableRow[] {
  if (!Array.isArray(data)) {
    const error = new Error('ContractsTable: data must be an array');
    logger.error({ data }, error.message);
    throw error;
  }

  const invalidRows = data.filter((item, index) => {
    const isValid = isValidContractTableRow(item);
    if (!isValid) {
      logger.warn(
        { index, item, keys: Object.keys(item || {}) },
        'ContractsTable: Invalid ContractTableRow at index',
      );
    }
    return !isValid;
  });

  if (invalidRows.length > 0) {
    const error = new Error(
      `ContractsTable: data contains ${invalidRows.length} invalid row(s). Expected ContractTableRow[] with required keys: id, vendor, vendorId, type, typeId`,
    );
    logger.error(
      { invalidCount: invalidRows.length, sampleInvalid: invalidRows[0] },
      error.message,
    );
    throw error;
  }
}

export default async function ContractsTable({
  contracts,
  columns,
  groupByVendor = false,
  itemsPerPage = 50,
  isVendorsPage = false,
  hidePagination = false,
  reportType,
  actionType = 'none',
  onActionExecute,
  defaultSortColumn = 'termEndDate',
  defaultSortDirection = 'asc',
  compact = false,
  foldersView = false,
  filters,
  layoutKey,
  stickyHeader = false,
  nestByLineage = false,
  relationships,
  defaultInvoiceStatus,
  replacementFlaggedContractIds,
  extraRows = [],
}: ContractsTableProps) {
  const userMetadata = await getUserMetadata();

  if (!userMetadata) {
    throw new Error('User metadata is required');
  }

  // Transform domain data to table rows
  const data = [
    ...buildContractTableRows(contracts, {
      groupByVendor,
      nestByLineage,
      relationships,
    }),
    ...extraRows,
  ];

  if (data.length > 0) {
    validateContractTableRows(data);
  }

  return (
    <ContractsTableClient
      data={data}
      replacementFlaggedContractIds={replacementFlaggedContractIds}
      columns={columns}
      groupByVendor={groupByVendor}
      itemsPerPage={itemsPerPage}
      isVendorsPage={isVendorsPage}
      hidePagination={hidePagination}
      userMetadata={userMetadata}
      reportType={reportType}
      actionType={actionType}
      onActionExecute={onActionExecute}
      defaultSortColumn={defaultSortColumn}
      defaultSortDirection={defaultSortDirection}
      compact={compact}
      foldersView={foldersView}
      filters={filters}
      layoutKey={layoutKey}
      stickyHeader={stickyHeader}
      nestByLineage={nestByLineage}
      defaultInvoiceStatus={defaultInvoiceStatus}
    />
  );
}
