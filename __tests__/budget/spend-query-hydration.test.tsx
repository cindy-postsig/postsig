/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
const runSpendQuery = jest.fn();
jest.mock('@/app/api/v2/handlers/spend/query', () => ({
  runSpendQuery: (...args: unknown[]) => runSpendQuery(...args),
}));
const seats = { contracts: [{ id: -500 }] };
const loadSidSpendPopulation = jest.fn();
jest.mock('@/lib/v2/bloomberg-sid/population', () => ({
  EMPTY_SID_SPEND_POPULATION: { contracts: [] },
  loadSidSpendPopulation: (...args: unknown[]) =>
    loadSidSpendPopulation(...args),
}));
const spendRequest = jest.fn();
jest.mock('@/lib/api/v2-client', () => ({
  apiClient: {
    spend: { query: (...args: unknown[]) => spendRequest(...args) },
  },
}));

import { prefetchSpendQueries } from '@/components/budget/SpendQueryHydration';
import {
  costMethodInput,
  spendInputsOnMount,
  type CostMethod,
} from '@/components/budget/costMethod';
import { useCostMethodTotals } from '@/hooks/api/useCostMethodTotals';
import { useSpendQuery } from '@/hooks/api/useSpendQuery';
import type { SpendQueryInput } from '@/app/api/v2/handlers/spend/query';
import type { UserMetadata } from '@/constants/types';

const user = {
  organizationId: 'org-1',
  organizationFY: 1,
  baseCurrency: 'USD',
} as unknown as UserMetadata;

const currentFY = new Date().getUTCFullYear();

const responseFor = (input: SpendQueryInput) => ({
  kind: input.kind,
  currency: 'base',
  targetCurrency: 'USD',
  window: { start: '', end: '', fiscalYear: currentFY },
  periods: [],
  refs: {},
  items:
    input.granularity === 'month'
      ? [1, 2, 3].map((month) => ({
          groupKey: '1',
          period: `${currentFY}-0${month}`,
          value: 10,
        }))
      : [
          {
            groupKey: 'total',
            period: `FY${currentFY}`,
            value: input.window === 'currentFY' ? 100 : 200,
          },
        ],
});

beforeEach(() => {
  jest.clearAllMocks();
  loadSidSpendPopulation.mockResolvedValue(seats);
  runSpendQuery.mockImplementation(async (_user, input: SpendQueryInput) =>
    responseFor(input),
  );
});

describe('spendInputsOnMount', () => {
  it('is the two FY totals and the monthly chart on the current year', () => {
    expect(spendInputsOnMount('amortized', currentFY, currentFY)).toEqual([
      costMethodInput('amortized', 'currentFY', 'year', 'total'),
      costMethodInput('amortized', 'nextFY', 'year', 'total'),
      costMethodInput('amortized', 'currentFY', 'month', 'contract'),
    ]);
  });

  it("adds a historical year's own total and re-windows the chart to it", () => {
    const fiscalYear = currentFY - 2;
    expect(spendInputsOnMount('actual', fiscalYear, currentFY)).toEqual([
      costMethodInput('actual', { fiscalYear }, 'year', 'total'),
      costMethodInput('actual', 'currentFY', 'year', 'total'),
      costMethodInput('actual', 'nextFY', 'year', 'total'),
      costMethodInput('actual', { fiscalYear }, 'month', 'contract'),
    ]);
  });
});

describe('prefetchSpendQueries', () => {
  const inputs = spendInputsOnMount('amortized', currentFY, currentFY);

  it('loads one seats population across every window and hands it to each flow-basis query', async () => {
    const state = await prefetchSpendQueries(user, inputs);

    expect(loadSidSpendPopulation).toHaveBeenCalledTimes(1);
    expect(loadSidSpendPopulation).toHaveBeenCalledWith('org-1', {
      window: {
        start: new Date(Date.UTC(currentFY, 0, 1)),
        end: new Date(Date.UTC(currentFY + 2, 0, 1)),
      },
    });
    for (const [, , scope] of runSpendQuery.mock.calls) {
      expect(scope).toEqual({ bloombergSid: seats });
    }
    expect(state.queries.map((query) => query.queryKey)).toEqual(
      inputs.map((input) => ['spend', input]),
    );
    expect(state.queries.map((query) => query.state.data)).toEqual(
      inputs.map(responseFor),
    );
  });

  it('keeps Contract Term contracts-only and never loads seats for it', async () => {
    await prefetchSpendQueries(
      user,
      spendInputsOnMount('committed', currentFY, currentFY),
    );

    expect(loadSidSpendPopulation).not.toHaveBeenCalled();
    expect(runSpendQuery).toHaveBeenCalledTimes(3);
    for (const [, , scope] of runSpendQuery.mock.calls) {
      expect(scope).toEqual({ bloombergSid: false });
    }
  });

  it('hydrates nothing when a query fails, leaving the fetch to the client', async () => {
    runSpendQuery.mockRejectedValueOnce(new Error('engine down'));

    const state = await prefetchSpendQueries(user, inputs);

    expect(state.queries).toEqual([]);
  });
});

function Probe({ method }: { method: CostMethod }) {
  const totals = useCostMethodTotals(method, currentFY, currentFY);
  const chart = useSpendQuery(
    costMethodInput(method, 'currentFY', 'month', 'contract'),
  );
  return (
    <div>
      <span>current {totals.isLoading ? 'loading' : totals.currentTotal}</span>
      <span>projected {totals.projectedTotal}</span>
      <span>chart {chart.data ? chart.data.items.length : 'pending'}</span>
    </div>
  );
}

describe('hydrated spend surfaces', () => {
  it('mount with their numbers and issue no request', async () => {
    const state = await prefetchSpendQueries(
      user,
      spendInputsOnMount('amortized', currentFY, currentFY),
    );
    // The app provider's defaults: hydrated data is fresh for a minute.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 60 * 1000, retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <HydrationBoundary state={state}>
          <Probe method="amortized" />
        </HydrationBoundary>
      </QueryClientProvider>,
    );

    expect(screen.getByText('current 100')).toBeTruthy();
    expect(screen.getByText('projected 200')).toBeTruthy();
    expect(screen.getByText('chart 3')).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(spendRequest).not.toHaveBeenCalled();
  });

  it('fetch as before when nothing was hydrated', async () => {
    spendRequest.mockImplementation(async (input: SpendQueryInput) =>
      responseFor(input),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 60 * 1000, retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <Probe method="amortized" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('current 100')).toBeTruthy();
    expect(spendRequest).toHaveBeenCalledTimes(3);
  });
});
