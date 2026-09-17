'use client';

import { ProcessedContract } from '@/app/lib/definitions';

export type ContractFilterParams = {
  renewal: string;
  tags: string[];
  sponsor: string;
  group: string;
  invoiceStatus: string;
};

export type ContractFilterUrlKeys = {
  renewal: string;
  tags: string;
  sponsor: string;
  group: string;
  invoiceStatus: string;
  page: string;
};

/**
 * Namespaces the filter query-string keys so multiple ContractsTableClient
 * instances on one page (e.g. the renewals report's three sections) don't
 * read/write the same URL params and leak filter state into each other.
 */
export const buildFilterUrlKeys = (
  prefix?: string,
): Partial<ContractFilterUrlKeys> | undefined => {
  if (!prefix) return undefined;

  return {
    renewal: `${prefix}Renewal`,
    tags: `${prefix}Tags`,
    sponsor: `${prefix}Sponsor`,
    group: `${prefix}Group`,
    invoiceStatus: `${prefix}InvoiceStatus`,
    page: `${prefix}Page`,
  };
};

export const buildColumnFilters = (
  params: ContractFilterParams,
): Array<{ id: string; value: string | string[] }> => {
  const filters: Array<{ id: string; value: string | string[] }> = [];
  if (params.renewal !== 'all') {
    filters.push({ id: 'renewalType', value: params.renewal });
  }
  if (params.tags.length > 0) {
    filters.push({ id: 'tags', value: params.tags });
  }
  if (params.sponsor !== 'all') {
    filters.push({ id: 'businessSponsor', value: params.sponsor });
  }
  if (params.group !== 'all') {
    filters.push({ id: 'businessGroup', value: params.group });
  }
  if (params.invoiceStatus !== 'all') {
    filters.push({ id: 'invoiceStatus', value: params.invoiceStatus });
  }
  return filters;
};

/**
 * Checks if a row or any of its subrows matches all filters
 */
export const rowOrSubrowsMatchAllFilters = (row: any, columnFilters: any[]) => {
  // No filters? Then all rows match
  if (!columnFilters.length) return true;

  // Helper function to check if an object matches all filters
  const objectMatchesAllFilters = (obj: any) => {
    return columnFilters.every((filter) => {
      // Skip empty or "all" filters
      if (!filter.value || filter.value === 'all') return true;

      // Special handling for tags
      if (filter.id === 'tags') {
        if (obj.tags && Array.isArray(obj.tags)) {
          return obj.tags.some(
            (tag: any) =>
              tag.name?.toLowerCase() === filter.value.toLowerCase(),
          );
        }
        return false;
      }

      // Standard column comparison
      return obj[filter.id] === filter.value;
    });
  };

  // Check if the main row matches all filters
  if (objectMatchesAllFilters(row.original)) {
    return true;
  }
  // Check if any subrow matches all filters
  if (row.original.subRows && Array.isArray(row.original.subRows)) {
    return row.original.subRows.some((subRow: ProcessedContract) =>
      objectMatchesAllFilters(subRow),
    );
  }

  return false;
};
