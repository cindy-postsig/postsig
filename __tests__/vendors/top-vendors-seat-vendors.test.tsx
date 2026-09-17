/**
 * @jest-environment jsdom
 */
import React from 'react';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
jest.mock('@/app/lib/budget', () => ({
  generatePriceHistory: jest.fn(),
  extractBudgetFromPriceHistory: jest.fn(),
  calculateCompoundedProductFee: jest.fn(),
}));
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
const TopVendorsValueLabel = () => null;
jest.mock('@/components/vendors/TopVendorsValueLabel', () => ({
  __esModule: true,
  default: TopVendorsValueLabel,
}));
const getContractsList = jest.fn();
jest.mock('@/lib/v2/contracts/service', () => ({
  getContractsList: () => getContractsList(),
  getOldestContractFiscalYear: async () => 2024,
}));
jest.mock('@/data/users', () => ({
  getUserMetadata: async () => ({ organizationId: 'org-1', organizationFY: 1 }),
  getEffectiveBaseCurrency: async () => 'USD',
}));
jest.mock('@/lib/v2/cost-allocation/flag', () => ({
  isCostAllocationEnabled: async () => false,
}));
jest.mock('@/lib/v2/cost-allocation/context', () => ({
  loadAllocationContextForRequest: jest.fn(),
}));
jest.mock('@/lib/v2/cost-allocation/unallocated', () => ({
  summarizeUnallocated: jest.fn(),
}));
jest.mock('@/lib/v2/reports/service', () => ({
  buildReportFromContracts: jest.fn(),
}));
jest.mock('@/lib/v2/invoices/validation', () => ({
  getInvoiceValidations: async () => new Map(),
}));
jest.mock('@/components/invoices/InvoicesTable', () => ({
  InvoiceValidationBadge: () => null,
}));
const getSidVendorTotals = jest.fn();
jest.mock('@/lib/v2/vendors/service', () => ({
  getSidVendorTotals: () => getSidVendorTotals(),
}));

import { TopVendorsSection } from '@/components/dashboard/sections';

const BLOOMBERG = 469;

// Kept out of overall spend so the totals paths see no contract; only the
// vendor count is under test.
const contract = (
  id: number,
  vendorId: number,
  status: { status_id: number; status: string },
) => ({
  id,
  vendor_id: vendorId,
  excludedFromOverallSpend: true,
  products: [],
  contract: { id, type_id: 2, ai_extraction_status: 'completed', ...status },
});
const active = { status_id: 4, status: 'active' };
const draft = { status_id: 3, status: 'active' };

async function totalVendors(): Promise<number> {
  const card = (await TopVendorsSection()) as React.ReactElement<{
    customSubheader: React.ReactElement<{ totalVendors: number }>;
  }>;
  expect(card.props.customSubheader.type).toBe(TopVendorsValueLabel);
  return card.props.customSubheader.props.totalVendors;
}

describe('TopVendorsSection vendor count with Bloomberg seats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSidVendorTotals.mockResolvedValue({
      byVendorId: new Map([[BLOOMBERG, { current: 8000, projected: 8520 }]]),
      labels: new Map([[BLOOMBERG, { name: 'Bloomberg', domain: null }]]),
      seatCounts: new Map([[BLOOMBERG, 351]]),
      vendorIds: new Set([BLOOMBERG]),
    });
  });

  it('counts a seat vendor once when it also has an active contract', async () => {
    getContractsList.mockResolvedValue({
      contracts: [contract(1, 10, active), contract(2, BLOOMBERG, active)],
    });

    expect(await totalVendors()).toBe(2);
  });

  it('still counts a seat vendor whose contracts are all inactive', async () => {
    getContractsList.mockResolvedValue({
      contracts: [contract(1, 10, active), contract(2, BLOOMBERG, draft)],
    });

    expect(await totalVendors()).toBe(2);
  });
});
