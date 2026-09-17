import {
  sidContractId,
  sidSeatExchangeProductId,
  sidSeatProductId,
  type SidSeat,
} from '@/lib/v2/bloomberg-sid/spend';
import {
  contractSeatFrom,
  isUnderusedSeat,
  seatBucketKeys,
  sidSeatFrom,
} from '@/lib/v2/seats/transforms';
import type { ContractSeatRow } from '@/lib/v2/seats/queries';
import type { SeatHolder, SeatVendor } from '@/lib/v2/seats/types';

const holder = (over: Partial<SeatHolder> = {}): SeatHolder => ({
  id: 1,
  name: 'Ada Lovelace',
  status: 'active',
  deleted_at: null,
  ...over,
});

const row = (over: Partial<ContractSeatRow> = {}): ContractSeatRow => ({
  id: 10,
  contract_id: 100,
  product_id: 200,
  org_employee_id: 1,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  start_date: '2026-01-15',
  created_at: '2025-11-02T09:00:00.000Z',
  product_name: 'Terminal',
  delivery_methods: ['Desktop'],
  ...over,
});

const vendor: SeatVendor = { id: 5, name: 'Bloomberg' };

const sidSeat = (over: Partial<SidSeat> = {}): SidSeat => ({
  vendorId: 5,
  custNum: 500,
  accountName: 'Trading Desk',
  currency: 'USD',
  sid: 266891,
  sidInstNum: 5,
  gptt: 7,
  gpttDescription: 'Bloomberg Anywhere',
  lastUser: 'user 492 ffm',
  ninetyDay: false,
  contractDate: '2000-04-07',
  terms: [
    { renewalDate: '2026-04-07', monthlyPrice: 2215 },
    { renewalDate: '2028-04-07', monthlyPrice: 2360 },
  ],
  exchange: [{ reportMonth: '2026-04-01', monthlyExchangeCost: 51.1 }],
  entitlements: [],
  lastReportMonth: null,
  ...over,
});

const terminalHolder = holder({ id: 31, name: 'Bo Zhang' });

describe('isUnderusedSeat', () => {
  it('is false for a live seat held by an active employee', () => {
    expect(isUnderusedSeat(holder())).toBe(false);
  });

  it.each([
    ['a departed holder', { status: 'inactive' }],
    ['a holder on leave', { status: 'on_leave' }],
    ['a soft-deleted holder', { deleted_at: '2026-03-01T00:00:00.000Z' }],
  ])('is true for %s', (_label, over) => {
    expect(isUnderusedSeat(holder(over))).toBe(true);
  });

  it('is true for a seat linked to nobody', () => {
    // Nothing releases a seat when someone leaves, so an unlinked row is a
    // licence with no accountable holder — the reclaim case the KPI names.
    expect(isUnderusedSeat(undefined)).toBe(true);
  });
});

describe('contractSeatFrom', () => {
  it('keys on the seat row and takes the vendor from the caller', () => {
    expect(contractSeatFrom(row(), holder(), vendor)).toEqual({
      id: 10,
      source: 'contract_user',
      contractId: 100,
      productId: 200,
      catalogProductId: 200,
      vendorId: 5,
      vendorName: 'Bloomberg',
      productName: 'Terminal',
      deliveryMethods: ['Desktop'],
      holder: { orgEmployeeId: 1, displayName: 'Ada Lovelace' },
      startDate: '2026-01-15',
      endDate: null,
      inactiveReasons: [],
      underused: false,
    });
  });

  it('falls back to the row date when HR recorded no start date', () => {
    expect(
      contractSeatFrom(row({ start_date: null }), holder(), vendor),
    ).toMatchObject({ startDate: '2025-11-02' });
  });

  it('labels a seat with no holder from its own snapshot and marks it underused', () => {
    const seat = contractSeatFrom(
      row({ org_employee_id: null, name: 'Legacy Seat' }),
      undefined,
      vendor,
    );
    expect(seat.holder).toEqual({
      orgEmployeeId: null,
      displayName: 'Legacy Seat',
    });
    expect(seat.inactiveReasons).toEqual(['not_in_hr']);
    expect(seat.underused).toBe(true);
  });

  it('names why a seat is wasted, never the vendor clause it cannot see', () => {
    expect(
      contractSeatFrom(row(), holder({ status: 'on_leave' }), vendor)
        .inactiveReasons,
    ).toEqual(['on_leave']);
  });

  it('names a product the join could not resolve rather than showing nothing', () => {
    expect(
      contractSeatFrom(row({ product_name: null }), holder(), vendor)
        .productName,
    ).toBe('Unnamed product');
  });
});

describe('sidSeatFrom', () => {
  it('uses the engine ids, the terminal delivery method and the term dates', () => {
    const seat = sidSeatFrom(sidSeat(), terminalHolder, 'Bloomberg');

    expect(seat).toEqual({
      id: sidSeatProductId({ sid: 266891, sidInstNum: 5 }),
      source: 'bloomberg_sid',
      contractId: sidContractId(500),
      productId: sidSeatProductId({ sid: 266891, sidInstNum: 5 }),
      catalogProductId: 7,
      vendorId: 5,
      vendorName: 'Bloomberg',
      productName: 'Bloomberg Anywhere',
      deliveryMethods: ['Terminal'],
      holder: { orgEmployeeId: 31, displayName: 'Bo Zhang' },
      startDate: '2000-04-07',
      endDate: '2028-04-07',
      inactiveReasons: [],
      underused: false,
      entitlements: {
        exchanges: [],
        productId: sidSeatExchangeProductId({ sid: 266891, sidInstNum: 5 }),
      },
    });
  });

  it('groups under the Bloomberg product code, though the engine prices per seat', () => {
    const seat = sidSeatFrom(sidSeat(), terminalHolder, 'Bloomberg');

    expect(seat.catalogProductId).toBe(7);
    expect(seat.productId).toBe(
      sidSeatProductId({ sid: 266891, sidInstNum: 5 }),
    );
  });

  it('keeps the imported name for a seat the roster could not place, and counts it underused', () => {
    const seat = sidSeatFrom(sidSeat(), undefined, 'Bloomberg');

    expect(seat.holder).toEqual({
      orgEmployeeId: null,
      displayName: 'user 492 ffm',
    });
    expect(seat.inactiveReasons).toEqual(['not_in_hr']);
    expect(seat.underused).toBe(true);
  });

  it('counts a seat held by a departed employee as underused', () => {
    const seat = sidSeatFrom(
      sidSeat(),
      holder({ id: 31, name: 'Bo Zhang', status: 'inactive' }),
      'Bloomberg',
    );
    expect(seat.inactiveReasons).toEqual(['leaver']);
    expect(seat.underused).toBe(true);
  });

  it('takes the dormant reason off the report’s own 90-day flag', () => {
    const seat = sidSeatFrom(
      sidSeat({ ninetyDay: true }),
      terminalHolder,
      'Bloomberg',
    );
    expect(seat.inactiveReasons).toEqual(['dormant']);
    expect(seat.underused).toBe(true);
  });

  it('keeps both reasons for a dormant seat the roster cannot place', () => {
    expect(
      sidSeatFrom(sidSeat({ ninetyDay: true }), undefined, 'Bloomberg')
        .inactiveReasons,
    ).toEqual(['not_in_hr', 'dormant']);
  });
});

describe('seatBucketKeys', () => {
  it('names the one product bucket a contract seat is priced from', () => {
    expect(seatBucketKeys(contractSeatFrom(row(), holder(), vendor))).toEqual([
      '100:200',
    ]);
  });

  it('names the contract itself for a seat recorded against no product', () => {
    // The engine has no product-less product key: a seat with no product is
    // priced from the whole contract, which is the groupBy 'contract' key.
    expect(
      seatBucketKeys(
        contractSeatFrom(row({ product_id: null }), holder(), vendor),
      ),
    ).toEqual(['100']);
  });

  it('names the price product of a Bloomberg terminal and the exchange product of its entitlements', () => {
    const seat = sidSeat();
    expect(
      seatBucketKeys(sidSeatFrom(seat, terminalHolder, 'Bloomberg')),
    ).toEqual([
      `${sidContractId(500)}:${sidSeatProductId(seat)}`,
      `${sidContractId(500)}:${sidSeatExchangeProductId(seat)}`,
    ]);
  });

  it('names only the price product for a terminal with no entitlements', () => {
    const seat = sidSeat({
      exchange: [{ reportMonth: '2026-04-01', monthlyExchangeCost: 0 }],
    });
    expect(
      seatBucketKeys(sidSeatFrom(seat, terminalHolder, 'Bloomberg')),
    ).toEqual([`${sidContractId(500)}:${sidSeatProductId(seat)}`]);
  });
});

describe('sidSeatFrom: entitlements', () => {
  it('rides the terminal seat, named after its exchanges and pointing at the engine’s exchange product', () => {
    const withEntitlements = sidSeat({
      entitlements: [
        {
          exchangeCode: 'CBOE',
          exchangeName: 'Cboe Europe L1',
          monthlyCost: 30,
        },
        { exchangeCode: 'LSE', exchangeName: 'LSE L2', monthlyCost: 21.1 },
      ],
    });

    expect(
      sidSeatFrom(withEntitlements, terminalHolder, 'Bloomberg').entitlements,
    ).toEqual({
      exchanges: [
        { code: 'CBOE', name: 'Cboe Europe L1', monthlyCost: 30 },
        { code: 'LSE', name: 'LSE L2', monthlyCost: 21.1 },
      ],
      productId: sidSeatExchangeProductId(withEntitlements),
    });
  });

  it('is charged but unnamed when only an earlier report priced any exchange', () => {
    expect(
      sidSeatFrom(sidSeat(), terminalHolder, 'Bloomberg').entitlements,
    ).toEqual({
      exchanges: [],
      productId: sidSeatExchangeProductId(sidSeat()),
    });
  });

  it('is absent for a terminal that never carried an entitlement charge', () => {
    expect(
      sidSeatFrom(
        sidSeat({
          exchange: [{ reportMonth: '2026-04-01', monthlyExchangeCost: 0 }],
        }),
        terminalHolder,
        'Bloomberg',
      ).entitlements,
    ).toBeUndefined();
  });
});
