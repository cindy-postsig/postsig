'use client';

import { useSpendQuery } from '@/hooks/api/useSpendQuery';
import {
  costMethodInput,
  type CostMethod,
} from '@/components/budget/costMethod';
import type { SpendQueryResponse } from '@/app/api/v2/handlers/spend/query';

function totalOf(response: SpendQueryResponse | undefined) {
  if (!response) return 0;
  return response.items.reduce((sum, item) => sum + item.value, 0);
}

/**
 * The three year-total figures behind the spend summary cards, shared by the
 * budget overview and the dashboard's Spend Overview so the two surfaces
 * cannot drift into describing different bases or years.
 *
 * Current/projected stay anchored to today's FYs as reference points; a
 * selected historical year adds its own tile in front (product request,
 * 2026-08-04) instead of re-windowing them.
 */
export function useCostMethodTotals(
  method: CostMethod,
  fiscalYear: number,
  currentFiscalYear: number,
) {
  const isHistorical = fiscalYear < currentFiscalYear;

  const historical = useSpendQuery(
    costMethodInput(method, { fiscalYear }, 'year', 'total'),
    { enabled: isHistorical },
  );
  const current = useSpendQuery(
    costMethodInput(method, 'currentFY', 'year', 'total'),
  );
  const projected = useSpendQuery(
    costMethodInput(method, 'nextFY', 'year', 'total'),
  );

  return {
    isHistorical,
    historicalTotal: totalOf(historical.data),
    currentTotal: totalOf(current.data),
    projectedTotal: totalOf(projected.data),
    // isFetching, not isPending: switching method changes the query key, and
    // without this the cards would flash a real-looking $0 between views.
    isHistoricalFetching: historical.isFetching,
    isLoading: current.isFetching || projected.isFetching,
  };
}
