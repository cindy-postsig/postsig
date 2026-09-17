import { FilterConfig } from '../hooks/useTableFilters';

export type FilterValues = Record<string, string | string[]>;

export function parseFilterValuesFromURL(
  searchParams: URLSearchParams,
  filterConfig: FilterConfig[],
): FilterValues {
  return filterConfig.reduce((acc, filter) => {
    const urlValue = searchParams.get(filter.urlParam);

    if (filter.multiSelect) {
      // For multi-select, parse comma-separated values
      if (urlValue && urlValue !== 'all') {
        acc[filter.id] = urlValue
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
          .map((v) => {
            // Try to find matching option by comparing case-insensitive
            const matchingOption = filter.options.find(
              (opt) => opt.value.toLowerCase() === v.toLowerCase(),
            );
            return matchingOption ? matchingOption.value : v;
          });
      } else {
        acc[filter.id] = [];
      }
    } else if (filter.id === 'renewalType' && urlValue === 'one-time') {
      // Special case for "one-time" to transform it to "One-Time"
      acc[filter.id] = 'One-Time';
    } else {
      // For single-select filters, try to find exact match from options first
      if (urlValue && urlValue !== 'all') {
        const matchingOption = filter.options.find(
          (opt) => opt.value.toLowerCase() === urlValue.toLowerCase(),
        );
        acc[filter.id] = matchingOption
          ? matchingOption.value
          : // Fallback: capitalize first letter for legacy compatibility
            urlValue.charAt(0).toUpperCase() + urlValue.slice(1);
      } else {
        acc[filter.id] = 'all';
      }
    }

    return acc;
  }, {} as FilterValues);
}

export function buildURLSearchParams(
  currentParams: URLSearchParams,
  filterConfig: FilterConfig[],
  newFilters: FilterValues,
): URLSearchParams {
  const current = new URLSearchParams(Array.from(currentParams.entries()));

  // Update URL for each filter
  filterConfig.forEach((filter) => {
    const value = newFilters[filter.id];

    if (filter.multiSelect && Array.isArray(value)) {
      // Handle multi-select filters (arrays)
      if (value.length === 0) {
        current.delete(filter.urlParam);
      } else {
        current.set(
          filter.urlParam,
          value.map((v) => v.toLowerCase()).join(','),
        );
      }
    } else if (
      value === 'all' ||
      (Array.isArray(value) && value.length === 0)
    ) {
      current.delete(filter.urlParam);
    } else if (typeof value === 'string') {
      current.set(filter.urlParam, value.toLowerCase());
    }
  });

  // Reset to first page when filters change
  current.delete('page');

  return current;
}

export function debounceUrlUpdate(
  fn: (newFilters: FilterValues) => void,
  delay: number = 300,
) {
  let timeoutId: NodeJS.Timeout;

  return (newFilters: FilterValues) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(newFilters), delay);
  };
}

export function updateUrlWithFilters(
  router: any,
  pathname: string,
  searchParams: URLSearchParams,
  filterConfig: FilterConfig[],
  newFilters: FilterValues,
) {
  const current = buildURLSearchParams(searchParams, filterConfig, newFilters);
  const search = current.toString();
  const query = search ? `?${search}` : '';

  // Use replace instead of push to avoid adding to history stack
  router.replace(`${pathname}${query}`, { scroll: false });
}
