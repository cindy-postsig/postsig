/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

const NOT_FOUND = new Error('NEXT_NOT_FOUND');
const notFound = jest.fn(() => {
  throw NOT_FOUND;
});
jest.mock('next/navigation', () => ({
  notFound: () => notFound(),
  usePathname: () => '/reports',
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

const isCostAllocationEnabled = jest.fn();
jest.mock('@/lib/v2/cost-allocation/flag', () => ({
  isCostAllocationEnabled: (...args: unknown[]) =>
    isCostAllocationEnabled(...args),
}));

const getUserMetadata = jest.fn();
jest.mock('@/data/users', () => ({ getUserMetadata: () => getUserMetadata() }));

const can = jest.fn();
jest.mock('@/data/user-permissions', () => ({
  getAbilityForCurrentUser: async () => ({ can }),
}));

const loadAllocationRollupReport = jest.fn();
jest.mock('@/lib/v2/cost-allocation/rollup-report', () => ({
  loadAllocationRollupReport: (...args: unknown[]) =>
    loadAllocationRollupReport(...args),
}));

const reportProps = jest.fn();
jest.mock(
  '@/components/reports/allocation-rollup/AllocationRollupReport',
  () => ({
    AllocationRollupReport: (props: Record<string, unknown>) => {
      reportProps(props);
      return null;
    },
  }),
);

import { ReportTabs } from '@/app/(app)/(cpm)/reports/ReportTabs';
import AllocationRollupPage from '@/app/(app)/(cpm)/reports/allocation-rollup/page';

const allReports = {
  invoices: { title: 'Invoice Discrepancies' },
  utilization: { title: 'Contract Utilization' },
};

describe('ReportTabs flag gating — Cost Allocation Summary', () => {
  it('lists the summary after Invoice Cost Allocation when the flag is on', () => {
    render(
      <ReportTabs
        allReports={allReports}
        costAllocationEnabled
        invoicesEnabled
      />,
    );

    expect(
      screen.getAllByRole('link').map((link) => link.getAttribute('href')),
    ).toEqual([
      '/reports',
      '/reports/invoices',
      '/reports/invoice-cost-allocation',
      '/reports/allocation-rollup',
      '/reports/utilization',
    ]);
    expect(screen.getByText('Cost Allocation Summary')).toBeTruthy();
  });

  it('hides the tab when the flag is off', () => {
    render(<ReportTabs allReports={allReports} />);

    expect(screen.queryByText('Cost Allocation Summary')).toBeNull();
  });
});

describe('allocation-rollup page flag gating', () => {
  const user = {
    organizationId: 'org-1',
    organizationFY: 1,
    baseCurrency: 'EUR',
    dateFormat: 'dd/MM/yyyy',
  };
  const report = { period: 'ytd', rows: {}, views: [] };

  beforeEach(() => {
    jest.clearAllMocks();
    getUserMetadata.mockResolvedValue(user);
    loadAllocationRollupReport.mockResolvedValue(report);
    can.mockReturnValue(true);
  });

  it('404s before loading anything when the flag is off', async () => {
    isCostAllocationEnabled.mockResolvedValue(false);

    await expect(
      AllocationRollupPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toBe(NOT_FOUND);
    expect(isCostAllocationEnabled).toHaveBeenCalledWith(user);
    expect(loadAllocationRollupReport).not.toHaveBeenCalled();
  });

  it('loads the requested window for the user and passes the admin gate down', async () => {
    isCostAllocationEnabled.mockResolvedValue(true);

    render(
      await AllocationRollupPage({
        searchParams: Promise.resolve({
          period: 'custom',
          from: '2026-01-01',
          to: '2026-03-31',
        }),
      }),
    );

    expect(loadAllocationRollupReport).toHaveBeenCalledWith(user, {
      period: 'custom',
      from: '2026-01-01',
      to: '2026-03-31',
    });
    expect(can).toHaveBeenCalledWith('manage', 'Organization');
    expect(reportProps).toHaveBeenCalledWith(
      expect.objectContaining({
        data: report,
        canEdit: true,
        baseCurrency: 'EUR',
        dateFormat: 'dd/MM/yyyy',
      }),
    );
    expect(screen.getByText('Cost Allocation Summary')).toBeTruthy();
  });

  it('is read-only for non-admins', async () => {
    isCostAllocationEnabled.mockResolvedValue(true);
    can.mockReturnValue(false);

    render(await AllocationRollupPage({ searchParams: Promise.resolve({}) }));

    expect(reportProps).toHaveBeenCalledWith(
      expect.objectContaining({ canEdit: false }),
    );
  });
});
