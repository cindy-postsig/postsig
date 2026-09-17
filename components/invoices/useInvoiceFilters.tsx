'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  INVOICE_STATUS_LABELS,
  getInvoiceStatusLabel,
} from '@/constants/invoiceStatus';
import { DATE_FORMAT_DEFAULT } from '@/lib/date-format';
import { DateRangeControl } from '@/components/reports/DateRangeControl';
import {
  isInReportWindow,
  resolveInvoiceWindow,
  type ReportPeriod,
  type ResolvedReportWindow,
} from '@/lib/v2/cost-allocation/report-window';
import type { ContractTableRow } from '@/lib/v2/core/types';

const STATUS_OPTIONS = Object.values(INVOICE_STATUS_LABELS);

// This tab's own starting view — deliberately not DEFAULT_INVOICE_REPORT_PERIOD,
// which is the Invoice Cost Allocation report's default and must stay
// unaffected by this one. Current FY is still a filter, though — Clear
// Filters resets past it to ALL_TIME_PERIOD, the true unfiltered baseline,
// not back to this starting point.
export const DEFAULT_PERIOD: ReportPeriod = 'current-fy';
const ALL_TIME_PERIOD: ReportPeriod = 'all';

function uniqueSorted<T>(
  rows: T[],
  extract: (row: T) => string | string[] | null | undefined,
): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const value = extract(row);
    if (Array.isArray(value)) {
      for (const v of value) if (v) set.add(v);
    } else if (value) {
      set.add(value);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Filter row above the Invoices table — Date, Vendor, Status, Tags, Business
// Sponsor and Business Group — matching the Invoice Management prototype
// (postsig-proto, exchange-agreements-v2 branch), filtered client-side over
// the already-fetched row set (no server round trip per filter change).
// The date range reuses the same DateRangeControl/report-window presets as
// the Invoice Cost Allocation report, so the two feel like one picker.
export function useInvoiceFilters<T extends ContractTableRow>(
  rows: T[],
  options: {
    showDate?: boolean;
    showStatus?: boolean;
    fiscalConfig?: { startMonth: number };
    dateFormat?: string;
    /** Row set the Vendor/Tags/Sponsor/Group dropdowns build their options
     * from — defaults to `rows`. Pass the full cross-folder row set when
     * `rows` is folder-scoped: filter selections now persist across folder
     * tabs, so an option list built from just the current folder can drop
     * the very vendor/tag a persisted filter is set to, leaving the select
     * unable to show its own value. */
    optionRows?: T[];
    /** Fires whenever the date window, vendor, tag, group, or sponsor
     * filter changes, purely so something else that isn't rendered here
     * (the stat tiles) can mirror the same value — this hook still owns the
     * state and still renders the DateRangeControl/Vendor/Tags/Group/
     * Sponsor selects in their usual place. */
    onDateWindowChange?: (window: ResolvedReportWindow) => void;
    onVendorFilterChange?: (value: string) => void;
    onTagFilterChange?: (value: string) => void;
    onGroupFilterChange?: (value: string) => void;
    onSponsorFilterChange?: (value: string) => void;
  } = {},
) {
  const {
    showDate = true,
    showStatus = true,
    fiscalConfig = { startMonth: 1 },
    dateFormat = DATE_FORMAT_DEFAULT,
    optionRows = rows,
    onDateWindowChange,
    onVendorFilterChange,
    onTagFilterChange,
    onGroupFilterChange,
    onSponsorFilterChange,
  } = options;
  const [dateWindow, setDateWindow] = useState<ResolvedReportWindow>(() =>
    resolveInvoiceWindow({ period: DEFAULT_PERIOD }, new Date(), fiscalConfig),
  );
  const navigateDate = (query: string) => {
    const params = new URLSearchParams(query);
    const resolved = resolveInvoiceWindow(
      {
        period: params.get('period') ?? undefined,
        from: params.get('from') ?? undefined,
        to: params.get('to') ?? undefined,
      },
      new Date(),
      fiscalConfig,
    );
    setDateWindow(resolved);
    onDateWindowChange?.(resolved);
  };
  const [vendorFilter, setVendorFilterState] = useState('all');
  const setVendorFilter = (value: string) => {
    setVendorFilterState(value);
    onVendorFilterChange?.(value);
  };
  const [statusFilter, setStatusFilter] = useState('all');
  const [tagFilter, setTagFilterState] = useState('all');
  const setTagFilter = (value: string) => {
    setTagFilterState(value);
    onTagFilterChange?.(value);
  };
  const [sponsorFilter, setSponsorFilterState] = useState('all');
  const setSponsorFilter = (value: string) => {
    setSponsorFilterState(value);
    onSponsorFilterChange?.(value);
  };
  const [groupFilter, setGroupFilterState] = useState('all');
  const setGroupFilter = (value: string) => {
    setGroupFilterState(value);
    onGroupFilterChange?.(value);
  };

  const vendorOptions = useMemo(
    () => uniqueSorted(optionRows, (row) => row.vendor),
    [optionRows],
  );

  const tagOptions = useMemo(
    () => uniqueSorted(optionRows, (row) => row.tags?.map((tag) => tag.name)),
    [optionRows],
  );

  const sponsorOptions = useMemo(
    () => uniqueSorted(optionRows, (row) => row.businessSponsor),
    [optionRows],
  );

  const groupOptions = useMemo(
    () => uniqueSorted(optionRows, (row) => row.businessGroup),
    [optionRows],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (vendorFilter !== 'all' && row.vendor !== vendorFilter) return false;
      if (
        statusFilter !== 'all' &&
        getInvoiceStatusLabel(row.invoiceStatus) !== statusFilter
      )
        return false;
      if (
        tagFilter !== 'all' &&
        !(row.tags ?? []).some((t) => t.name === tagFilter)
      )
        return false;
      if (sponsorFilter !== 'all') {
        const sponsors = Array.isArray(row.businessSponsor)
          ? row.businessSponsor
          : [row.businessSponsor];
        if (!sponsors.includes(sponsorFilter)) return false;
      }
      if (groupFilter !== 'all' && row.businessGroup !== groupFilter)
        return false;
      // 'All Time' means no date restriction at all — an invoice with no
      // executionDate has nothing to evaluate a real window against, but
      // under 'All Time' there's no window to evaluate, so it stays in.
      if (showDate && dateWindow.period !== ALL_TIME_PERIOD) {
        if (!row.executionDate) return false;
        if (!isInReportWindow(row.executionDate, dateWindow.window))
          return false;
      }
      return true;
    });
  }, [
    rows,
    vendorFilter,
    statusFilter,
    tagFilter,
    sponsorFilter,
    groupFilter,
    showDate,
    dateWindow,
  ]);

  const dateActive = showDate && dateWindow.period !== ALL_TIME_PERIOD;
  const anyFilterActive =
    dateActive ||
    vendorFilter !== 'all' ||
    statusFilter !== 'all' ||
    tagFilter !== 'all' ||
    sponsorFilter !== 'all' ||
    groupFilter !== 'all';

  const clearFilters = () => {
    navigateDate(`period=${ALL_TIME_PERIOD}`);
    setVendorFilter('all');
    setStatusFilter('all');
    setTagFilter('all');
    setSponsorFilter('all');
    setGroupFilter('all');
  };

  const filterBar = (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {showDate && (
        <DateRangeControl
          // Reseeds the typed From/To fields whenever the window changes from
          // outside (a preset click, or Reset) — otherwise they'd
          // keep showing the range the user just left.
          key={`${dateWindow.period}|${dateWindow.custom?.from ?? ''}|${dateWindow.custom?.to ?? ''}`}
          period={dateWindow.period}
          window={dateWindow.window}
          custom={dateWindow.custom}
          dateFormat={dateFormat}
          onNavigate={navigateDate}
          pending={false}
        />
      )}

      <Select
        value={vendorFilter}
        onValueChange={setVendorFilter}
        // Only while nothing is selected: a stale selection from a previous
        // row set must stay changeable, or it filters everything out with no
        // way back short of Reset.
        disabled={vendorOptions.length <= 1 && vendorFilter === 'all'}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Vendor" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value="all">All Vendors</SelectItem>
          {vendorOptions.map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showStatus && (
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {sponsorOptions.length > 0 && (
        <Select value={sponsorFilter} onValueChange={setSponsorFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Business Sponsor" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">All Sponsors</SelectItem>
            {sponsorOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {groupOptions.length > 0 && (
        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Business Group" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">All Groups</SelectItem>
            {groupOptions.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {tagOptions.length > 0 && (
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tags" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">All Tags</SelectItem>
            {tagOptions.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {anyFilterActive && (
        <Button variant="outline" size="sm" onClick={clearFilters}>
          Reset
        </Button>
      )}
    </div>
  );

  return { filteredRows, filterBar };
}
