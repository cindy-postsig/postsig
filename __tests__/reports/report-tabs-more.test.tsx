/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

let pathname = '/reports';
jest.mock('next/navigation', () => ({ usePathname: () => pathname }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { ReportTabs } from '@/app/(app)/(cpm)/reports/ReportTabs';

// Radix's popper measures the menu; jsdom has no ResizeObserver.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const allReports = {
  invoices: { title: 'Invoice Discrepancies' },
  unconfirmed: { title: 'Unconfirmed Renewals' },
  nda: { title: 'NDA Insights' },
  trial: { title: 'Trial Agreements' },
  leavers: { title: 'Employee Departures (Leavers)' },
};

const tabHrefs = () =>
  screen.getAllByRole('link').map((link) => link.getAttribute('href'));
const more = () => screen.getByRole('button', { name: /More|Trial|Leavers/ });
// Radix opens the menu from the trigger's own keyboard handler; jsdom has
// no real pointer events to drive the pointerdown path.
const openMore = () => fireEvent.keyDown(more(), { key: 'Enter' });
const hasActiveTabClass = (el: HTMLElement) =>
  el.className.split(' ').includes('border-b-blue-950');

beforeEach(() => {
  pathname = '/reports';
});

describe('ReportTabs More menu', () => {
  it('keeps every report through NDA Insights as a tab and folds the rest into More', () => {
    render(<ReportTabs allReports={allReports} />);

    expect(tabHrefs()).toEqual([
      '/reports',
      '/reports/invoices',
      '/reports/unconfirmed',
      '/reports/nda',
    ]);
    expect(more().textContent).toContain('More');

    openMore();
    expect(
      screen
        .getAllByRole('menuitem')
        .map((item) => [item.textContent, item.getAttribute('href')]),
    ).toEqual([
      ['Trial Agreements', '/reports/trial'],
      ['Employee Departures (Leavers)', '/reports/leavers'],
    ]);
  });

  it('names the trigger after the open report when that report lives behind More', () => {
    pathname = '/reports/trial';
    render(<ReportTabs allReports={allReports} />);

    expect(more().textContent).toContain('Trial Agreements');
    expect(hasActiveTabClass(more())).toBe(true);
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('data-state')).toBe('inactive');
    }
  });

  it('stays a plain More, unhighlighted, while an inline tab is open', () => {
    pathname = '/reports/nda';
    render(<ReportTabs allReports={allReports} />);

    expect(more().textContent).toContain('More');
    expect(hasActiveTabClass(more())).toBe(false);
    expect(
      screen
        .getByRole('link', { name: 'NDA Insights' })
        .getAttribute('data-state'),
    ).toBe('active');
  });

  it('shows no More when nothing follows NDA Insights', () => {
    render(
      <ReportTabs
        allReports={{
          invoices: { title: 'Invoice Discrepancies' },
          nda: { title: 'NDA Insights' },
        }}
      />,
    );

    expect(screen.queryByRole('button', { name: /More/ })).toBeNull();
    expect(tabHrefs()).toEqual([
      '/reports',
      '/reports/invoices',
      '/reports/nda',
    ]);
  });
});
