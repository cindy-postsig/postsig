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

const hasInvoicesAccess = jest.fn();
jest.mock('@/lib/v2/invoices/access', () => ({
  hasInvoicesAccess: () => hasInvoicesAccess(),
}));

const getUserMetadata = jest.fn();
jest.mock('@/data/users', () => ({ getUserMetadata: () => getUserMetadata() }));

const can = jest.fn();
jest.mock('@/data/user-permissions', () => ({
  getAbilityForCurrentUser: async () => ({ can }),
}));

const loadInvoiceCostAllocationReport = jest.fn();
jest.mock('@/lib/v2/cost-allocation/invoice-report', () => ({
  loadInvoiceCostAllocationReport: (...args: unknown[]) =>
    loadInvoiceCostAllocationReport(...args),
}));

const reportProps = jest.fn();
jest.mock(
  '@/components/reports/invoice-cost-allocation/InvoiceCostAllocationReport',
  () => ({
    InvoiceCostAllocationReport: (props: Record<string, unknown>) => {
      reportProps(props);
      return null;
    },
  }),
);

import { ReportTabs } from '@/app/(app)/(cpm)/reports/ReportTabs';
import InvoiceCostAllocationPage from '@/app/(app)/(cpm)/reports/invoice-cost-allocation/page';

const allReports = {
  invoices: { title: 'Invoice Discrepancies' },
  utilization: { title: 'Contract Utilization' },
};

describe('ReportTabs flag gating', () => {
  it('lists the Invoice Cost Allocation tab when cost-allocation and Invoices are both on', () => {
    render(
      <ReportTabs
        allReports={allReports}
        costAllocationEnabled
        invoicesEnabled
      />,
    );

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/reports',
      '/reports/invoices',
      '/reports/invoice-cost-allocation',
      '/reports/allocation-rollup',
      '/reports/utilization',
    ]);
    expect(screen.getByText('Invoice Cost Allocation')).toBeTruthy();
  });

  it('hides the tab when cost-allocation is off', () => {
    render(<ReportTabs allReports={allReports} invoicesEnabled />);

    expect(screen.queryByText('Invoice Cost Allocation')).toBeNull();
    expect(
      screen.getAllByRole('link').map((link) => link.getAttribute('href')),
    ).toEqual(['/reports', '/reports/invoices', '/reports/utilization']);
  });

  it('hides the tab when the Invoices module is off, even with cost-allocation on', () => {
    // The layout drops Invoice Discrepancies from allReports without that
    // module; Invoice Cost Allocation shows real invoice data too, so it
    // needs the same module — cost allocation alone isn't enough.
    const { invoices: _invoices, ...withoutInvoices } = allReports;
    render(<ReportTabs allReports={withoutInvoices} costAllocationEnabled />);

    expect(screen.queryByText('Invoice Cost Allocation')).toBeNull();
    expect(screen.getByText('Cost Allocation Summary')).toBeTruthy();
    expect(
      screen.getAllByRole('link').map((link) => link.getAttribute('href')),
    ).toEqual([
      '/reports',
      '/reports/allocation-rollup',
      '/reports/utilization',
    ]);
  });
});

describe('invoice-cost-allocation page flag gating', () => {
  const user = {
    organizationId: 'org-1',
    baseCurrency: 'EUR',
    dateFormat: 'dd/MM/yyyy',
  };
  const report = {
    period: 'ytd',
    window: { start: '2026-01-01', end: '2026-08-25' },
    rows: [],
    undatedCount: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getUserMetadata.mockResolvedValue(user);
    loadInvoiceCostAllocationReport.mockResolvedValue(report);
    can.mockReturnValue(true);
    hasInvoicesAccess.mockResolvedValue(true);
  });

  it('404s before loading anything when cost-allocation is off', async () => {
    isCostAllocationEnabled.mockResolvedValue(false);

    await expect(
      InvoiceCostAllocationPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toBe(NOT_FOUND);
    expect(isCostAllocationEnabled).toHaveBeenCalledWith(user);
    expect(loadInvoiceCostAllocationReport).not.toHaveBeenCalled();
  });

  it('404s when the Invoices module is off, even with cost-allocation on', async () => {
    isCostAllocationEnabled.mockResolvedValue(true);
    hasInvoicesAccess.mockResolvedValue(false);

    await expect(
      InvoiceCostAllocationPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toBe(NOT_FOUND);
    expect(loadInvoiceCostAllocationReport).not.toHaveBeenCalled();
  });

  it('renders when both cost-allocation and the Invoices module are on', async () => {
    isCostAllocationEnabled.mockResolvedValue(true);

    render(
      await InvoiceCostAllocationPage({ searchParams: Promise.resolve({}) }),
    );

    expect(notFound).not.toHaveBeenCalled();
    expect(loadInvoiceCostAllocationReport).toHaveBeenCalled();
  });

  it('loads the requested preset and passes the admin gate down', async () => {
    isCostAllocationEnabled.mockResolvedValue(true);

    render(
      await InvoiceCostAllocationPage({
        searchParams: Promise.resolve({ period: 'ytd' }),
      }),
    );

    expect(loadInvoiceCostAllocationReport).toHaveBeenCalledWith(user, {
      period: 'ytd',
      from: undefined,
      to: undefined,
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
    expect(screen.getByText('Invoice Cost Allocation Report')).toBeTruthy();
  });

  it('leaves the period to the loader for an unknown preset, and read-only for non-admins', async () => {
    isCostAllocationEnabled.mockResolvedValue(true);
    can.mockReturnValue(false);

    render(
      await InvoiceCostAllocationPage({
        searchParams: Promise.resolve({ period: 'all-time' }),
      }),
    );

    // Passed through as typed: an unrecognised preset is the same as none
    // given, and the loader is what decides — including widening past an empty
    // month. Coercing here would pin the report to a period nobody chose.
    expect(loadInvoiceCostAllocationReport).toHaveBeenCalledWith(user, {
      period: 'all-time',
      from: undefined,
      to: undefined,
    });
    expect(reportProps).toHaveBeenCalledWith(
      expect.objectContaining({ canEdit: false }),
    );
  });

  it('forwards a typed custom range to the loader', async () => {
    isCostAllocationEnabled.mockResolvedValue(true);

    render(
      await InvoiceCostAllocationPage({
        searchParams: Promise.resolve({
          period: 'custom',
          from: '2026-05-01',
          to: '2026-05-31',
        }),
      }),
    );

    expect(loadInvoiceCostAllocationReport).toHaveBeenCalledWith(user, {
      period: 'custom',
      from: '2026-05-01',
      to: '2026-05-31',
    });
  });
});
