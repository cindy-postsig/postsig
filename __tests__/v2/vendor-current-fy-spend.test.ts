const getUserMetadata = jest.fn();
jest.mock('@/data/users', () => ({
  getUserMetadata: () => getUserMetadata(),
}));

const getDefaultCostMethod = jest.fn();
jest.mock('@/lib/settings/default-cost-method', () => ({
  getDefaultCostMethod: (...args: unknown[]) => getDefaultCostMethod(...args),
}));

const runSpendQuery = jest.fn();
jest.mock('@/app/api/v2/handlers/spend/query', () => ({
  runSpendQuery: (...args: unknown[]) => runSpendQuery(...args),
}));

const sidPopulation = { contracts: [], seats: [], refs: {} };
const loadSidSpendPopulation = jest.fn();
jest.mock('@/lib/v2/bloomberg-sid/population', () => ({
  loadSidSpendPopulation: (...args: unknown[]) =>
    loadSidSpendPopulation(...args),
}));

import type { UserMetadata } from '@/constants/types';
import {
  getSidVendorTotals,
  getVendorCurrentFySpend,
  getVendorSpendIndex,
} from '@/lib/v2/vendors/service';

const user = {
  organizationId: 'org-1',
  organizationFY: 4,
  baseCurrency: 'EUR',
} as unknown as UserMetadata;

const response = (values: number[], fiscalYear = 2026) => ({
  items: values.map((value, index) => ({
    groupKey: 'total',
    period: `FY${fiscalYear}-${index}`,
    value,
  })),
  window: { start: '2026-04-01', end: '2027-04-01', fiscalYear },
});

describe('getVendorCurrentFySpend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getUserMetadata.mockResolvedValue(user);
    getDefaultCostMethod.mockResolvedValue('amortized');
    runSpendQuery.mockResolvedValue(response([100]));
  });

  it('queries the current fiscal year for the vendor, Bloomberg SID included', async () => {
    await getVendorCurrentFySpend(42);

    expect(getDefaultCostMethod).toHaveBeenCalledWith('org-1');
    expect(runSpendQuery).toHaveBeenCalledWith(
      user,
      {
        kind: 'spend',
        basis: 'amortized',
        window: 'currentFY',
        granularity: 'year',
        groupBy: 'total',
      },
      { vendorId: 42, bloombergSid: true },
    );
  });

  it('sends the Contract Term input when that is the org default', async () => {
    getDefaultCostMethod.mockResolvedValue('committed');

    const result = await getVendorCurrentFySpend(42);

    expect(runSpendQuery).toHaveBeenCalledWith(
      user,
      {
        kind: 'commitments',
        valuation: 'annual',
        recognition: 'term-start',
        window: 'currentFY',
        granularity: 'year',
        groupBy: 'total',
      },
      { vendorId: 42, bloombergSid: true },
    );
    expect(result?.costMethod).toBe('committed');
  });

  it('sums every item and rounds to cents', async () => {
    runSpendQuery.mockResolvedValue(response([0.105, 0.105, 1]));

    expect(await getVendorCurrentFySpend(42)).toEqual({
      amount: 1.21,
      fiscalYear: 2026,
      costMethod: 'amortized',
    });
  });

  it('reports the fiscal year the engine resolved', async () => {
    runSpendQuery.mockResolvedValue(response([5], 2031));

    expect((await getVendorCurrentFySpend(42))?.fiscalYear).toBe(2031);
  });

  it('is null without a signed-in user', async () => {
    getUserMetadata.mockResolvedValue(null);

    expect(await getVendorCurrentFySpend(42)).toBeNull();
    expect(runSpendQuery).not.toHaveBeenCalled();
  });
});

describe('getVendorSpendIndex', () => {
  const window = { start: '2026-04-01', end: '2027-04-01', fiscalYear: 2026 };
  type Input = { window: string; groupBy: string };
  const responsesFor = (
    pick: (input: Input) => Partial<{ items: unknown[]; refs: unknown }>,
  ) =>
    runSpendQuery.mockImplementation(async (_user: unknown, input: Input) => ({
      items: [],
      refs: {},
      window,
      ...pick(input),
    }));

  beforeEach(() => {
    jest.clearAllMocks();
    getUserMetadata.mockResolvedValue(user);
    getDefaultCostMethod.mockResolvedValue('amortized');
    loadSidSpendPopulation.mockResolvedValue(sidPopulation);
    responsesFor(() => ({}));
  });

  it('runs both fiscal windows by vendor and by product over one seats population', async () => {
    await getVendorSpendIndex();

    // One population for both runs, loaded over the span the current and next
    // fiscal years cover: two whole years from the org's April FY start.
    const [organizationId, options] = loadSidSpendPopulation.mock.calls[0] as [
      string,
      { window: { start: Date; end: Date } },
    ];
    expect(organizationId).toBe('org-1');
    expect(options.window.start.getUTCMonth()).toBe(3);
    expect(options.window.start.getUTCDate()).toBe(1);
    expect(options.window.end.getUTCFullYear()).toBe(
      options.window.start.getUTCFullYear() + 2,
    );
    expect(options.window.end.getUTCMonth()).toBe(3);
    const calls = runSpendQuery.mock.calls.map(([, input, scope]) => [
      input.window,
      input.groupBy,
      scope,
    ]);
    expect(calls).toEqual([
      ['currentFY', 'vendor', { bloombergSid: sidPopulation }],
      ['nextFY', 'vendor', { bloombergSid: sidPopulation }],
      ['currentFY', 'product', { bloombergSid: sidPopulation }],
      ['nextFY', 'product', { bloombergSid: sidPopulation }],
    ]);
    expect(runSpendQuery.mock.calls[0][1]).toEqual({
      kind: 'spend',
      basis: 'amortized',
      window: 'currentFY',
      granularity: 'year',
      groupBy: 'vendor',
    });
  });

  it('drops the vendor-less bucket instead of keying it as NaN', async () => {
    responsesFor(({ groupBy }) =>
      groupBy === 'vendor'
        ? {
            items: [
              { groupKey: 'null', period: 'FY2026', value: 500 },
              { groupKey: '1', period: 'FY2026', value: 100 },
            ],
          }
        : {},
    );

    const index = await getVendorSpendIndex();

    expect([...index.byVendorId.keys()]).toEqual([1]);
  });

  it('sums each vendor key to cents per window and labels it from the engine refs', async () => {
    responsesFor(({ window: w, groupBy }) => {
      if (groupBy !== 'vendor') return {};
      return w === 'currentFY'
        ? {
            items: [
              { groupKey: '1', period: 'FY2026', value: 0.105 },
              { groupKey: '1', period: 'FY2026', value: 0.105 },
              { groupKey: '9', period: 'FY2026', value: 900 },
            ],
            refs: {
              '9': { label: 'Bloomberg', vendorDomain: 'bloomberg.com' },
            },
          }
        : {
            items: [{ groupKey: '9', period: 'FY2027', value: 950 }],
            refs: {
              '9': { label: 'Bloomberg', vendorDomain: 'bloomberg.com' },
            },
          };
    });

    const index = await getVendorSpendIndex();

    expect([...index.byVendorId]).toEqual([
      [1, { current: 0.21, projected: 0 }],
      [9, { current: 900, projected: 950 }],
    ]);
    expect([...index.labels]).toEqual([
      [9, { name: 'Bloomberg', domain: 'bloomberg.com' }],
    ]);
  });

  it('places each product bucket under its vendor from the engine refs, both windows merged', async () => {
    const refs = {
      '1:7': { label: 'Terminal', vendorId: 1, productId: 7 },
      '-30041555:-4805414005': {
        label: 'Bloomberg Anywhere · Cindy Example',
        productName: 'Bloomberg Anywhere',
        vendorId: 9,
        productId: 28,
      },
    };
    responsesFor(({ window: w, groupBy }) => {
      if (groupBy !== 'product') return {};
      return w === 'currentFY'
        ? {
            items: [
              { groupKey: '1:7', period: 'FY2026', value: 0.105 },
              { groupKey: '1:7', period: 'FY2026', value: 0.105 },
              {
                groupKey: '-30041555:-4805414005',
                period: 'FY2026',
                value: 1200,
              },
            ],
            refs,
          }
        : { items: [{ groupKey: '1:7', period: 'FY2027', value: 640 }], refs };
    });

    const { products } = await getVendorSpendIndex();

    expect(products).toEqual([
      {
        vendorId: 1,
        contractId: 1,
        productId: 7,
        name: 'Terminal',
        current: 0.21,
        projected: 640,
      },
      {
        vendorId: 9,
        contractId: -30041555,
        productId: 28,
        name: 'Bloomberg Anywhere',
        current: 1200,
        projected: 0,
      },
    ]);
  });

  it('leaves out a product bucket the engine could not place under a vendor', async () => {
    responsesFor(({ groupBy }) =>
      groupBy === 'product'
        ? {
            items: [{ groupKey: '1:7', period: 'FY2026', value: 10 }],
            refs: { '1:7': { label: 'Orphan' } },
          }
        : {},
    );

    expect((await getVendorSpendIndex()).products).toEqual([]);
  });

  it('lists a Bloomberg product every seat of which is unpriced, at zero', async () => {
    loadSidSpendPopulation.mockResolvedValue({
      ...sidPopulation,
      seats: [
        {
          seat: {
            vendorId: 9,
            custNum: 500,
            gptt: 40,
            gpttDescription: 'Access Point',
            lastReportMonth: null,
          },
        },
      ],
    });
    responsesFor((input) =>
      input.groupBy === 'product'
        ? {
            items: [{ groupKey: '-500:-1', period: 'FY2026', value: 100 }],
            refs: {
              '-500:-1': {
                label: 'Bloomberg Anywhere',
                productName: 'Bloomberg Anywhere',
                vendorId: 9,
                productId: 28,
              },
            },
          }
        : {},
    );

    const { products } = await getVendorSpendIndex();

    expect(products.map((p) => [p.productId, p.name, p.current])).toEqual([
      [28, 'Bloomberg Anywhere', 100],
      [40, 'Access Point', 0],
    ]);
  });

  it('is empty without a signed-in user', async () => {
    getUserMetadata.mockResolvedValue(null);

    const index = await getVendorSpendIndex();

    expect(index.byVendorId.size).toBe(0);
    expect(index.products).toEqual([]);
    expect(runSpendQuery).not.toHaveBeenCalled();
    expect(loadSidSpendPopulation).not.toHaveBeenCalled();
  });
});

describe('getSidVendorTotals', () => {
  const window = { start: '2026-04-01', end: '2027-04-01', fiscalYear: 2026 };
  const population = {
    contracts: [{ id: -500 }],
    seats: [
      { seat: { vendorId: 469, lastReportMonth: null } },
      { seat: { vendorId: 469, lastReportMonth: null } },
      { seat: { vendorId: 469, lastReportMonth: '2026-03-01' } },
    ],
    refs: {},
    vendorIds: new Set([469]),
  };
  const rollupRef = {
    label: 'Bloomberg',
    vendorDomain: 'bloomberg.com',
    productName: 'Terminals and exchange entitlements',
    vendorId: 469,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getUserMetadata.mockResolvedValue(user);
    loadSidSpendPopulation.mockResolvedValue(population);
    runSpendQuery.mockImplementation(
      async (_user: unknown, input: { window: string }) => ({
        window,
        refs: { 'bloomberg:469': rollupRef, '12': { label: 'Acme' } },
        items:
          input.window === 'currentFY'
            ? [
                { groupKey: '12', period: 'FY2026', value: 500 },
                {
                  groupKey: 'bloomberg:469',
                  period: 'FY2026',
                  value: 8000.004,
                },
              ]
            : [{ groupKey: 'bloomberg:469', period: 'FY2027', value: 8520 }],
      }),
    );
  });

  it('runs both windows seats-only on the committed basis over one population loaded across them', async () => {
    await getSidVendorTotals();

    expect(loadSidSpendPopulation).toHaveBeenCalledTimes(1);
    expect(loadSidSpendPopulation).toHaveBeenCalledWith('org-1', {
      window: {
        start: new Date('2026-04-01T00:00:00.000Z'),
        end: new Date('2028-04-01T00:00:00.000Z'),
      },
    });
    expect(getDefaultCostMethod).not.toHaveBeenCalled();
    expect(runSpendQuery.mock.calls.map(([, input]) => input)).toEqual([
      {
        kind: 'commitments',
        valuation: 'annual',
        recognition: 'term-start',
        window: 'currentFY',
        granularity: 'year',
        groupBy: 'contract',
      },
      {
        kind: 'commitments',
        valuation: 'annual',
        recognition: 'term-start',
        window: 'nextFY',
        granularity: 'year',
        groupBy: 'contract',
      },
    ]);
    for (const [, , scope] of runSpendQuery.mock.calls) {
      expect(scope).toEqual({ bloombergSid: population, population: 'seats' });
    }
  });

  it('reads only the rollup keys, rounded to cents, with their labels', async () => {
    const totals = await getSidVendorTotals();

    expect([...totals.byVendorId]).toEqual([
      [469, { current: 8000, projected: 8520 }],
    ]);
    expect([...totals.labels]).toEqual([
      [469, { name: 'Bloomberg', domain: 'bloomberg.com' }],
    ]);
    expect(totals.vendorIds).toBe(population.vendorIds);
  });

  it('counts only the seats still in the latest report', async () => {
    const totals = await getSidVendorTotals();

    expect([...totals.seatCounts]).toEqual([[469, 2]]);
  });

  it('is empty, without running the engine, for an org without seats', async () => {
    loadSidSpendPopulation.mockResolvedValue({ ...population, contracts: [] });

    const totals = await getSidVendorTotals();

    expect(totals.byVendorId.size).toBe(0);
    expect(totals.vendorIds.size).toBe(0);
    expect(runSpendQuery).not.toHaveBeenCalled();
  });

  it('is empty without a signed-in user', async () => {
    getUserMetadata.mockResolvedValue(null);

    expect((await getSidVendorTotals()).byVendorId.size).toBe(0);
    expect(loadSidSpendPopulation).not.toHaveBeenCalled();
  });
});
