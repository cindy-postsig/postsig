import type {
  SidAccount,
  SidHrMatch,
  SidSubscription,
} from '@/lib/v2/bloomberg-sid/report';
import {
  DEFAULT_SUBSCRIPTION_FILTERS,
  filterSubscriptions,
  type SubscriptionFilters,
} from '@/lib/v2/bloomberg-sid/subscription-filters';

const ACCOUNTS: SidAccount[] = [
  {
    custNum: 100,
    name: 'Alpha Ltd',
    city: 'London',
    state: 'ENG',
    country: 'GB',
    currencyCode: 'D',
    taxRate: 20,
    auto: 2,
    term: 2,
  },
  {
    custNum: 200,
    name: 'Beta AG',
    city: 'Zurich',
    state: null,
    country: 'CH',
    currencyCode: 'D',
    taxRate: 8.1,
    auto: 2,
    term: 2,
  },
];

const ACCOUNTS_BY_CUST_NUM = new Map(
  ACCOUNTS.map((account) => [account.custNum, account]),
);

const subscription = (
  over: Partial<SidSubscription> & Pick<SidSubscription, 'sid' | 'lastUser'>,
): SidSubscription => ({
  custNum: 100,
  sidInstNum: 1,
  contractDate: '2022-10-01',
  renewalDate: '2026-10-01',
  sidType: 1,
  sidDescription: 'Subscription',
  gptt: 28,
  gpttDescription: 'Bloomberg Anywhere',
  serialNumber: `SN-${over.sid}`,
  ws: null,
  ninetyDay: false,
  special: null,
  price: 2215,
  poNumber: null,
  ...over,
});

const SUBSCRIPTIONS: SidSubscription[] = [
  subscription({ sid: 1001, lastUser: 'Ada Lovelace' }),
  subscription({
    sid: 1002,
    lastUser: 'Alan Turing',
    renewalDate: '2026-12-01',
  }),
  subscription({
    sid: 1003,
    lastUser: 'PROXYUSER BMDS3519',
    custNum: 200,
    gpttDescription: 'Open Bloomberg',
    gptt: 30,
    renewalDate: '2024-10-20',
  }),
  subscription({
    sid: 1004,
    lastUser: 'Grace Hopper',
    custNum: 200,
    ninetyDay: true,
    renewalDate: '2027-06-01',
  }),
  subscription({
    sid: 1005,
    lastUser: 'Katherine Johnson',
    renewalDate: '2028-02-01',
  }),
];

const hrMatch = (fullName: string, status: string): [string, SidHrMatch] => [
  fullName,
  {
    confidence: 'Exact name',
    employee: {
      id: fullName.length,
      fullName,
      department: 'Rates',
      costCenter: 'CC1',
      status,
      unitPath: {},
    },
  },
];

const HR_MATCHES: Record<string, SidHrMatch> = Object.fromEntries<SidHrMatch>([
  hrMatch('Ada Lovelace', 'active'),
  hrMatch('Alan Turing', 'departed'),
  hrMatch('Grace Hopper', 'active'),
  hrMatch('Katherine Johnson', 'on_leave'),
  ['PROXYUSER BMDS3519', { confidence: 'Missing HR match', employee: null }],
]);

// Fixed so the renewal-window cases read the same on any day.
const TODAY = new Date('2026-09-15T00:00:00Z');

const run = (over: Partial<SubscriptionFilters> = {}): number[] =>
  filterSubscriptions(
    SUBSCRIPTIONS,
    { ...DEFAULT_SUBSCRIPTION_FILTERS, ...over },
    {
      accountsByCustNum: ACCOUNTS_BY_CUST_NUM,
      hrMatches: HR_MATCHES,
      today: TODAY,
    },
  ).map((sub) => sub.sid);

describe('filterSubscriptions', () => {
  it('keeps every seat by default', () => {
    expect(run()).toEqual([1001, 1002, 1003, 1004, 1005]);
  });

  it.each([
    ['a SID', '1003'],
    ['a UUID', 'sn-1003'],
    ['a last user', 'proxyuser'],
  ])('searches on %s', (_label, search) => {
    expect(run({ search })).toEqual([1003]);
  });

  it('narrows to one account number', () => {
    expect(run({ custNum: '200' })).toEqual([1003, 1004]);
  });

  it('narrows to one entity, which only the account row names', () => {
    expect(run({ entityName: 'Alpha Ltd' })).toEqual([1001, 1002, 1005]);
  });

  it('narrows to one product', () => {
    expect(run({ product: 'Open Bloomberg' })).toEqual([1003]);
  });

  describe('status', () => {
    it('counts a leaver, an unmatched name and a 90-day-flagged seat as inactive', () => {
      expect(run({ status: 'Inactive' })).toEqual([1002, 1003, 1004, 1005]);
    });

    it('leaves only seats held by an active employee', () => {
      expect(run({ status: 'Active' })).toEqual([1001]);
    });
  });

  describe('renewing within', () => {
    it('keeps the seats renewing inside the window', () => {
      expect(run({ renewingWithinDays: 30 })).toEqual([1001]);
      expect(run({ renewingWithinDays: 90 })).toEqual([1001, 1002, 1003]);
    });

    it('steps a renewal date already past forward by whole terms', () => {
      // 2024-10-20 renewed once already; the next falls on 2026-10-20.
      expect(run({ renewingWithinDays: 60 })).toEqual([1001, 1003]);
    });

    it('combines with the other filters', () => {
      expect(run({ renewingWithinDays: 60, status: 'Active' })).toEqual([1001]);
    });
  });
});
