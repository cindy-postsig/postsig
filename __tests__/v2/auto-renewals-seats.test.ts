const getUserMetadata = jest.fn();
jest.mock('@/data/users', () => ({
  getUserMetadata: () => getUserMetadata(),
}));
const loadSidSpendPopulation = jest.fn();
jest.mock('@/lib/v2/bloomberg-sid/population', () => ({
  loadSidSpendPopulation: (...args: unknown[]) =>
    loadSidSpendPopulation(...args),
}));
const getLatestUsdRates = jest.fn();
jest.mock('@/lib/v2/core/fxRates', () => {
  const actual = jest.requireActual('@/lib/v2/core/fxRates');
  return {
    ...actual,
    getLatestUsdRates: (...args: unknown[]) => getLatestUsdRates(...args),
  };
});

import { autoRenewalsReport } from '@/lib/v2/reports/definitions/renewals';
import type { SidSeat } from '@/lib/v2/bloomberg-sid/spend';
import { addUTCDays, formatUTCDate } from '@/lib/v2/spend/dates';

const seat = (
  sid: number,
  renewalDate: string,
  monthlyPrice: number,
): SidSeat => ({
  vendorId: 469,
  custNum: 500,
  accountName: 'Trading Desk',
  currency: 'USD',
  sid,
  sidInstNum: 1,
  gptt: 28,
  gpttDescription: 'Bloomberg Anywhere',
  lastUser: `user ${sid}`,
  ninetyDay: false,
  contractDate: '2020-01-01',
  terms: [{ renewalDate, monthlyPrice }],
  exchange: [],
  entitlements: [],
  lastReportMonth: null,
});

const populationOf = (seats: SidSeat[]) => ({
  seats: seats.map((s) => ({ seat: s, vendorName: 'Bloomberg Finance L.P.' })),
  refs: {
    '469': { label: 'Bloomberg Finance L.P.', vendorDomain: 'bloomberg.com' },
  },
});

const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const inDays = (days: number) => formatUTCDate(addUTCDays(today, days));

async function run(range?: number) {
  const context = await autoRenewalsReport.enrich!([], { range });
  const rows = autoRenewalsReport.transform([], context);
  return {
    rows,
    total: autoRenewalsReport.calculateTotal!(rows, 'projectedBudget'),
  };
}

describe('autoRenewalsReport — Bloomberg seats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getUserMetadata.mockResolvedValue({
      organizationId: 'org-1',
      baseCurrency: 'EUR',
    });
    getLatestUsdRates.mockResolvedValue({ USD: 1, EUR: 0.5 });
  });

  it('appends one row for the seats renewing in the window and counts it in the total', async () => {
    loadSidSpendPopulation.mockResolvedValue(
      populationOf([
        seat(1, inDays(10), 1000),
        seat(2, inDays(80), 1000),
        seat(3, inDays(120), 1000),
      ]),
    );

    const { rows, total } = await run(90);

    expect(loadSidSpendPopulation).toHaveBeenCalledWith('org-1', {
      window: { start: today, end: addUTCDays(today, 90) },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      // Keyed with the window, so the row opens the inventory view on
      // exactly the seats it counted.
      id: 'bloomberg:469:renewing:90',
      vendor: 'Bloomberg Finance L.P.',
      vendorDomain: 'bloomberg.com',
      termEndDate: inDays(10),
      cancelByDate: inDays(-50),
      currentBudget: 24000,
      projectedBudget: 25560,
      convertedProjectedBudget: 12780,
    });
    expect(total).toBe(12780);
  });

  it('defaults the window to 90 days like the contracts', async () => {
    loadSidSpendPopulation.mockResolvedValue(
      populationOf([seat(1, inDays(89), 100), seat(2, inDays(91), 100)]),
    );

    const { rows } = await run();

    expect(rows[0].currentProducts[0].vendor_products.name).toBe(
      '1 terminal seat renewing',
    );
  });

  it('adds nothing when no seat renews in the window', async () => {
    loadSidSpendPopulation.mockResolvedValue(
      populationOf([seat(1, inDays(200), 100)]),
    );

    const { rows, total } = await run(90);

    expect(rows).toEqual([]);
    expect(total).toBe(0);
    expect(getLatestUsdRates).not.toHaveBeenCalled();
  });

  it('leaves an org without seats unchanged', async () => {
    loadSidSpendPopulation.mockResolvedValue(populationOf([]));

    expect((await run(90)).rows).toEqual([]);
  });
});
