import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
  type DehydratedState,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  runSpendQuery,
  type SpendQueryInput,
} from '@/app/api/v2/handlers/spend/query';
import {
  EMPTY_SID_SPEND_POPULATION,
  loadSidSpendPopulation,
} from '@/lib/v2/bloomberg-sid/population';
import { resolveWindow } from '@/lib/v2/spend/window';
import type { UserMetadata } from '@/constants/types';
import { timed } from '@/utils/logging/timed';
import logger from '@/utils/pino';
import { spendInputsOnMount, type CostMethod } from './costMethod';

/**
 * Runs spend queries during the server render and hands react-query the
 * results under the keys useSpendQuery builds, so the cards and chart mount
 * with their numbers instead of each issuing a request that enriches the org
 * again. Seats ride the flow bases only, the route's rule, off one population
 * loaded across every window asked for. A failure leaves the state empty and
 * the client fetches as it did before the prefetch existed.
 */
export async function prefetchSpendQueries(
  userMetadata: UserMetadata,
  inputs: SpendQueryInput[],
): Promise<DehydratedState> {
  const queryClient = new QueryClient();
  try {
    const asOf = new Date();
    const fiscalConfig = { startMonth: userMetadata.organizationFY || 1 };
    const seatWindows = inputs
      .filter((input) => input.kind === 'spend')
      .map((input) => resolveWindow(input.window, asOf, fiscalConfig));
    const seats =
      seatWindows.length === 0
        ? EMPTY_SID_SPEND_POPULATION
        : await timed('spend.prefetch.loadSidSpendPopulation', () =>
            loadSidSpendPopulation(userMetadata.organizationId, {
              window: {
                start: new Date(
                  Math.min(...seatWindows.map((w) => w.start.getTime())),
                ),
                end: new Date(
                  Math.max(...seatWindows.map((w) => w.end.getTime())),
                ),
              },
            }),
          );
    await Promise.all(
      inputs.map(async (input) => {
        const { kind, window, granularity, groupBy } = input;
        const data = await timed(
          'spend.prefetch',
          () =>
            runSpendQuery(userMetadata, input, {
              bloombergSid: kind === 'spend' ? seats : false,
            }),
          { kind, window, granularity, groupBy },
        );
        queryClient.setQueryData(['spend', input], data);
      }),
    );
  } catch (error) {
    logger.warn(
      { err: error, organizationId: userMetadata.organizationId },
      'Spend prefetch failed; the client will fetch instead',
    );
    return dehydrate(new QueryClient());
  }
  return dehydrate(queryClient);
}

export async function SpendQueryHydration({
  userMetadata,
  method,
  fiscalYear,
  currentFiscalYear,
  children,
}: {
  userMetadata: UserMetadata;
  method: CostMethod;
  fiscalYear: number;
  currentFiscalYear: number;
  children: ReactNode;
}) {
  const state = await prefetchSpendQueries(
    userMetadata,
    spendInputsOnMount(method, fiscalYear, currentFiscalYear),
  );
  return <HydrationBoundary state={state}>{children}</HydrationBoundary>;
}
