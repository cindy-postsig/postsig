import type {
  ResolvedContractAllocation,
  ResolvedScope,
} from '@/lib/v2/cost-allocation/types';
import {
  monthBuckets,
  scopeForSeat,
  seatBucketTotal,
  seatEntitlementsCost,
  seatMonthlyCost,
  splitEntitlementsCost,
} from '@/lib/v2/assignments/cost';
import type { Seat } from '@/lib/v2/seats/types';
import {
  sidContractId,
  sidSeatExchangeProductId,
  sidSeatProductId,
  type SidSeat,
} from '@/lib/v2/bloomberg-sid/spend';
import { sidSeatFrom } from '@/lib/v2/seats/transforms';

const EMPLOYEE_ID = 7;
const OTHER_ID = 8;
const PARENT = 100;
const CHILD = 200;
const PRODUCT = 300;
const OTHER_PRODUCT = 400;

const scope = (
  productId: number | null,
  percent: number,
  sourceContractId = PARENT,
  employeeId = EMPLOYEE_ID,
): ResolvedScope => ({
  productId,
  mode: 'manual',
  sourceContractId,
  lines:
    percent === 0
      ? []
      : [
          {
            target: {
              kind: 'employee',
              id: employeeId,
              name: 'Ada',
              orgUnitId: 1,
            },
            percent,
          },
        ],
  unlinkedUserCount: 0,
});

const allocation = (
  contractId: number,
  scopes: ResolvedScope[],
): ResolvedContractAllocation => ({ contractId, scopes });

// One month of a groupBy 'product' query: the parent's two products, and a
// child record the month priced at nothing of its own.
const BUCKETS = monthBuckets([
  { period: '2026-04', groupKey: `${PARENT}:${PRODUCT}`, value: 217.83 },
  { period: '2026-04', groupKey: `${PARENT}:${OTHER_PRODUCT}`, value: 32.17 },
]);

describe('scopeForSeat', () => {
  const alloc = allocation(PARENT, [scope(null, 50), scope(PRODUCT, 25)]);

  it('prefers the seat’s own product scope', () => {
    expect(scopeForSeat(alloc, PRODUCT)?.productId).toBe(PRODUCT);
  });

  it('falls back to the whole-contract scope', () => {
    expect(scopeForSeat(alloc, 999)?.productId).toBeNull();
  });

  it('is undefined for an unallocated contract', () => {
    expect(scopeForSeat(undefined, PRODUCT)).toBeUndefined();
  });
});

describe('monthBuckets', () => {
  it('keys the engine’s own product buckets and sums them per contract', () => {
    expect(BUCKETS.byKey.get(`${PARENT}:${PRODUCT}`)).toBe(217.83);
    expect(BUCKETS.byContract.get(PARENT)).toBe(250);
  });

  it('sums a key the window reported more than once', () => {
    const buckets = monthBuckets([
      { period: '2026-04', groupKey: '1:2', value: 10 },
      { period: '2026-05', groupKey: '1:2', value: 5 },
    ]);
    expect(buckets.byKey.get('1:2')).toBe(15);
  });

  it('ignores a key that names no contract', () => {
    const buckets = monthBuckets([
      { period: '2026-04', groupKey: 'unassigned', value: 10 },
    ]);
    expect(buckets.byContract.size).toBe(0);
  });
});

describe('seatMonthlyCost', () => {
  it('is the employee’s percent of the scope’s month bucket', () => {
    expect(
      seatMonthlyCost(scope(PRODUCT, 33.33), PARENT, BUCKETS, EMPLOYEE_ID),
    ).toBe(72.6);
  });

  it('prices a whole-contract scope from every product bucket on it', () => {
    expect(
      seatMonthlyCost(scope(null, 50, PARENT), PARENT, BUCKETS, EMPLOYEE_ID),
    ).toBe(125);
  });

  it('is zero for a product the month priced at nothing', () => {
    expect(seatMonthlyCost(scope(999, 100), PARENT, BUCKETS, EMPLOYEE_ID)).toBe(
      0,
    );
  });

  it('prices an inherited scope from its source when the record has no bucket', () => {
    // The record itself is absent from the month, so its allocation source
    // funds it — the Cost Allocation tab's own inheritance rule.
    expect(
      seatMonthlyCost(scope(PRODUCT, 50, PARENT), CHILD, BUCKETS, EMPLOYEE_ID),
    ).toBe(108.92);
  });

  it('keeps a record the month priced at zero on its own zero', () => {
    const withChild = monthBuckets([
      { period: '2026-04', groupKey: `${PARENT}:${PRODUCT}`, value: 217.83 },
      { period: '2026-04', groupKey: `${CHILD}:${PRODUCT}`, value: 0 },
    ]);
    expect(
      seatMonthlyCost(
        scope(PRODUCT, 50, PARENT),
        CHILD,
        withChild,
        EMPLOYEE_ID,
      ),
    ).toBe(0);
  });

  it('is zero when no line targets this person', () => {
    expect(
      seatMonthlyCost(
        scope(PRODUCT, 50, PARENT, OTHER_ID),
        PARENT,
        BUCKETS,
        EMPLOYEE_ID,
      ),
    ).toBe(0);
  });

  it('is zero without a scope', () => {
    expect(seatMonthlyCost(undefined, PARENT, BUCKETS, EMPLOYEE_ID)).toBe(0);
  });
});

describe('seatBucketTotal', () => {
  const sidSeat: SidSeat = {
    vendorId: 5,
    custNum: 500,
    accountName: 'Berenberg',
    currency: 'USD',
    sid: 266891,
    sidInstNum: 5,
    gptt: 1234,
    gpttDescription: 'Bloomberg Anywhere',
    lastUser: 'user 492 ffm',
    ninetyDay: false,
    contractDate: '2000-04-07',
    terms: [{ renewalDate: '2028-04-07', monthlyPrice: 2360 }],
    exchange: [{ reportMonth: '2026-04-01', monthlyExchangeCost: 51.1 }],
    entitlements: [],
    lastReportMonth: null,
  };
  const account = sidContractId(500);
  const seat = sidSeatFrom(sidSeat, undefined, 'Bloomberg');
  const contractSeat: Seat = {
    id: 10,
    source: 'contract_user',
    contractId: PARENT,
    productId: PRODUCT,
    catalogProductId: PRODUCT,
    vendorId: 5,
    vendorName: 'Vendor',
    productName: 'Terminal',
    deliveryMethods: [],
    holder: { orgEmployeeId: EMPLOYEE_ID, displayName: 'Ada' },
    startDate: null,
    endDate: null,
    inactiveReasons: [],
    underused: false,
  };

  const buckets = monthBuckets([
    {
      period: '2026-04',
      groupKey: `${account}:${sidSeatProductId(sidSeat)}`,
      value: 2018.9,
    },
    {
      period: '2026-04',
      groupKey: `${account}:${sidSeatExchangeProductId(sidSeat)}`,
      value: 43.7,
    },
  ]);

  it('is the terminal’s price plus its exchange charge, and names the exchange share', () => {
    expect(seatBucketTotal(seat, buckets)).toBe(2062.6);
    expect(seatEntitlementsCost(seat, buckets)).toBe(43.7);
  });

  it('has no exchange share on a contract seat', () => {
    expect(seatEntitlementsCost(contractSeat, buckets)).toBe(0);
  });

  it('is zero for a month the engine placed nothing in', () => {
    expect(seatBucketTotal(seat, monthBuckets([]))).toBe(0);
  });
});

describe('splitEntitlementsCost', () => {
  it('splits the engine figure by the report’s charges, with the remainder on the last exchange', () => {
    expect(
      splitEntitlementsCost(
        [{ monthlyCost: 30 }, { monthlyCost: 21.1 }, { monthlyCost: 0 }],
        43.7,
      ),
    ).toEqual([25.66, 18.04, 0]);
  });

  it('puts the whole figure on the first exchange when the report priced none', () => {
    expect(
      splitEntitlementsCost([{ monthlyCost: 0 }, { monthlyCost: 0 }], 43.7),
    ).toEqual([43.7, 0]);
  });

  it('is empty for a seat with no exchanges', () => {
    expect(splitEntitlementsCost([], 43.7)).toEqual([]);
  });
});
