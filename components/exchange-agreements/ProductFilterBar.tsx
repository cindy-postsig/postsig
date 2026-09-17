'use client';

import { useQueryStates, parseAsArrayOf, parseAsString } from 'nuqs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export interface ProductFilterValues {
  assetClass: string[];
  useType: string[];
  level: string[];
}

export const DEFAULT_PRODUCT_FILTERS: ProductFilterValues = {
  assetClass: [],
  useType: [],
  level: [],
};

interface FilterableRow {
  assetClass: string | null;
  useType: string;
  level: string | null;
}

// Numbered levels (L1, L2, L3, ...) sort numerically ahead of everything
// else (Last Price, Reference Price, N/A, ...), which then falls back to
// alphabetical rather than whatever order they happen to appear in the data.
function compareLevels(a: string, b: string): number {
  const aMatch = /^L(\d+)$/.exec(a);
  const bMatch = /^L(\d+)$/.exec(b);
  if (aMatch && bMatch) return Number(aMatch[1]) - Number(bMatch[1]);
  if (aMatch) return -1;
  if (bMatch) return 1;
  return a.localeCompare(b);
}

export function filterOptionsFrom(rows: FilterableRow[]) {
  const assetClasses = new Set<string>();
  const useTypes = new Set<string>();
  const levels = new Set<string>();
  for (const row of rows) {
    if (row.assetClass) assetClasses.add(row.assetClass);
    useTypes.add(row.useType);
    if (row.level) levels.add(row.level);
  }
  return {
    assetClasses: Array.from(assetClasses).sort((a, b) => a.localeCompare(b)),
    useTypes: Array.from(useTypes).sort((a, b) => a.localeCompare(b)),
    levels: Array.from(levels).sort(compareLevels),
  };
}

// Shared by every consumer of the Asset Class / Use Type / Level filters
// (this filter bar, which sets them, and each view's row list, which reads
// them) so the query-param schema is defined once.
export function useProductFilterParams() {
  return useQueryStates(
    {
      assetClass: parseAsArrayOf(parseAsString).withDefault(
        DEFAULT_PRODUCT_FILTERS.assetClass,
      ),
      useType: parseAsArrayOf(parseAsString).withDefault(
        DEFAULT_PRODUCT_FILTERS.useType,
      ),
      level: parseAsArrayOf(parseAsString).withDefault(
        DEFAULT_PRODUCT_FILTERS.level,
      ),
    },
    { history: 'push' },
  );
}

export function matchesProductFilters(
  row: FilterableRow,
  filters: ProductFilterValues,
): boolean {
  if (
    filters.assetClass.length > 0 &&
    (!row.assetClass || !filters.assetClass.includes(row.assetClass))
  )
    return false;
  if (filters.useType.length > 0 && !filters.useType.includes(row.useType))
    return false;
  if (
    filters.level.length > 0 &&
    (!row.level || !filters.level.includes(row.level))
  )
    return false;
  return true;
}

interface Props {
  assetClasses: string[];
  useTypes: string[];
  levels: string[];
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];
}

function FilterSection({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <AccordionItem value={label} className="border-border">
      <AccordionTrigger className="font-normal px-4 text-base">
        {label}
      </AccordionTrigger>
      <AccordionContent className="pb-3">
        {options.map((option) => (
          <label
            key={option}
            className="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-hover"
          >
            <Checkbox
              checked={selected.includes(option)}
              onCheckedChange={() => onChange(toggleValue(selected, option))}
            />
            {option}
          </label>
        ))}
      </AccordionContent>
    </AccordionItem>
  );
}

// The accordion (grouped with the Product Line row one level up as a single
// divided list) and the Reset button (a standalone control below it) are
// separate exports because they sit in different parts of the sidebar.
export function ProductFilterAccordion({
  assetClasses,
  useTypes,
  levels,
}: Props) {
  const [filters, setFilters] = useProductFilterParams();

  return (
    <Accordion type="multiple">
      <FilterSection
        label="Asset Class"
        options={assetClasses}
        selected={filters.assetClass}
        onChange={(assetClass) => setFilters({ ...filters, assetClass })}
      />
      <FilterSection
        label="Use Type"
        options={useTypes}
        selected={filters.useType}
        onChange={(useType) => setFilters({ ...filters, useType })}
      />
      <FilterSection
        label="Level"
        options={levels}
        selected={filters.level}
        onChange={(level) => setFilters({ ...filters, level })}
      />
    </Accordion>
  );
}

export function ResetFiltersButton() {
  const [filters, setFilters] = useProductFilterParams();
  const selectedCount =
    filters.assetClass.length + filters.useType.length + filters.level.length;
  const disabled = selectedCount === 0;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setFilters(DEFAULT_PRODUCT_FILTERS)}
      className={cn(
        'font-medium w-full rounded-md border border-border py-2 text-sm transition-colors',
        disabled
          ? 'cursor-not-allowed text-muted-foreground/50'
          : 'text-foreground hover:bg-hover',
      )}
    >
      Reset filters{selectedCount > 0 ? ` (${selectedCount})` : ''}
    </button>
  );
}
