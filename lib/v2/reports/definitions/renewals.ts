/**
 * Renewals Report Pipeline Definitions
 *
 * Pipelines for auto-renewals, manual-renewals, and recently-renewed reports.
 */

import { ReportPipeline, FilterResult } from '../pipeline/types';
import { EnrichedContract } from '@/lib/v2/contracts/service';
import { buildContractTableRows } from '@/lib/v2/contracts/transforms';
import type { ContractTableRow } from '@/lib/v2/core/types';
import { isInvoiceType } from '@/app/lib/constants';
import { sumValuesInUSD, getUSDValue } from '@/lib/v2/core/budget';
import { crossMultiplier, getLatestUsdRates } from '@/lib/v2/core/fxRates';
import { firstDate } from '@/lib/shared/dateUtils';
import { getUserMetadata } from '@/data/users';
import { loadSidSpendPopulation } from '@/lib/v2/bloomberg-sid/population';
import {
  sidRenewalRow,
  sidSeatsRenewingWithin,
} from '@/lib/v2/bloomberg-sid/rows';
import { addUTCDays } from '@/lib/v2/spend/dates';

interface RenewalsOptions {
  range?: number;
  valueField?: string; // Unused here, kept for API consistency
}

const DEFAULT_RANGE_DAYS = 90;

interface AutoRenewalsContext {
  /** One row per vendor whose Bloomberg seats renew in the window. */
  seatRows: ContractTableRow[];
}

/**
 * Bloomberg seats renew on their own anniversaries and every account carries
 * the auto flag, so the seats renewing in the window join the auto-renewals
 * as one row per vendor, valued in their billing currency and converted to
 * the org base at today's rate for the total.
 */
async function loadSeatRenewalRows(
  rangeDays: number,
): Promise<ContractTableRow[]> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) return [];

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const population = await loadSidSpendPopulation(userMetadata.organizationId, {
    window: { start: today, end: addUTCDays(today, rangeDays) },
  });
  const renewing = sidSeatsRenewingWithin(
    population.seats.map((record) => record.seat),
    today,
    rangeDays,
  );
  if (renewing.length === 0) return [];

  const byVendor = new Map<number, typeof renewing>();
  for (const seat of renewing) {
    byVendor.set(seat.vendorId, [...(byVendor.get(seat.vendorId) ?? []), seat]);
  }
  const currencies = [...new Set(renewing.map((seat) => seat.currency))];
  const latest = await getLatestUsdRates([
    ...currencies,
    userMetadata.baseCurrency,
  ]);

  return [...byVendor].map(([vendorId, seats]) => {
    const record = population.seats.find(
      ({ seat }) => seat.vendorId === vendorId,
    );
    const ref = population.refs[String(vendorId)];
    // Seats of one vendor bill in one currency in practice; a mixed set
    // would read in its first seat's currency, a known limitation.
    const currency = seats[0].currency;
    return sidRenewalRow({
      seats,
      vendor: {
        id: vendorId,
        name: record?.vendorName ?? String(vendorId),
        domain: ref?.vendorDomain,
      },
      today,
      rangeDays,
      currency,
      toBase: crossMultiplier(currency, userMetadata.baseCurrency, latest),
    });
  });
}

/**
 * Filter contracts expiring within range days
 */
export function filterUpcomingRenewals(
  contracts: EnrichedContract[],
  range: number,
): EnrichedContract[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rangeDate = new Date(today.getTime() + range * 86400000);

  return contracts.filter((c) => {
    // Exclude invoices
    if (isInvoiceType(c.contract.type_id)) return false;

    // Must be active
    if (c.contract.status !== 'active') return false;

    // Check if cancel_by_date or term_end_date is within range
    const cancel = firstDate(
      c.contract.cancel_date ?? c.contract.cancel_by_date,
    );
    const end = firstDate(c.contract.term_end_date);
    const relevantDate = cancel ?? end;

    return relevantDate && relevantDate <= rangeDate && relevantDate >= today;
  });
}

/**
 * Auto-Renewals Report
 * Contracts with renewal_type 'Auto' expiring within range days
 */
export const autoRenewalsReport: ReportPipeline<
  RenewalsOptions,
  AutoRenewalsContext
> = {
  filter: (contracts, options): FilterResult<AutoRenewalsContext> => {
    const range = options?.range || DEFAULT_RANGE_DAYS;
    const upcomingContracts = filterUpcomingRenewals(contracts, range);

    return {
      contracts: upcomingContracts.filter(
        (c) => c.contract.renewal_type === 'Auto',
      ),
    };
  },
  enrich: async (_contracts, options) => ({
    seatRows: await loadSeatRenewalRows(options?.range || DEFAULT_RANGE_DAYS),
  }),
  transform: (contracts, context) => [
    ...buildContractTableRows(contracts),
    ...(context?.seatRows ?? []),
  ],
  calculateTotal: (rows) =>
    sumValuesInUSD(rows, (row) => getUSDValue(row, 'projectedBudget')),
  metadata: {
    defaultSortColumn: 'cancelByDate',
    defaultSortDirection: 'asc',
  },
};

/**
 * Manual Renewals Report
 * Contracts with renewal_type !== 'Auto' expiring within range days
 */
export const manualRenewalsReport: ReportPipeline<RenewalsOptions> = {
  filter: (contracts, options): FilterResult => {
    const range = options?.range || 90;
    const upcomingContracts = filterUpcomingRenewals(contracts, range);

    return {
      contracts: upcomingContracts.filter(
        (c) => c.contract.renewal_type !== 'Auto',
      ),
    };
  },
  transform: (contracts) => buildContractTableRows(contracts),
  calculateTotal: (rows) =>
    sumValuesInUSD(rows, (row) => getUSDValue(row, 'projectedBudget')),
  metadata: {
    defaultSortColumn: 'cancelByDate',
    defaultSortDirection: 'asc',
  },
};

/**
 * Recently Renewed Report
 * Contracts that have renewed in the last range days (term_start_date within range)
 */
export const recentlyRenewedReport: ReportPipeline<RenewalsOptions> = {
  filter: (contracts, options): FilterResult => {
    const range = options?.range || 90;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rangeAgo = new Date(today.getTime() - range * 86400000);

    return {
      contracts: contracts.filter((c) => {
        // Must have term_start_date with at least 2 entries (indicates renewal)
        const termStartDate = c.contract.term_start_date;
        if (
          !termStartDate ||
          !Array.isArray(termStartDate) ||
          termStartDate.length < 2
        ) {
          return false;
        }

        // Get the most recent start date by sorting by updated_at descending
        const sortedDates = [...termStartDate].sort((a, b) => {
          const dateA = new Date(
            typeof a === 'string' ? a : a.updated_at,
          ).getTime();
          const dateB = new Date(
            typeof b === 'string' ? b : b.updated_at,
          ).getTime();
          return dateB - dateA; // descending order
        });

        const mostRecentEntry = sortedDates[0];
        const startDate = mostRecentEntry
          ? new Date(
              typeof mostRecentEntry === 'string'
                ? mostRecentEntry
                : mostRecentEntry.date,
            )
          : null;

        return startDate && startDate >= rangeAgo && startDate <= today;
      }),
    };
  },
  transform: (contracts) => buildContractTableRows(contracts),
  calculateTotal: (rows) =>
    sumValuesInUSD(rows, (row) => getUSDValue(row, 'currentBudget')),
  metadata: {
    defaultSortColumn: 'termStartDate',
    defaultSortDirection: 'asc',
  },
};

/**
 * All Renewals Report
 * The renewals page's combined export. The three windowed pipelines above have
 * already chosen the rows and the caller passes their exact ids, so this one
 * applies no window of its own.
 */
export const allRenewalsReport: ReportPipeline<RenewalsOptions> = {
  filter: (contracts): FilterResult => ({ contracts }),
  transform: (contracts) => buildContractTableRows(contracts),
  metadata: {
    defaultSortColumn: 'termEndDate',
    defaultSortDirection: 'asc',
  },
};
