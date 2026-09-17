'use client';

import { Column, Table } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, ListFilter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandGroup,
  CommandEmpty,
} from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';

export interface RangeFilter {
  min?: number;
  max?: number;
}

export type FilterValue = string[] | RangeFilter;

interface TableMeta {
  filters?: Record<string, FilterValue>;
  onFilterChange?: (columnId: string, values: FilterValue) => void;
}

interface FilterableColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>;
  table: Table<TData>;
  title: string;
  align?: 'left' | 'right';
  filterType?: 'select' | 'range';
}

function isRangeFilter(value: FilterValue | undefined): value is RangeFilter {
  return (
    value !== undefined &&
    !Array.isArray(value) &&
    typeof value === 'object' &&
    ('min' in value || 'max' in value)
  );
}

function formatCurrencyInput(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function parseCurrencyInput(value: string): number | undefined {
  const cleaned = value.replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

function formatNumberWithCommas(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '');
  if (!cleaned) return '';

  const parts = cleaned.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return parts.join('.');
}

export function FilterableColumnHeader<TData, TValue>({
  column,
  table,
  title,
  align = 'left',
  filterType = 'select',
}: FilterableColumnHeaderProps<TData, TValue>) {
  const [open, setOpen] = useState(false);

  const isSorted = column.getIsSorted();

  const meta = table.options.meta as TableMeta | undefined;
  const columnId = column.id;
  const filterValue = meta?.filters?.[columnId];

  const isFiltered = useMemo(() => {
    if (!filterValue) return false;
    if (Array.isArray(filterValue)) return filterValue.length > 0;
    if (isRangeFilter(filterValue))
      return filterValue.min !== undefined || filterValue.max !== undefined;
    return false;
  }, [filterValue]);

  const facetedValues = column.getFacetedUniqueValues();

  const { sortedUniqueValues, emptyCount } = useMemo(() => {
    const entries = Array.from(facetedValues.entries());
    let emptyCount = 0;

    const values = entries
      .map(([value, count]) => {
        const strValue = String(value);
        if (
          strValue === '' ||
          strValue === 'undefined' ||
          strValue === 'null' ||
          strValue === '0' ||
          value === null ||
          value === undefined ||
          value === 0
        ) {
          emptyCount += count;
          return null;
        }
        return { value: strValue, count };
      })
      .filter((item): item is { value: string; count: number } => item !== null)
      .sort((a, b) => a.value.localeCompare(b.value));

    return { sortedUniqueValues: values, emptyCount };
  }, [facetedValues]);

  const { dataMin, dataMax } = useMemo(() => {
    if (filterType !== 'range') return { dataMin: 0, dataMax: 0 };

    const values = Array.from(facetedValues.keys())
      .map((v) => (typeof v === 'number' ? v : parseFloat(String(v))))
      .filter((v) => !isNaN(v) && v !== 0);

    if (values.length === 0) return { dataMin: 0, dataMax: 0 };

    return {
      dataMin: Math.min(...values),
      dataMax: Math.max(...values),
    };
  }, [facetedValues, filterType]);

  const hasFilterableValues =
    filterType === 'range'
      ? dataMin !== dataMax
      : sortedUniqueValues.length > 0 || emptyCount > 0;

  const selectFilterValue = Array.isArray(filterValue) ? filterValue : [];

  const toggleValue = (value: string) => {
    if (selectFilterValue.length === 0) {
      const allValues = sortedUniqueValues.map((v) => v.value);
      if (emptyCount > 0) allValues.push('__empty__');
      meta?.onFilterChange?.(
        columnId,
        allValues.filter((v) => v !== value),
      );
      return;
    }
    const updated = selectFilterValue.includes(value)
      ? selectFilterValue.filter((v) => v !== value)
      : [...selectFilterValue, value];
    meta?.onFilterChange?.(columnId, updated);
  };

  const selectAll = () => {
    meta?.onFilterChange?.(columnId, []);
  };

  const rangeFilterValue = isRangeFilter(filterValue)
    ? filterValue
    : { min: undefined, max: undefined };

  const [minInput, setMinInput] = useState(
    rangeFilterValue.min !== undefined
      ? formatCurrencyInput(rangeFilterValue.min)
      : '',
  );
  const [maxInput, setMaxInput] = useState(
    rangeFilterValue.max !== undefined
      ? formatCurrencyInput(rangeFilterValue.max)
      : '',
  );

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && filterType === 'range') {
      setMinInput(
        rangeFilterValue.min !== undefined
          ? formatCurrencyInput(rangeFilterValue.min)
          : '',
      );
      setMaxInput(
        rangeFilterValue.max !== undefined
          ? formatCurrencyInput(rangeFilterValue.max)
          : '',
      );
    }
    setOpen(isOpen);
  };

  const handleRangeChange = (type: 'min' | 'max', value: string) => {
    const formatted = formatNumberWithCommas(value);
    if (type === 'min') setMinInput(formatted);
    else setMaxInput(formatted);
  };

  const applyRangeFilter = () => {
    const min = parseCurrencyInput(minInput);
    const max = parseCurrencyInput(maxInput);

    if (min === undefined && max === undefined) {
      meta?.onFilterChange?.(columnId, []);
    } else {
      meta?.onFilterChange?.(columnId, { min, max });
    }
    setOpen(false);
  };

  const clearRangeFilter = () => {
    setMinInput('');
    setMaxInput('');
    meta?.onFilterChange?.(columnId, []);
  };

  const showSearch = sortedUniqueValues.length > 10;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="link"
          className={`${
            isSorted || isFiltered
              ? 'font-medium text-foreground'
              : 'font-normal text-muted-foreground'
          } h-auto gap-1 whitespace-nowrap p-0 text-[0.75rem] hover:bg-transparent 3xl:text-[0.8rem] ${
            align === 'right' ? 'text-right' : 'text-left'
          }`}
        >
          {title}
          {isSorted === 'asc' && <ArrowUp className="h-4 w-4" />}
          {isSorted === 'desc' && <ArrowDown className="h-4 w-4" />}
          {isFiltered && (
            <span className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-[1px] bg-foreground">
              <ListFilter
                style={{ width: 10, height: 10, strokeWidth: 2.5 }}
                className="shrink-0 text-background"
              />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <div className="flex flex-col p-1">
          <button
            type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            onClick={() => {
              column.toggleSorting(false);
              setOpen(false);
            }}
          >
            <ArrowUp className="mr-4 h-4 w-4" /> Sort Ascending
          </button>
          <button
            type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            onClick={() => {
              column.toggleSorting(true);
              setOpen(false);
            }}
          >
            <ArrowDown className="mr-4 h-4 w-4" /> Sort Descending
          </button>
        </div>

        {hasFilterableValues && (
          <>
            <Separator />

            {filterType === 'range' ? (
              <div className="flex flex-col gap-2 p-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 shrink-0 text-xs text-muted-foreground">
                    Min
                  </div>
                  <Input
                    placeholder={formatCurrencyInput(dataMin)}
                    value={minInput}
                    onChange={(e) => handleRangeChange('min', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 shrink-0 text-xs text-muted-foreground">
                    Max
                  </div>
                  <Input
                    placeholder={formatCurrencyInput(dataMax)}
                    value={maxInput}
                    onChange={(e) => handleRangeChange('max', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={clearRangeFilter}
                  >
                    Reset
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={applyRangeFilter}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            ) : (
              <Command>
                {showSearch && (
                  <CommandInput placeholder="Search..." className="h-9" />
                )}
                <CommandList className="max-h-64">
                  <CommandEmpty>No values found.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      onSelect={selectAll}
                      className="cursor-pointer"
                    >
                      <Checkbox
                        checked={selectFilterValue.length === 0}
                        className="mr-2"
                      />
                      Select All
                    </CommandItem>
                    <Separator className="my-1" />
                    {emptyCount > 0 && (
                      <CommandItem
                        onSelect={() => toggleValue('__empty__')}
                        className="cursor-pointer"
                      >
                        <Checkbox
                          checked={
                            selectFilterValue.length === 0 ||
                            selectFilterValue.includes('__empty__')
                          }
                          className="mr-2"
                        />
                        <span className="flex-1 truncate italic text-muted-foreground">
                          Empty
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {emptyCount}
                        </span>
                      </CommandItem>
                    )}
                    {sortedUniqueValues.map(({ value, count }) => (
                      <CommandItem
                        key={value}
                        onSelect={() => toggleValue(value)}
                        className="cursor-pointer"
                      >
                        <Checkbox
                          checked={
                            selectFilterValue.length === 0 ||
                            selectFilterValue.includes(value)
                          }
                          className="mr-2"
                        />
                        <span className="flex-1 truncate">{value}</span>
                        <span className="text-xs text-muted-foreground">
                          {count}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
