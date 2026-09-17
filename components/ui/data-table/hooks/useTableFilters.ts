'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ColumnFiltersState } from '@tanstack/react-table';
import {
  parseFilterValuesFromURL,
  debounceUrlUpdate,
  updateUrlWithFilters,
  type FilterValues,
} from '../utils/urlUtils';

export type FilterConfig = {
  id: string;
  label: string;
  options: {
    value: string;
    label: string;
  }[];
  column: string;
  urlParam: string;
  filterFn?: string;
  multiSelect?: boolean;
};

interface UseTableFiltersOptions {
  enableUrlSync?: boolean;
  resetPageOnFilter?: boolean;
}

export function useTableFilters(
  filterConfig: FilterConfig[],
  options: UseTableFiltersOptions = {},
) {
  const { enableUrlSync = true, resetPageOnFilter = true } = options;
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [localFilterValues, setLocalFilterValues] = useState<FilterValues>({});

  // Parse filter values from URL
  const filterValues = useMemo(() => {
    if (!enableUrlSync) return {};
    return parseFilterValuesFromURL(searchParams, filterConfig);
  }, [searchParams, filterConfig, enableUrlSync]);

  // Debounced URL update function
  const debouncedUrlUpdate = useMemo(() => {
    if (!enableUrlSync) return () => {};

    return debounceUrlUpdate((newFilters: FilterValues) => {
      updateUrlWithFilters(
        router,
        pathname,
        searchParams,
        filterConfig,
        newFilters,
      );
    });
  }, [router, pathname, searchParams, filterConfig, enableUrlSync]);

  // Apply initial filters from URL params on component mount
  useEffect(() => {
    if (!enableUrlSync) return;

    const currentFilters = parseFilterValuesFromURL(searchParams, filterConfig);

    // Initialize localFilterValues with URL values for UI display
    setLocalFilterValues(currentFilters);

    // For each filter value from URL
    Object.entries(currentFilters).forEach(([filterId, value]) => {
      const shouldApplyFilter = Array.isArray(value)
        ? value.length > 0
        : value !== 'all';

      if (shouldApplyFilter) {
        const filterConfigItem = filterConfig.find((f) => f.id === filterId);
        if (filterConfigItem) {
          // Update column filters state
          setColumnFilters((prev) => {
            const existingFilter = prev.find(
              (f) => f.id === filterConfigItem.column,
            );
            const newFilter = { id: filterConfigItem.column, value };

            if (existingFilter) {
              return prev.map((f) =>
                f.id === filterConfigItem.column ? newFilter : f,
              );
            } else {
              return [...prev, newFilter];
            }
          });
        }
      }
    });
  }, [searchParams, filterConfig, enableUrlSync]);

  // Handle single-select filter change
  const handleFilterChange = useCallback(
    (filterId: string, value: string, table?: any) => {
      const filterConfigItem = filterConfig.find((f) => f.id === filterId);
      if (!filterConfigItem) return;

      // Update local state immediately for responsive UI
      setLocalFilterValues((prev) => ({
        ...prev,
        [filterId]: value,
      }));

      // Update table filter if table is provided
      if (table) {
        if (value === 'all') {
          table.getColumn(filterConfigItem.column)?.setFilterValue(undefined);
        } else {
          const column = table.getColumn(filterConfigItem.column);
          if (column) {
            column.setFilterValue(value);
            // Set filter function if specified
            if (filterConfigItem.filterFn) {
              column.columnDef.filterFn = filterConfigItem.filterFn;
            }
          }
        }
      }

      // Update column filters state
      setColumnFilters((prev) => {
        if (value === 'all') {
          return prev.filter((f) => f.id !== filterConfigItem.column);
        } else {
          const existingFilter = prev.find(
            (f) => f.id === filterConfigItem.column,
          );
          const newFilter = { id: filterConfigItem.column, value };

          if (existingFilter) {
            return prev.map((f) =>
              f.id === filterConfigItem.column ? newFilter : f,
            );
          } else {
            return [...prev, newFilter];
          }
        }
      });

      // Debounced URL update
      if (enableUrlSync) {
        const newFilters = { ...filterValues, [filterId]: value };
        debouncedUrlUpdate(newFilters);
      }
    },
    [filterConfig, filterValues, debouncedUrlUpdate, enableUrlSync],
  );

  // Handle multi-select filter change
  const handleMultiSelectFilterChange = useCallback(
    (filterId: string, values: string[], table?: any) => {
      const filterConfigItem = filterConfig.find((f) => f.id === filterId);
      if (!filterConfigItem) return;

      // Update local state immediately for responsive UI
      setLocalFilterValues((prev) => ({
        ...prev,
        [filterId]: values,
      }));

      // Update table filter if table is provided
      if (table) {
        const column = table.getColumn(filterConfigItem.column);
        if (column) {
          if (values.length === 0) {
            column.setFilterValue(undefined);
          } else {
            column.setFilterValue(values);
            // Set filter function if specified
            if (filterConfigItem.filterFn) {
              column.columnDef.filterFn = filterConfigItem.filterFn;
            }
          }
        }
      }

      // Update column filters state
      setColumnFilters((prev) => {
        if (values.length === 0) {
          return prev.filter((f) => f.id !== filterConfigItem.column);
        } else {
          const existingFilter = prev.find(
            (f) => f.id === filterConfigItem.column,
          );
          const newFilter = { id: filterConfigItem.column, value: values };

          if (existingFilter) {
            return prev.map((f) =>
              f.id === filterConfigItem.column ? newFilter : f,
            );
          } else {
            return [...prev, newFilter];
          }
        }
      });

      // Debounced URL update
      if (enableUrlSync) {
        const newFilters = { ...filterValues, [filterId]: values };
        debouncedUrlUpdate(newFilters);
      }
    },
    [filterConfig, filterValues, debouncedUrlUpdate, enableUrlSync],
  );

  return {
    columnFilters,
    setColumnFilters,
    localFilterValues,
    filterValues,
    handleFilterChange,
    handleMultiSelectFilterChange,
  };
}
