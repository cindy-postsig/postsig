import { sidBudgetRow } from '@/lib/v2/bloomberg-sid/rows';

describe('sidBudgetRow', () => {
  const row = sidBudgetRow({
    vendorId: 469,
    name: 'Bloomberg Finance L.P.',
    domain: 'bloomberg.com',
    seats: 351,
    current: 7896867,
    projected: 8410163.36,
    currency: 'EUR',
  });

  it('keys the row outside the contract id space and names the vendor', () => {
    expect(row).toMatchObject({
      id: 'bloomberg:469',
      contract_id: 'bloomberg:469',
      vendor: 'Bloomberg Finance L.P.',
      vendorId: '469',
      vendorDomain: 'bloomberg.com',
      type: 'Subscription',
      typeId: 0,
      renewalType: 'Auto',
      contractStatus: 4,
      aiExtractionStatus: 'h_success',
      currency: 'EUR',
      termStartDate: null,
      termEndDate: null,
      cancelByDate: null,
    });
  });

  it('carries the committed seat figures on both the native and converted pair', () => {
    expect(row).toMatchObject({
      currentBudget: 7896867,
      projectedBudget: 8410163.36,
      convertedCurrentBudget: 7896867,
      convertedProjectedBudget: 8410163.36,
      annualDifference: 6.5,
      totalContractValue: 0,
      convertedTotalContractValue: 0,
    });
  });

  it('labels the product with the seat count', () => {
    expect(row.currentProducts.map((p) => p.vendor_products.name)).toEqual([
      'Terminals and exchange entitlements · 351 seats',
    ]);
    expect(row.currentYearProducts).toBe(row.currentProducts);
    expect(row.product).toEqual([
      {
        product_id: 0,
        name: 'Terminals and exchange entitlements · 351 seats',
      },
    ]);
  });

  it('reports no difference when a window is empty', () => {
    expect(
      sidBudgetRow({
        vendorId: 1,
        name: 'V',
        seats: 0,
        current: 0,
        projected: 100,
        currency: 'USD',
      }).annualDifference,
    ).toBe(0);
  });
});

import {
  sidRenewalRow,
  sidSeatsRenewingWithin,
} from '@/lib/v2/bloomberg-sid/rows';
import type { SidSeat } from '@/lib/v2/bloomberg-sid/spend';

const today = new Date('2026-09-08T00:00:00.000Z');
const seat = (
  sid: number,
  renewalDate: string,
  monthlyPrice: number,
  overrides: Partial<SidSeat> = {},
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
  ...overrides,
});

describe('sidSeatsRenewingWithin', () => {
  it('keeps live seats whose next renewal falls inside the window, inclusive', () => {
    const seats = [
      seat(1, '2026-09-08', 100),
      seat(2, '2026-12-07', 100),
      seat(3, '2026-12-08', 100),
      seat(4, '2026-09-07', 100),
      seat(5, '2024-10-01', 100),
      seat(6, '2026-10-01', 100, { lastReportMonth: '2026-03-01' }),
    ];

    expect(sidSeatsRenewingWithin(seats, today, 90).map((s) => s.sid)).toEqual([
      1, 2, 5,
    ]);
  });
});

describe('sidRenewalRow', () => {
  const row = sidRenewalRow({
    seats: [seat(1, '2026-10-01', 2215), seat(2, '2026-09-20', 1000)],
    vendor: { id: 469, name: 'Bloomberg', domain: 'bloomberg.com' },
    today,
    rangeDays: 90,
    currency: 'USD',
    toBase: 0.5,
  });

  it('keys the row with its window so it opens on the renewing seats', () => {
    expect(row.id).toBe('bloomberg:469:renewing:90');
    expect(row.contract_id).toBe('bloomberg:469:renewing:90');
  });

  it('dates the row at the earliest renewal with the 60-day cancel-by rule', () => {
    expect(row).toMatchObject({
      vendor: 'Bloomberg',
      renewalType: 'Auto',
      termEndDate: '2026-09-20',
      cancelByDate: '2026-07-22',
    });
    expect(row.currentProducts[0].vendor_products.name).toBe(
      '2 terminal seats renewing',
    );
  });

  it('values the seats annually now and after the renewal step, converted for totals', () => {
    expect(row).toMatchObject({
      currency: 'USD',
      currentBudget: 38580,
      // 2215 steps to 2358.98 a month (rounded to cents), 1000 to 1065.
      projectedBudget: 41087.76,
      convertedCurrentBudget: 19290,
      convertedProjectedBudget: 20543.88,
      annualDifference: 6.5,
    });
  });

  it('uses the singular for one seat', () => {
    const single = sidRenewalRow({
      seats: [seat(1, '2026-10-01', 100)],
      vendor: { id: 469, name: 'Bloomberg' },
      today,
      rangeDays: 30,
      currency: 'USD',
      toBase: 1,
    });
    expect(single.currentProducts[0].vendor_products.name).toBe(
      '1 terminal seat renewing',
    );
    expect(single.vendorDomain).toBe('');
  });
});
