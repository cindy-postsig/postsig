/**
 * Calendar Service
 *
 * Provides calendar event data for displaying contract dates (start, end, cancel).
 *
 * PERFORMANCE OPTIMIZATION: skipExchangeRates
 * ============================================
 * This service explicitly skips exchange rate fetching when calling enrichWithPricing().
 *
 * Rationale:
 * - Calendar views only display dates, not financial values
 * - Exchange rate API calls add ~200-500ms latency per request
 * - Calendar often fetches large date ranges with many contracts
 * - The cost values in ContractWithPricing remain in native currency (not USD)
 *
 * Impact:
 * - priceHistory.annualContractValueUSD will be approximate (native currency value)
 * - This is acceptable because calendar UI does not display costs
 *
 * If calendar needs to show costs in the future:
 * - Remove { skipExchangeRates: true } from enrichWithPricing() call
 * - Consider adding client-side caching of exchange rates
 */

import { fetchContractsBase } from '@/app/lib/contracts/actions';
import { fetchAllRelationshipsForOrg } from '@/data/superuser/contracts';
import { getUserMetadata } from '@/data/users';
import { enrichWithLineage } from '@/lib/v2/core/lineage';
import { enrichWithPricing } from '@/lib/v2/core/pricing';
import {
  applyDefaultFilters,
  filterByDateRange,
  filterExcludeInvoices,
} from '@/lib/v2/core/filters';
import { ContractWithPricing } from '@/lib/v2/core/types';
import { UserMetadata } from '@/constants/types';

export interface CalendarResult {
  events: ContractWithPricing[];
  count: number;
  fiscalYearStartMonth: number;
  userMetadata?: UserMetadata;
}

export interface CalendarRange {
  start: string;
  end: string;
}

export async function getCalendarData(
  range?: CalendarRange,
): Promise<CalendarResult> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    return { events: [], count: 0, fiscalYearStartMonth: 1 };
  }

  const fiscalYearStartMonth = userMetadata.organizationFY || 1;

  // DATA LAYER
  const contractsBase = await fetchContractsBase();
  const relationships = await fetchAllRelationshipsForOrg(
    userMetadata.organizationId,
  );

  // Filter to active contracts (status_id = 4, exclude AI failed) and drop
  // invoices — they belong only in the Invoices sub-view, not the calendar.
  let activeContracts = filterExcludeInvoices(
    applyDefaultFilters(contractsBase),
  );

  // Filter by date range BEFORE enrichment (performance optimization)
  if (range) {
    const { uniqueData } = filterByDateRange(
      activeContracts,
      range.start,
      range.end,
    );
    activeContracts = uniqueData;
  }

  // LOGIC LAYER - lineage + pricing
  // See file header for explanation of skipExchangeRates optimization
  const withLineage = enrichWithLineage(activeContracts, relationships);
  const withPricing = await enrichWithPricing(
    withLineage,
    fiscalYearStartMonth,
    {
      // Calendar only shows dates, not costs - skip expensive exchange rate API call
      skipExchangeRates: true,
    },
  );

  return {
    events: withPricing,
    count: withPricing.length,
    fiscalYearStartMonth,
    userMetadata,
  };
}
