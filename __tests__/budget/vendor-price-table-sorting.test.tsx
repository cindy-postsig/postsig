/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';

// recharts measures its container, which jsdom cannot; the sparkline is not
// what this covers.
jest.mock('recharts', () => ({
  BarChart: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Bar: () => null,
}));

// The detail sheet reaches a 'use server' module through its import chain, and
// the trend chart is recharts again. Neither participates in row order.
jest.mock('@/components/budget/ContractSummarySheet', () => ({
  ContractSummarySheet: () => null,
}));
jest.mock('@/components/budget/VendorTrendChart', () => ({
  VendorProductChart: () => null,
}));
jest.mock('@/components/vendors/VendorIcon', () => ({
  __esModule: true,
  default: () => null,
}));

import { VendorPriceTable } from '@/components/budget/VendorPriceTable';
import type { VendorPriceSummary } from '@/lib/v2/reports/price-history/summary';

const vendor = (
  vendorName: string,
  currentACV: number,
  vendorId: number,
): VendorPriceSummary => ({
  vendorId,
  vendorName,
  contractCount: 1,
  currency: 'USD',
  currentACV,
  renewalPercent: null,
  periods: [],
  products: [],
});

// Arrives in the server's order: current ACV, most expensive first.
const VENDORS = [
  vendor('Zendesk', 900, 1),
  vendor('Atlassian', 500, 2),
  vendor('Miro', 100, 3),
];

const renderTable = () =>
  render(
    <NuqsTestingAdapter>
      <VendorPriceTable
        vendors={VENDORS}
        periodLabels={['FY2026']}
        contractSummaries={[]}
      />
    </NuqsTestingAdapter>,
  );

const vendorOrder = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).queryAllByRole('cell')[0]?.textContent?.trim())
    .filter((name): name is string => Boolean(name));

const header = () => screen.getByRole('button', { name: 'Sort by Vendor' });
const ariaSort = () => header().closest('th')?.getAttribute('aria-sort');

describe('VendorPriceTable vendor sorting', () => {
  it('starts in the order the server sent — current ACV, not the alphabet', () => {
    renderTable();

    expect(vendorOrder()).toEqual(['Zendesk', 'Atlassian', 'Miro']);
  });

  it('cycles A–Z, Z–A, then back to the server order', () => {
    renderTable();
    expect(ariaSort()).toBeNull();

    fireEvent.click(header());
    expect(vendorOrder()).toEqual(['Atlassian', 'Miro', 'Zendesk']);
    expect(ariaSort()).toBe('ascending');

    fireEvent.click(header());
    expect(vendorOrder()).toEqual(['Zendesk', 'Miro', 'Atlassian']);
    expect(ariaSort()).toBe('descending');

    // The third click is why this is three states: spend order is the default
    // the page is built around, so it has to be reachable again.
    fireEvent.click(header());
    expect(vendorOrder()).toEqual(['Zendesk', 'Atlassian', 'Miro']);
  });
});
