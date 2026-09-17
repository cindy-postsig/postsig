import { FilterConfig } from '../hooks/useTableFilters';

/** What `FilterableColumnHeader` sends for its "Empty" option. */
export const EMPTY_FILTER_TOKEN = '__empty__';

/**
 * The select-popover filter: a row survives when its cell equals one of the
 * chosen values. An empty selection means "all", the header's unset state.
 */
export function selectFilterFn(
  row: { getValue: (id: string) => unknown },
  id: string,
  filterValue: string[],
): boolean {
  if (!filterValue || filterValue.length === 0) return true;

  const value = row.getValue(id);
  const strValue = String(value);

  if (filterValue.includes(EMPTY_FILTER_TOKEN)) {
    if (
      value === null ||
      value === undefined ||
      value === '' ||
      value === 0 ||
      strValue === 'null' ||
      strValue === 'undefined'
    ) {
      return true;
    }
  }

  const regularValues = filterValue.filter((v) => v !== EMPTY_FILTER_TOKEN);
  if (regularValues.length === 0) {
    return false;
  }

  return regularValues.includes(strValue);
}

/**
 * Build dynamic filter options from data
 */
export function buildFilterOptions<T>(
  data: T[],
  filterDefinitions: Omit<FilterConfig, 'options'>[],
): Record<string, { value: string; label: string }[]> {
  const optionsMap: Record<string, { value: string; label: string }[]> = {};

  // Initialize each filter with "all" option
  filterDefinitions.forEach((filter) => {
    optionsMap[filter.id] = [{ value: 'all', label: `All ${filter.label}` }];
  });

  // Create maps to track unique values for each filter
  const uniqueValuesMap: Record<string, Set<string>> = {};
  filterDefinitions.forEach((filter) => {
    uniqueValuesMap[filter.id] = new Set<string>();
  });

  // Special handler for tags which have a nested structure
  const processTags = (item: any) => {
    if (!uniqueValuesMap['tags'] || !optionsMap['tags']) return;
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

  // Special handler for businessGroups which have a nested structure
  const processBusinessGroups = (item: any) => {
    if (!uniqueValuesMap['businessGroup'] || !optionsMap['businessGroup'])
      return;
    if (item.businessGroups && Array.isArray(item.businessGroups)) {
      item.businessGroups.forEach((group: any) => {
        const groupId = String(group.id);
        if (
          group.id &&
          group.name &&
          !uniqueValuesMap['businessGroup'].has(groupId)
        ) {
          uniqueValuesMap['businessGroup'].add(groupId);
          optionsMap['businessGroup'].push({
            value: groupId,
            label: group.name,
          });
        }
      });
    }
  };

  // Generic handler for standard column values
  const processStandardValue = (
    item: any,
    filterId: string,
    column: string,
  ) => {
    // Skip tags and businessGroup, handled separately
    if (filterId === 'tags' || filterId === 'businessGroup') return;

    const value = item[column];

    // Handle array values (like deliveryMethods)
    if (Array.isArray(value)) {
      value.forEach((arrayItem: any) => {
        if (
          arrayItem &&
          typeof arrayItem === 'string' &&
          arrayItem.trim() !== ''
        ) {
          if (!uniqueValuesMap[filterId].has(arrayItem)) {
            uniqueValuesMap[filterId].add(arrayItem);
            optionsMap[filterId].push({
              value: arrayItem,
              label: arrayItem,
            });
          }
        }
      });
    }
    // Handle string values
    else if (value && typeof value === 'string' && value.trim() !== '') {
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
    processBusinessGroups(item);
    filterDefinitions.forEach((filter) => {
      if (filter.id !== 'tags' && filter.id !== 'businessGroup') {
        processStandardValue(item, filter.id, filter.column);
      }
    });
  };

  data.forEach((item: any) => {
    processItem(item);
    if (item.subRows && Array.isArray(item.subRows)) {
      item.subRows.forEach((subRow: any) => {
        processItem(subRow);
      });
    }
  });

  // Sort options alphabetically
  Object.keys(optionsMap).forEach((filterId) => {
    optionsMap[filterId].sort((a, b) => {
      if (a.value === 'all') return -1; // "All" options should always be first
      if (b.value === 'all') return 1;
      return a.label.localeCompare(b.label);
    });
  });

  return optionsMap;
}

/**
 * Create custom filter functions for different data types
 */
export const filterFunctions = {
  // Standard filter function that matches the row itself or any of its subrows
  subrowAware: (row: any, columnId: string, filterValue: any) => {
    // Skip empty filters or "all" value
    if (!filterValue || filterValue === 'all') return true;

    // Skip empty arrays
    if (Array.isArray(filterValue) && filterValue.length === 0) return true;

    const filter = [{ id: columnId, value: filterValue }];

    // Recursive, not one level: with `maxLeafRowFilterDepth: 0` this runs only
    // on top-level rows, so a match on a grandchild — an amendment nested
    // under an order form — has to be found from here or its whole group
    // disappears.
    type FilterableRow = { subRows?: FilterableRow[] };
    const matchesAnyDescendant = (item: FilterableRow): boolean => {
      if (matchesAllActiveFiltersForRow(item, filter)) return true;
      return (
        Array.isArray(item?.subRows) && item.subRows.some(matchesAnyDescendant)
      );
    };

    return matchesAnyDescendant(row.original);
  },

  // Simple string matching for arrays - handles exact matches
  arrayIncludes: (row: any, columnId: string, filterValue: any) => {
    if (!filterValue || filterValue === 'all') return true;
    const value = row.getValue(columnId);

    if (Array.isArray(value)) {
      if (Array.isArray(filterValue)) {
        // Multi-select: check if any filter value matches any array value exactly
        return filterValue.some((fv) =>
          value.some(
            (v) => String(v).toLowerCase() === String(fv).toLowerCase(),
          ),
        );
      } else {
        // Single select: check if filter value matches any array value exactly
        return value.some(
          (v) => String(v).toLowerCase() === String(filterValue).toLowerCase(),
        );
      }
    }
    return false;
  },
};

/**
 * Helper: check if a data item matches ALL active column filters.
 */
export function matchesAllActiveFiltersForRow(
  item: any,
  activeFilters: Array<{ id: string; value: any }>,
): boolean {
  if (!activeFilters || activeFilters.length === 0) return true;

  return activeFilters.every(({ id: filterColumnId, value: filterValue }) => {
    // Ignore empty filters
    if (
      filterValue === undefined ||
      filterValue === null ||
      filterValue === 'all' ||
      (Array.isArray(filterValue) && filterValue.length === 0)
    ) {
      return true;
    }

    const prop = filterColumnId.includes('.')
      ? filterColumnId.split('.').pop()!
      : filterColumnId;

    // Tags: item.tags: { name }[]; filterValue can be string or string[]
    if (prop === 'tags') {
      const tags = item?.tags;
      if (!Array.isArray(tags)) return false;
      if (Array.isArray(filterValue)) {
        // Any selected tag matches
        return filterValue.some((selected) =>
          tags.some(
            (t: any) =>
              String(t?.name ?? '')?.toLowerCase() ===
              String(selected).toLowerCase(),
          ),
        );
      }
      return tags.some(
        (t: any) =>
          String(t?.name ?? '')?.toLowerCase() ===
          String(filterValue).toLowerCase(),
      );
    }

    // businessSponsor: item.businessSponsor: string[]; filterValue: string
    if (prop === 'businessSponsor') {
      const sponsors = item?.businessSponsor;
      if (Array.isArray(sponsors)) {
        if (Array.isArray(filterValue)) {
          // Generally single-select, but support array -> any match
          return filterValue.some((fv) => sponsors.includes(fv));
        }
        return sponsors.includes(filterValue);
      }
      // Handle string sponsor values
      if (typeof sponsors === 'string' && sponsors.trim() !== '') {
        if (Array.isArray(filterValue)) {
          return filterValue.some((fv) => String(sponsors) === String(fv));
        }
        return String(sponsors) === String(filterValue);
      }
      return false;
    }

    // businessGroup: item.businessGroups: { id, name }[]; filterValue: id string
    if (prop === 'businessGroup') {
      const groups = item?.businessGroups;
      if (!Array.isArray(groups)) return false;
      if (Array.isArray(filterValue)) {
        return filterValue.some((fv) =>
          groups.some((g: any) => String(g?.id) === String(fv)),
        );
      }
      return groups.some((g: any) => String(g?.id) === String(filterValue));
    }

    // Standard scalar comparison (string/number/boolean)
    const value = item?.[prop as keyof typeof item];
    if (Array.isArray(value)) {
      // If the item's value is an array, allow any-equals matching
      if (Array.isArray(filterValue)) {
        return filterValue.some((fv) =>
          value.some((v: any) => String(v) === String(fv)),
        );
      }
      return value.some((v: any) => String(v) === String(filterValue));
    }
    return String(value) === String(filterValue);
  });
}
