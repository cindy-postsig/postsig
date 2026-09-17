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
jest.mock('@/lib/v2/contracts/transforms', () => ({
  buildContractTableRow: (contract: { tcvUSD: number }) => ({
    effectiveTotalContractValueUSD: contract.tcvUSD,
  }),
}));
const ContractsTable = () => null;
jest.mock('@/components/contracts/ContractsTable', () => ({
  __esModule: true,
  default: ContractsTable,
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
jest.mock('@/components/vendors/TopVendorsValueLabel', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/invoices/InvoicesTable', () => ({
  InvoiceValidationBadge: () => null,
}));
const getContractsList = jest.fn();
jest.mock('@/lib/v2/contracts/service', () => ({
  getContractsList: () => getContractsList(),
  getOldestContractFiscalYear: async () => 2024,
}));
jest.mock('@/lib/v2/vendors/service', () => ({
  getSidVendorTotals: jest.fn(),
}));
jest.mock('@/lib/v2/reports/service', () => ({
  buildReportFromContracts: jest.fn(),
}));
jest.mock('@/lib/v2/invoices/validation', () => ({
  getInvoiceValidations: async () => new Map(),
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
jest.mock('@/data/users', () => ({
  getUserMetadata: async () => null,
  getEffectiveBaseCurrency: async () => 'USD',
}));

import { MyContractsSection } from '@/components/dashboard/sections';
import type { UserMetadata } from '@/constants/types';

const userMetadata = {
  userId: 'user-1',
  userProfile: { name: 'Ada Lovelace', email: 'ada@acme.com' },
  baseCurrency: 'USD',
} as unknown as UserMetadata;

const sponsorRow = (userId: string) => ({
  id: 1,
  role: 'sponsor',
  user_id: userId,
  users: { name: 'Ada Lovelace', email: 'ada@acme.com' },
  org_employee_id: null,
  org_unit_id: null,
  label: null,
});

const contract = (id: number, sponsoredBy: string | null, tcvUSD: number) => ({
  id,
  tcvUSD,
  contract: {
    id,
    contract_owners: sponsoredBy === null ? [] : [sponsorRow(sponsoredBy)],
  },
});

type Card = React.ReactElement<{
  count: number;
  totalValue: number;
  children: React.ReactElement<{ contracts: Array<{ id: number }> }>;
}>;

describe('MyContractsSection', () => {
  it('renders nothing when the user sponsors no contract', async () => {
    getContractsList.mockResolvedValue({
      contracts: [contract(1, 'someone-else', 500)],
    });

    expect(await MyContractsSection({ userMetadata })).toBeNull();
  });

  it('lists the sponsored contracts with their count and worth', async () => {
    getContractsList.mockResolvedValue({
      contracts: [
        contract(1, 'user-1', 1000),
        contract(2, 'someone-else', 700),
        contract(3, 'user-1', 500),
      ],
    });

    const card = (await MyContractsSection({ userMetadata })) as Card;

    expect(card.props.count).toBe(2);
    expect(card.props.totalValue).toBe(1500);
    expect(card.props.children.type).toBe(ContractsTable);
    expect(card.props.children.props.contracts.map((c) => c.id)).toEqual([
      1, 3,
    ]);
  });
});
