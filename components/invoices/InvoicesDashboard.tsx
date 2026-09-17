'use client';

import { useMemo, useState } from 'react';
import {
  isInReportWindow,
  resolveInvoiceWindow,
  type ResolvedReportWindow,
} from '@/lib/v2/cost-allocation/report-window';
import type { InvoiceFolder } from '@/lib/v2/invoices/service';
import InvoiceStatTiles from '@/app/(app)/(cpm)/invoices/InvoiceStatTiles';
import { InvoicesTable, type InvoiceRow } from './InvoicesTable';
import { DEFAULT_PERIOD } from './useInvoiceFilters';

/**
 * Mirrors the state the stat tiles and the table share: the date window,
 * vendor, tag, group, and sponsor filters — a card still means the same
 * thing scoped to one vendor/tag/group/sponsor ("this vendor's Awaiting
 * Review total"). Status stays local to the table: a card like Awaiting
 * Review would go nonsensical if Status also scoped it (e.g. to Paid).
 *
 * `InvoicesTable` still owns and renders the actual Date/Vendor/Tags/Group/
 * Sponsor controls — this component just listens for changes via the notify
 * callbacks and re-filters `optionRows` for the tiles, so the filter bar
 * stays a single row instead of splitting into two.
 */
export function InvoicesDashboard({
  rows,
  optionRows,
  activeFolder,
  showStatusFilter,
  fiscalConfig,
  dateFormat,
  currency,
}: {
  /** Folder-scoped, for the table. */
  rows: InvoiceRow[];
  /** Cross-folder active invoices, for the Vendor/Tags/Sponsor/Group options
   * and — filtered by the shared date window — the stat tiles. */
  optionRows: InvoiceRow[];
  activeFolder: InvoiceFolder;
  showStatusFilter: boolean;
  fiscalConfig: { startMonth: number };
  dateFormat?: string;
  currency: string;
}) {
  // Matches useInvoiceFilters' own initial state so the tiles agree with the
  // table before either has navigated anywhere.
  const [dateWindow, setDateWindow] = useState<ResolvedReportWindow>(() =>
    resolveInvoiceWindow({ period: DEFAULT_PERIOD }, new Date(), fiscalConfig),
  );
  const [vendorFilter, setVendorFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [sponsorFilter, setSponsorFilter] = useState('all');

  const cardRows = useMemo(
    () =>
      optionRows.filter((row) => {
        // 'all' (All Time) means no date restriction at all — an invoice
        // with no executionDate has nothing to evaluate a real window
        // against, but under 'all' there's no window to evaluate, so it
        // stays in.
        if (dateWindow.period !== 'all') {
          if (!row.executionDate) return false;
          if (!isInReportWindow(row.executionDate, dateWindow.window))
            return false;
        }
        if (vendorFilter !== 'all' && row.vendor !== vendorFilter) return false;
        if (
          tagFilter !== 'all' &&
          !(row.tags ?? []).some((tag) => tag.name === tagFilter)
        )
          return false;
        if (groupFilter !== 'all' && row.businessGroup !== groupFilter)
          return false;
        if (sponsorFilter !== 'all') {
          const sponsors = Array.isArray(row.businessSponsor)
            ? row.businessSponsor
            : [row.businessSponsor];
          if (!sponsors.includes(sponsorFilter)) return false;
        }
        return true;
      }),
    [
      optionRows,
      dateWindow,
      vendorFilter,
      tagFilter,
      groupFilter,
      sponsorFilter,
    ],
  );

  return (
    <>
      <InvoiceStatTiles
        rows={cardRows}
        currency={currency}
        activeFolder={activeFolder}
      />
      <InvoicesTable
        rows={rows}
        optionRows={optionRows}
        showStatusFilter={showStatusFilter}
        fiscalConfig={fiscalConfig}
        dateFormat={dateFormat}
        onDateWindowChange={setDateWindow}
        onVendorFilterChange={setVendorFilter}
        onTagFilterChange={setTagFilter}
        onGroupFilterChange={setGroupFilter}
        onSponsorFilterChange={setSponsorFilter}
      />
    </>
  );
}
