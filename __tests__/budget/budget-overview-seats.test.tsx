import type { ReactElement } from 'react';

const getBudgetContracts = jest.fn();
jest.mock('@/lib/v2', () => ({
  getBudgetContracts: (...args: unknown[]) => getBudgetContracts(...args),
  getOldestContractFiscalYear: async () => 2024,
}));
jest.mock('@/data/users', () => ({
  getUserMetadata: async () => ({
    organizationId: 'org-1',
    organizationFY: 1,
    baseCurrency: 'EUR',
  }),
}));
jest.mock('@/lib/settings/default-cost-method', () => ({
  getDefaultCostMethod: async () => 'amortized',
}));
const getSidVendorTotals = jest.fn();
jest.mock('@/lib/v2/vendors/service', () => ({
  EMPTY_SID_VENDOR_TOTALS: {
    byVendorId: new Map(),
    labels: new Map(),
    seatCounts: new Map(),
    vendorIds: new Set(),
  },
  getSidVendorTotals: () => getSidVendorTotals(),
}));
jest.mock('@/components/budget/SpendOverview', () => ({
  SpendOverview: () => null,
}));
const ContractsTable = () => null;
jest.mock('@/components/contracts/ContractsTable', () => ({
  __esModule: true,
  default: ContractsTable,
}));

import { BudgetOverviewServer } from '@/app/(app)/(cpm)/budget/(overview)/server-components';

const contract = (id: number, vendorId: number, typeId: number) => ({
  id,
  vendor_id: vendorId,
  contract: { id, type_id: typeId, discount: null },
});

const seatSpend = {
  byVendorId: new Map([[469, { current: 8000, projected: 8520 }]]),
  labels: new Map([[469, { name: 'Bloomberg', domain: 'bloomberg.com' }]]),
  seatCounts: new Map([[469, 351]]),
  vendorIds: new Set([469]),
};
const noSeats = {
  byVendorId: new Map(),
  labels: new Map(),
  seatCounts: new Map(),
  vendorIds: new Set(),
};

const currentFY = new Date().getUTCFullYear();

// The server component returns its tree without rendering it, so the table's
// props are read straight off the element it produced.
async function render(searchParams?: { fy?: string }) {
  const page = (await BudgetOverviewServer({ searchParams })) as ReactElement<{
    children: ReactElement[];
  }>;
  const table = page.props.children.find(
    (child) => child.type === ContractsTable,
  );
  if (!table) throw new Error('ContractsTable not rendered');
  return table.props as {
    contracts: Array<{ id: number }>;
    extraRows: Array<{ id: string; currency: string }>;
  };
}

describe('BudgetOverviewServer — Bloomberg seats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getBudgetContracts.mockResolvedValue({
      contracts: [
        contract(1, 10, 2),
        contract(2, 469, 6),
        contract(3, 469, 2),
        contract(4, 10, 6),
      ],
    });
  });

  it("drops the seat vendor's invoices and appends one row per seat vendor", async () => {
    getSidVendorTotals.mockResolvedValue(seatSpend);

    const props = await render();

    expect(props.contracts.map((c) => c.id)).toEqual([1, 3, 4]);
    expect(props.extraRows).toHaveLength(1);
    expect(props.extraRows[0]).toMatchObject({
      id: 'bloomberg:469',
      vendor: 'Bloomberg',
      currency: 'EUR',
      currentBudget: 8000,
      projectedBudget: 8520,
    });
    expect(props.extraRows[0]).toHaveProperty(
      'currentProducts.0.vendor_products.name',
      'Terminals and exchange entitlements · 351 seats',
    );
  });

  it('lists neither seats nor their absence on a historical year', async () => {
    getSidVendorTotals.mockResolvedValue(seatSpend);

    const props = await render({ fy: String(currentFY - 1) });

    expect(props.contracts.map((c) => c.id)).toEqual([1, 2, 3, 4]);
    expect(props.extraRows).toEqual([]);
    expect(getSidVendorTotals).not.toHaveBeenCalled();
  });

  it('renders an org without seats unchanged', async () => {
    getSidVendorTotals.mockResolvedValue(noSeats);

    const props = await render();

    expect(props.contracts.map((c) => c.id)).toEqual([1, 2, 3, 4]);
    expect(props.extraRows).toEqual([]);
  });
});
