import logger from '@/utils/pino';
import { firstDate } from '@/lib/shared/dateUtils';
import { contractOwners, isSponsoredBy } from '@/lib/v2/owners/embed';
import { normalizeOrderNumber } from '@/lib/v2/contracts/orderNumber';

export interface ContractFilterOptions {
  hideFailed?: boolean;
  contractStatus?: number;
  status?: string;
  renewalType?: string;
  range?: number;
  isPending?: boolean;
  myContractsOnly?: boolean;
  contractFields?: string[];
  query?: string;
  startDate?: string;
  endDate?: string;
  reportType?: string;
  typeId?: number; // Filter by contract type_id
}

/**
 * Field set mirrors the `contract_search` tsvector (summary, vendor, products,
 * type, tags, asset classes, order number) plus `title`, so the in-memory path
 * matches at least everything the retired DB text search did.
 */
interface SearchableContractRow {
  title?: string | null;
  summary?: string | null;
  vendors?: { name?: string | null } | null;
  vendor_products_details?: Array<{
    vendor_products?: { name?: string | null } | null;
    product_name?: string | null;
  } | null> | null;
  contract_types?: { name?: string | null } | null;
  contract_tags?: Array<{
    user_tags?: { name?: string | null } | null;
  } | null> | null;
  contract_asset_classes?: Array<{
    asset_classes?: { name?: string | null } | null;
  } | null> | null;
  metadata?: { lineage?: { order_number?: unknown } | null } | null;
}

export function contractMatchesQuery(
  contract: SearchableContractRow,
  query: string,
): boolean {
  const searchQuery = query.toLowerCase();
  const searchFields = [
    contract.title,
    contract.summary,
    contract.vendors?.name,
    (contract.vendor_products_details ?? [])
      .map((p) => p?.vendor_products?.name ?? p?.product_name ?? '')
      .join(' '),
    contract.contract_types?.name,
    (contract.contract_tags ?? [])
      .map((t) => t?.user_tags?.name ?? '')
      .join(' '),
    (contract.contract_asset_classes ?? [])
      .map((ac) => ac?.asset_classes?.name ?? '')
      .join(' '),
  ];
  if (
    searchFields.some((field) => field?.toLowerCase().includes(searchQuery))
  ) {
    return true;
  }

  const normalizedQuery = normalizeOrderNumber(searchQuery);
  if (!normalizedQuery) return false;
  const orderNumber = contract.metadata?.lineage?.order_number;
  return (
    typeof orderNumber === 'string' &&
    normalizeOrderNumber(orderNumber).includes(normalizedQuery)
  );
}

export function filterContracts(
  contracts: any[],
  options: ContractFilterOptions = {},
  userMetadata?: any,
): any[] {
  let filteredContracts = [...contracts];
  const startTime = Date.now();

  if (options.hideFailed) {
    filteredContracts = filteredContracts.filter(
      (contract) =>
        !['ai_failed', 'h_failed'].includes(contract.ai_extraction_status),
    );
  }

  if (options.isPending) {
    filteredContracts = filteredContracts.filter(
      (contract) => contract.status_id !== 4,
    );
  } else if (options.contractStatus) {
    filteredContracts = filteredContracts.filter(
      (contract) => contract.status_id === options.contractStatus,
    );
  }

  if (options.status) {
    const beforeCount = filteredContracts.length;
    const allStatuses = [...new Set(filteredContracts.map((c) => c.status))];
    filteredContracts = filteredContracts.filter(
      (contract) => contract.status === options.status,
    );
    logger.debug(
      {
        requestedStatus: options.status,
        beforeCount,
        afterCount: filteredContracts.length,
        allStatusesInContracts: allStatuses,
        sampleStatuses: filteredContracts.slice(0, 3).map((c) => c.status),
      },
      'Filtered by status',
    );
  }

  if (options.renewalType) {
    filteredContracts = filteredContracts.filter(
      (contract) => contract.renewal_type === options.renewalType,
    );
  }

  if (options.typeId) {
    filteredContracts = filteredContracts.filter(
      (contract) => contract.type_id === options.typeId,
    );
  }

  if (options.range && options.range > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rangeDate = new Date(today.getTime() + options.range * 86400000);

    filteredContracts = filteredContracts.filter((contract) => {
      const cancel = firstDate(contract.cancel_date ?? contract.cancel_by_date);
      const end = firstDate(contract.term_end_date);
      const relevantDate = cancel ?? end;
      return relevantDate && relevantDate <= rangeDate && relevantDate >= today;
    });
  }

  if (options.myContractsOnly && userMetadata) {
    filteredContracts = filteredContracts.filter((contract) =>
      isSponsoredBy(contractOwners(contract), {
        userId: userMetadata.userId,
        name: userMetadata.userProfile?.name,
        email: userMetadata.userProfile?.email,
      }),
    );
  }

  if (options.contractFields && options.contractFields.length > 0) {
    filteredContracts = filteredContracts.map((contract) => {
      const filteredContract = { ...contract };

      options.contractFields!.forEach((field) => {
        if (!(field in contract)) {
          filteredContract[field] = null;
        }
      });

      return filteredContract;
    });
  }

  if (options.query) {
    const query = options.query;
    filteredContracts = filteredContracts.filter((contract) =>
      contractMatchesQuery(contract, query),
    );
  }

  if (options.startDate && options.endDate) {
    const start = new Date(options.startDate);
    const end = new Date(options.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    filteredContracts = filteredContracts.filter((contract) => {
      const contractDate = firstDate(contract.term_start_date);
      return contractDate && contractDate >= start && contractDate <= end;
    });
  }

  const processingTime = Date.now() - startTime;

  logger.debug(
    {
      originalCount: contracts.length,
      filteredCount: filteredContracts.length,
      processingTime,
      filters: Object.keys(options).filter(
        (key) => options[key as keyof ContractFilterOptions] !== undefined,
      ),
    },
    'Filtered contracts client-side',
  );

  return filteredContracts;
}

/**
 * Filter contracts by date range for calendar views
 * Returns contracts grouped by date type (start, end, cancel)
 */
export function filterContractsByDateRange(
  contracts: any[],
  startDate: string,
  endDate: string,
): {
  uniqueData: any[];
  startDateContracts: any[];
  endDateContracts: any[];
  cancelDateContracts: any[];
} {
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  // Use filterContracts to apply standard filtering (failed, inactive, status_id = 4)
  const activeContracts = filterContracts(contracts, {
    hideFailed: true,
    contractStatus: 4, // Only active contracts
    status: undefined, // Don't filter by status string since we check inactive below
  }).filter((contract) => contract.status !== 'inactive');

  // Helper function to check if a date array contains a date in range
  const hasDateInRange = (dateArray: any[] | null | undefined) => {
    if (!dateArray || !Array.isArray(dateArray)) return false;
    return dateArray.some((dateObj) => {
      if (!dateObj?.date) return false;
      const date = new Date(dateObj.date);
      return date >= start && date <= end;
    });
  };

  // Filter contracts by date ranges
  const startDateContracts = activeContracts.filter((contract) =>
    hasDateInRange(contract.term_start_date),
  );

  const endDateContracts = activeContracts.filter((contract) =>
    hasDateInRange(contract.term_end_date),
  );

  // Check cancel_date field
  const cancelDateContracts = activeContracts.filter((contract) =>
    hasDateInRange(contract.cancel_date),
  );

  // Get unique contracts (any contract that appears in any of the three lists)
  const uniqueContractIds = new Set([
    ...startDateContracts.map((c) => c.id),
    ...endDateContracts.map((c) => c.id),
    ...cancelDateContracts.map((c) => c.id),
  ]);

  const uniqueData = activeContracts.filter((contract) =>
    uniqueContractIds.has(contract.id),
  );

  return {
    uniqueData,
    startDateContracts,
    endDateContracts,
    cancelDateContracts,
  };
}
