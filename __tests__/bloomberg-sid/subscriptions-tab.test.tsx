/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { SubscriptionsTab } from '@/components/bloomberg-sid/SubscriptionsTab';
import type {
  SidAccount,
  SidHrMatch,
  SidKey,
  SidSubscription,
} from '@/lib/v2/bloomberg-sid/report';
import {
  DEFAULT_SUBSCRIPTION_FILTERS,
  type SubscriptionFilters,
} from '@/lib/v2/bloomberg-sid/subscription-filters';
import type { SidAllocation } from '@/lib/v2/bloomberg-sid/transforms';

// Radix's popper measures its content; jsdom has no ResizeObserver.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  jest.useFakeTimers().setSystemTime(new Date('2026-09-15T00:00:00Z'));
});

afterAll(() => {
  jest.useRealTimers();
});

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
];

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
    ninetyDay: true,
    renewalDate: '2028-04-01',
  }),
  subscription({
    sid: 1003,
    lastUser: 'Katherine Johnson',
    renewalDate: '2028-04-01',
  }),
  subscription({
    sid: 1004,
    lastUser: 'PROXYUSER BMDS3519',
    renewalDate: '2028-04-01',
  }),
];

const employee = (fullName: string, status: string): SidHrMatch => ({
  confidence: 'Exact name',
  employee: {
    id: fullName.length,
    fullName,
    department: 'Rates',
    costCenter: 'CC1',
    status,
    unitPath: {},
  },
});

const HR_MATCHES: Record<string, SidHrMatch> = {
  'Ada Lovelace': employee('Ada Lovelace', 'active'),
  'Alan Turing': employee('Alan Turing', 'departed'),
  'Katherine Johnson': employee('Katherine Johnson', 'on_leave'),
  'PROXYUSER BMDS3519': { confidence: 'Missing HR match', employee: null },
};

const renderTab = (filters: Partial<SubscriptionFilters> = {}) =>
  render(
    <SubscriptionsTab
      subscriptions={SUBSCRIPTIONS}
      accounts={ACCOUNTS}
      accountsByCustNum={new Map([[100, ACCOUNTS[0]]])}
      allocationsBySid={new Map<SidKey, SidAllocation[]>()}
      hrMatches={HR_MATCHES}
      filters={{ ...DEFAULT_SUBSCRIPTION_FILTERS, ...filters }}
      setFilters={jest.fn()}
    />,
  );

const rowOf = (lastUser: string): HTMLElement => {
  const cell = screen.getByText(lastUser).closest('tr');
  if (!cell) throw new Error(`no row for ${lastUser}`);
  return cell;
};

describe('the Terminal Subscriptions tab', () => {
  it.each([
    ['an active employee', 'Ada Lovelace', 'Active'],
    [
      'a leaver Bloomberg also flags',
      'Alan Turing',
      'Inactive (Leaver, No use in 90 days)',
    ],
    ['an employee on leave', 'Katherine Johnson', 'Inactive (On leave)'],
    [
      'a name the roster cannot place',
      'PROXYUSER BMDS3519',
      'Inactive (Employee not found)',
    ],
  ])('shows the status of %s', (_label, lastUser, status) => {
    renderTab();
    expect(within(rowOf(lastUser)).getByText(status)).toBeTruthy();
  });

  it('counts every seat when nothing is filtered', () => {
    renderTab();
    expect(screen.getByText(/4 of 4 subscriptions/)).toBeTruthy();
  });

  it('narrows to the seats the roster calls inactive', () => {
    renderTab({ status: 'Inactive' });
    expect(screen.getByText(/3 of 4 subscriptions/)).toBeTruthy();
    expect(screen.queryByText('Ada Lovelace')).toBeNull();
  });

  it('narrows to the seats renewing inside the window the link carried', () => {
    renderTab({ renewingWithinDays: 30 });
    expect(screen.getByText(/1 of 4 subscriptions/)).toBeTruthy();
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
  });

  it('sorts by Cancel By from its header', () => {
    renderTab();
    const cancelBy = screen.getByRole('button', { name: 'Cancel By' });
    const rowIndexOf = (lastUser: string) =>
      (rowOf(lastUser) as HTMLTableRowElement).rowIndex;

    fireEvent.click(cancelBy);
    expect(rowIndexOf('Ada Lovelace')).toBe(1);

    fireEvent.click(cancelBy);
    expect(rowIndexOf('Ada Lovelace')).toBe(SUBSCRIPTIONS.length);
  });
});
