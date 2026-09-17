/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

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

// Sibling sections in the module reach app/lib/budget, whose next/cache import
// jsdom has no TextEncoder for.
jest.mock('@/app/lib/budget', () => ({
  generatePriceHistory: jest.fn(),
  extractBudgetFromPriceHistory: jest.fn(),
  calculateCompoundedProductFee: jest.fn(),
}));

// The module's other sections pull server actions and exceljs into the graph;
// only NeedsAttention itself stays real.
jest.mock('@/components/contracts/ContractsTable', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/budget/SpendQueryHydration', () => ({
  SpendQueryHydration: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock('@/components/dashboard/DashboardSpendOverview', () => ({
  DashboardSpendOverview: () => null,
}));
jest.mock('@/components/dashboard/ReportPreview', () => ({
  ReportPreview: () => null,
}));
jest.mock('@/components/vendors/TopVendorsChart', () => ({
  __esModule: true,
  default: () => null,
}));

const getContractsList = jest.fn();
jest.mock('@/lib/v2/contracts/service', () => ({
  getContractsList: () => getContractsList(),
  getOldestContractFiscalYear: async () => 2024,
}));

const getUserMetadata = jest.fn();
jest.mock('@/data/users', () => ({
  getUserMetadata: () => getUserMetadata(),
  getEffectiveBaseCurrency: async () => 'USD',
}));

const isCostAllocationEnabled = jest.fn();
jest.mock('@/lib/v2/cost-allocation/flag', () => ({
  isCostAllocationEnabled: (...args: unknown[]) =>
    isCostAllocationEnabled(...args),
}));

const loadAllocationContextForRequest = jest.fn();
jest.mock('@/lib/v2/cost-allocation/context', () => ({
  loadAllocationContextForRequest: (...args: unknown[]) =>
    loadAllocationContextForRequest(...args),
}));

const summarizeUnallocated = jest.fn();
jest.mock('@/lib/v2/cost-allocation/unallocated', () => ({
  summarizeUnallocated: (...args: unknown[]) => summarizeUnallocated(...args),
}));

jest.mock('@/lib/v2/reports/service', () => ({
  buildReportFromContracts: async () => ({
    contracts: [],
    totalValueInUSD: 0,
    metadata: {},
  }),
}));

// Only reached by InvoicesSection, not NeedsAttentionSection under test here —
// its own module graph (down through components/contracts/columns.tsx) pulls
// in next/cache, which jsdom can't resolve.
jest.mock('@/lib/v2/invoices/validation', () => ({
  getInvoiceValidations: async () => new Map(),
}));
jest.mock('@/components/invoices/InvoicesTable', () => ({
  InvoiceValidationBadge: () => null,
}));
// Top Vendors reaches the spend runner through the vendors service, and that
// chain loads next/cache, which the jsdom environment cannot.
jest.mock('@/lib/v2/vendors/service', () => ({
  getSidVendorTotals: async () => ({
    byVendorId: new Map(),
    labels: new Map(),
    vendorIds: new Set(),
  }),
}));

import { NeedsAttention } from '@/components/dashboard/NeedsAttention';
import { NeedsAttentionSection } from '@/components/dashboard/sections';
import type { NeedsAttentionData } from '@/lib/v2/dashboard/service';

const quiet: NeedsAttentionData = {
  unconfirmed: { count: 0, totalValueInUSD: 0 },
  contractOmissions: { count: 0, totalValueInUSD: 0 },
  dora: { count: 0, totalValueInUSD: 0 },
  unexecuted: { count: 0, totalValueInUSD: 0 },
  leavers: { count: 0, totalValueInUSD: 0, productCount: 0 },
};

describe('NeedsAttentionSection cost-allocation gating', () => {
  const user = { organizationId: 'org-1' };
  const contracts = [{ id: 7 }];
  const allocationContext = { unitsById: new Map() };
  const summary = { count: 3, totalValueInUSD: 9000 };

  const sectionData = async (): Promise<NeedsAttentionData> => {
    const element = (await NeedsAttentionSection()) as React.ReactElement<
      React.ComponentProps<typeof NeedsAttention>
    >;
    expect(element.type).toBe(NeedsAttention);
    return element.props.data;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getContractsList.mockResolvedValue({ contracts });
    getUserMetadata.mockResolvedValue(user);
    loadAllocationContextForRequest.mockResolvedValue(allocationContext);
    summarizeUnallocated.mockReturnValue(summary);
  });

  it('leaves the item out, and the context unloaded, for an org without the feature', async () => {
    isCostAllocationEnabled.mockResolvedValue(false);

    expect((await sectionData()).unallocated).toBeUndefined();

    // A request with no user resolves the same way without reaching the flag,
    // so leave it on to tell the two arms apart.
    isCostAllocationEnabled.mockResolvedValue(true);
    getUserMetadata.mockResolvedValue(null);
    expect((await sectionData()).unallocated).toBeUndefined();
    expect(isCostAllocationEnabled).toHaveBeenCalledTimes(1);

    expect(loadAllocationContextForRequest).not.toHaveBeenCalled();
    expect(summarizeUnallocated).not.toHaveBeenCalled();
  });

  it("summarizes the user's org against its allocation context when the flag is on", async () => {
    isCostAllocationEnabled.mockResolvedValue(true);

    expect((await sectionData()).unallocated).toEqual(summary);
    expect(isCostAllocationEnabled).toHaveBeenCalledWith(user);
    expect(loadAllocationContextForRequest).toHaveBeenCalledWith('org-1');
    expect(summarizeUnallocated).toHaveBeenCalledWith(
      contracts,
      allocationContext,
    );
  });
});

describe('NeedsAttention unallocated contracts', () => {
  it('invites the org to set cost allocations up, and links to the filtered report', () => {
    render(
      <NeedsAttention
        data={{ ...quiet, unallocated: { count: 4, totalValueInUSD: 12000 } }}
        currency="USD"
      />,
    );

    expect(screen.getByText(/Set up cost allocations/).textContent).toBe(
      'Set up cost allocations — 4 contracts worth $12,000 are unallocated',
    );
    expect(
      screen.getByRole('link', { name: 'Set up' }).getAttribute('href'),
    ).toBe('/reports/allocation-rollup?filter=unallocated');
  });

  it('says nothing when the org has no unallocated contracts, or no Cost Allocation at all', () => {
    const { unmount } = render(
      <NeedsAttention
        data={{ ...quiet, unallocated: { count: 0, totalValueInUSD: 0 } }}
        currency="USD"
      />,
    );
    expect(screen.getByText('No items need attention')).toBeTruthy();
    unmount();

    // The field is absent for an org without the feature: still no item, and
    // still nothing else claiming attention.
    render(<NeedsAttention data={quiet} currency="USD" />);
    expect(screen.queryByText('Cost Allocations')).toBeNull();
    expect(screen.getByText('No items need attention')).toBeTruthy();
  });

  it('is enough on its own to open the card', () => {
    render(
      <NeedsAttention
        data={{ ...quiet, unallocated: { count: 1, totalValueInUSD: 500 } }}
        currency="USD"
      />,
    );

    expect(screen.queryByText('No items need attention')).toBeNull();
    expect(screen.getByText('Cost Allocations')).toBeTruthy();
    // One contract reads as one contract.
    expect(screen.getByText(/Set up cost allocations/).textContent).toBe(
      'Set up cost allocations — 1 contract worth $500 is unallocated',
    );
  });
});
