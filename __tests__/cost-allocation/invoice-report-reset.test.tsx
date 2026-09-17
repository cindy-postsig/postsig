/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { InvoiceReportData } from '@/lib/v2/cost-allocation/invoice-report-rows';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/reports/invoice-cost-allocation',
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
jest.mock('@/components/vendors/VendorIcon', () => ({
  __esModule: true,
  default: ({ name }: { name: string }) => <span>{`icon:${name}`}</span>,
}));
jest.mock(
  '@/components/reports/invoice-cost-allocation/InvoiceAllocationSheet',
  () => ({ InvoiceAllocationSheet: () => null }),
);

// The Spend by Allocation Target list is a Radix ScrollArea, which observes
// its viewport to decide whether the scrollbar is needed; jsdom has no
// ResizeObserver, and nothing here asserts on the scrollbar.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
// The real filter opens a popover; a button that selects the first option is
// enough to drive the report's filter state.
jest.mock('@/components/ui/data-table/components/MultiSelectFilter', () => ({
  MultiSelectFilter: ({
    options,
    value,
    onValueChange,
    placeholder,
  }: {
    options: { value: string }[];
    value: string[];
    onValueChange: (next: string[]) => void;
    placeholder: string;
  }) => (
    <button type="button" onClick={() => onValueChange([options[0].value])}>
      {value.length > 0 ? `${placeholder}: ${value.length}` : placeholder}
    </button>
  ),
}));

import { InvoiceCostAllocationReport } from '@/components/reports/invoice-cost-allocation/InvoiceCostAllocationReport';

const data = (
  overrides: Partial<InvoiceReportData> = {},
): InvoiceReportData => ({
  period: 'this-month',
  widenedFrom: null,
  window: { start: '2026-08-01', end: '2026-09-01' },
  custom: null,
  undatedCount: 0,
  rows: [
    {
      id: 300,
      vendor: 'Bloomberg',
      vendorDomain: 'bloomberg.com',
      product: 'Terminal',
      products: [{ id: 7, name: 'Terminal' }],
      invoiceNumber: 'INV-300',
      billingDate: '2026-08-10',
      amount: 1000,
      parentContract: { id: 100, label: 'MSA-2026-001' },
      provenance: { kind: 'inherited', sourceContractId: 100 },
      sourceContract: { id: 100, label: 'MSA-2026-001' },
      hasScope: true,
      targets: [
        {
          key: 'org_unit:3',
          name: 'Research',
          typeLabel: 'Department',
          percent: 100,
          amount: 1000,
          productId: null,
          productName: null,
        },
      ],
      unlinkedUserCount: 0,
    },
  ],
  ...overrides,
});

const renderReport = (report: InvoiceReportData) =>
  render(
    <InvoiceCostAllocationReport
      data={report}
      canEdit={false}
      baseCurrency="USD"
      dateFormat="yyyy-MM-dd"
    />,
  );

const resetButton = () => screen.queryByRole('button', { name: 'Reset' });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('InvoiceCostAllocationReport allocation column', () => {
  it('prints a shared-name target with its parents beside it, in the chip and the spend list', () => {
    const base = data().rows[0];
    renderReport(
      data({
        rows: [
          {
            ...base,
            targets: [
              { ...base.targets[0], breadcrumb: 'Global Equities · Bank' },
            ],
          },
        ],
      }),
    );

    expect(screen.getAllByText('· Global Equities · Bank')).toHaveLength(2);
  });

  it('tells apart unassigned, no applicable scope, and an applicable scope with no lines', () => {
    const base = data().rows[0];
    renderReport(
      data({
        rows: [
          {
            ...base,
            id: 1,
            invoiceNumber: 'INV-1',
            targets: [],
            hasScope: false,
            provenance: { kind: 'none' },
          },
          {
            ...base,
            id: 2,
            invoiceNumber: 'INV-2',
            targets: [],
            hasScope: false,
          },
          {
            ...base,
            id: 3,
            invoiceNumber: 'INV-3',
            targets: [],
            hasScope: true,
          },
        ],
      }),
    );

    const cell = (invoiceNumber: string) =>
      within(
        screen.getByText(invoiceNumber).closest('tr') as HTMLElement,
      ).getAllByRole('cell')[6].textContent;
    expect(cell('INV-1')).toBe('Unassigned');
    expect(cell('INV-2')).toBe('No scope for its products');
    expect(cell('INV-3')).toBe('No linked active users');
  });
});

describe('InvoiceCostAllocationReport reset', () => {
  it('offers no reset at the defaults: this month, no target or vendor filter', () => {
    renderReport(data());

    expect(resetButton()).toBeNull();
  });

  it('offers a reset when the period alone deviates and restores the default period', () => {
    renderReport(data({ period: 'last-month' }));

    const reset = resetButton();
    expect(reset).toBeTruthy();
    fireEvent.click(reset as HTMLElement);

    expect(push).toHaveBeenCalledWith('/reports/invoice-cost-allocation');
  });

  it('offers a reset for a target or vendor filter and clears both without a navigation', () => {
    renderReport(data());

    fireEvent.click(
      screen.getByRole('button', { name: 'All Allocation Targets' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'All Vendors' }));
    expect(screen.getByText('All Allocation Targets: 1')).toBeTruthy();
    expect(screen.getByText('All Vendors: 1')).toBeTruthy();

    fireEvent.click(resetButton() as HTMLElement);

    expect(resetButton()).toBeNull();
    expect(screen.getByText('All Allocation Targets')).toBeTruthy();
    expect(screen.getByText('All Vendors')).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it('clears the filters and the period together in one click', () => {
    renderReport(data({ period: 'ytd' }));
    fireEvent.click(screen.getByRole('button', { name: 'All Vendors' }));

    fireEvent.click(resetButton() as HTMLElement);

    expect(screen.getByText('All Vendors')).toBeTruthy();
    expect(push).toHaveBeenCalledWith('/reports/invoice-cost-allocation');
  });

  it('offers a reset for a custom range and drops its dates with the period', () => {
    renderReport(
      data({
        period: 'custom',
        window: { start: '2026-05-01', end: '2026-06-01' },
        custom: { from: '2026-05-01', to: '2026-05-31' },
      }),
    );

    fireEvent.click(resetButton() as HTMLElement);

    // The bare pathname carries no period, from or to.
    expect(push).toHaveBeenCalledWith('/reports/invoice-cost-allocation');
  });

  it('offers no reset for a window the report widened to on its own', () => {
    renderReport(data({ period: 'all', widenedFrom: 'this-month' }));

    expect(resetButton()).toBeNull();
    expect(
      screen.getByText('Nothing billed this month — showing all time'),
    ).toBeTruthy();
  });
});

describe('InvoiceCostAllocationReport date range', () => {
  it('offers the presets the summary offers, and the typed range, in place of the billing-period select', () => {
    renderReport(data());

    expect(screen.queryByLabelText('Billing period')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Date range' }));

    for (const label of [
      'All Time',
      'Year to Date',
      'Current FY',
      'Projected FY',
      'This Quarter',
      'Last Quarter',
      'This Month',
      'Last Month',
    ]) {
      expect(screen.getByRole('radio', { name: label })).toBeTruthy();
    }
    // Seeded from the window on show, in the user's date format.
    expect((screen.getByLabelText(/From/) as HTMLInputElement).value).toBe(
      '2026-08-01',
    );
    expect((screen.getByLabelText(/To/) as HTMLInputElement).value).toBe(
      '2026-08-31',
    );
  });

  it('seeds the typed fields from today on All Time, never the sentinel window', () => {
    renderReport(
      data({
        period: 'all',
        window: { start: '0000-01-01', end: '9999-12-31' },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Date range' }));

    const today = new Date().toISOString().slice(0, 10);
    expect((screen.getByLabelText(/From/) as HTMLInputElement).value).toBe(
      today,
    );
    expect((screen.getByLabelText(/To/) as HTMLInputElement).value).toBe(today);
  });

  it('pushes a preset the old control had no room for', () => {
    renderReport(data());

    fireEvent.click(screen.getByRole('button', { name: 'Date range' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Current FY' }));

    expect(push).toHaveBeenCalledWith(
      '/reports/invoice-cost-allocation?period=current-fy',
    );
  });

  it('applies a typed range as ISO search params', () => {
    renderReport(data());

    fireEvent.click(screen.getByRole('button', { name: 'Date range' }));
    fireEvent.change(screen.getByLabelText(/From/), {
      target: { value: '2025-03-10' },
    });
    fireEvent.change(screen.getByLabelText(/To/), {
      target: { value: '2025-03-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply range' }));

    expect(push).toHaveBeenCalledWith(
      '/reports/invoice-cost-allocation?period=custom&from=2025-03-10&to=2025-03-15',
    );
  });

  it('describes a fiscal-year window as a phrase, not a lowercased label', () => {
    renderReport(data({ period: 'current-fy' }));

    expect(screen.getByText('Invoices billed this fiscal year')).toBeTruthy();
  });
});

describe('InvoiceCostAllocationReport spend by allocation target', () => {
  // Eight targets: more than the five rows the card shows at once, and more
  // than the five it used to truncate to.
  const eightTargets = () =>
    data({
      rows: [
        {
          ...data().rows[0],
          amount: 3600,
          targets: Array.from({ length: 8 }, (_, i) => ({
            key: `org_unit:${i + 1}`,
            name: `Target ${i + 1}`,
            typeLabel: 'Department',
            percent: 12.5,
            // Descending spend: Target 1 is the largest.
            amount: 800 - i * 100,
            productId: null,
            productName: null,
          })),
        },
      ],
    });

  it('lists every target, not just the first five', () => {
    renderReport(eightTargets());

    // Scoped to the card: the names also appear in the table's target column.
    const list = screen.getByLabelText('Spend by allocation target, 8 targets');
    for (let i = 1; i <= 8; i++) {
      expect(within(list).getByText(`Target ${i}`)).toBeTruthy();
    }
  });

  it('keeps the targets in descending order of spend', () => {
    renderReport(eightTargets());

    const list = screen.getByLabelText('Spend by allocation target, 8 targets');
    const names = [...list.querySelectorAll('li')].map(
      (li) => li.textContent?.match(/Target \d+/)?.[0] ?? '',
    );
    expect(names).toEqual([
      'Target 1',
      'Target 2',
      'Target 3',
      'Target 4',
      'Target 5',
      'Target 6',
      'Target 7',
      'Target 8',
    ]);
  });

  it('counts the targets in the header and is reachable by keyboard', () => {
    renderReport(eightTargets());

    expect(screen.getByText('(8)')).toBeTruthy();
    // The rows hold nothing focusable, so the list itself carries the tab stop.
    expect(
      screen
        .getByLabelText('Spend by allocation target, 8 targets')
        .getAttribute('tabindex'),
    ).toBe('0');
  });
});
