/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CostAllocationTabPayload } from '@/app/api/v2/handlers/cost-allocation';
import type { InventoryItem } from '@/lib/v2/inventory/types';

const useCostAllocationTab = jest.fn();
jest.mock('@/hooks/api/useCostAllocation', () => ({
  useCostAllocationTab: (...args: unknown[]) => useCostAllocationTab(...args),
  useSaveCostAllocation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCostAllocationCatalog: () => ({ data: undefined, isLoading: false }),
  costAllocationQueryKey: (id: number) => ['cost-allocation', id],
}));
jest.mock('@/hooks/api/useOrgUnits', () => ({
  useCreateBusinessGroup: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('@/hooks/useBaseCurrency', () => ({
  useBaseCurrency: () => ({
    baseCurrency: 'EUR',
    formatBaseCurrency: (value: number) => `€${value.toFixed(2)}`,
  }),
}));
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));
jest.mock('@/components/providers/AbilityProvider', () => ({
  useAbility: () => ({ can: () => true }),
}));
jest.mock('@/hooks/api/useOrgGroups', () => ({
  useOrgBusinessGroups: () => ({ data: { groups: [] } }),
}));
jest.mock('@/app/hooks/useContractUsers', () => ({
  useContractUsers: () => ({
    users: [],
    loading: false,
    isAddingUser: false,
    isUpdatingUser: false,
    newUser: {},
    setNewUser: jest.fn(),
    errors: {},
    resetForm: jest.fn(),
    resetErrors: jest.fn(),
    clearFieldError: jest.fn(),
    handleAddUser: jest.fn(),
    handleAssignEmployees: jest.fn(),
    handleDeleteUser: jest.fn(),
    handleUpdateUser: jest.fn(),
    loadUsers: jest.fn(),
  }),
}));
jest.mock('@/components/contracts/UserManagementForm', () => ({
  UserManagementForm: () => <div>user management form</div>,
}));
jest.mock('@/components/contracts/EmployeeAssignmentDialog', () => ({
  EmployeeAssignmentDialog: () => <div>employee assignment</div>,
}));
jest.mock('@/components/contracts/ExportActiveUsersCSVButton', () => ({
  __esModule: true,
  default: () => <button>Export Users</button>,
}));
// The budget barrel pulls the Redis/Next server stack in behind one label helper.
jest.mock('@/app/lib/budget', () => ({
  getProductYearLabel: (year: number) => `Year ${year}`,
}));
jest.mock('@/components/vendors/VendorIcon', () => ({
  __esModule: true,
  default: ({ name }: { name: string }) => <span>{`icon:${name}`}</span>,
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

import { InventoryItemSheet } from '@/app/(app)/(cpm)/inventory/InventoryItemSheet';

const item = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: '300-product-7',
  vendor: 'Bloomberg',
  vendorDomain: 'bloomberg.com',
  productName: ['Terminal'],
  product_id: 7,
  licensesCount: 10,
  endUsers: '',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  cost: 1000,
  costNative: 1000,
  currency: 'USD',
  deliveryMethods: ['API'],
  status: 'Active',
  activeUsers: [],
  contractId: '300',
  contractType: 'MSA',
  businessSponsor: ['Jane Doe'],
  ...overrides,
});

const payload = (): CostAllocationTabPayload => ({
  contractId: 300,
  isInvoice: false,
  resolved: {
    contractId: 300,
    scopes: [
      {
        productId: null,
        mode: 'manual' as const,
        sourceContractId: 300,
        unlinkedUserCount: 0,
        lines: [
          {
            target: { kind: 'org_unit' as const, id: 1, name: 'Research' },
            percent: 100,
          },
        ],
      },
    ],
  },
  hasOwnAllocation: true,
  sourceContract: null,
  parentContract: null,
  hasAllocationTargets: true,
  levelByUnitId: { 1: 'department' as const },
  seats: [],
  products: [{ id: 7, name: 'Terminal' }],
  values: { contract: 1000, products: {} },
  valuesFromSource: false,
});

const renderSheet = (
  props: Partial<React.ComponentProps<typeof InventoryItemSheet>> = {},
) =>
  render(
    <InventoryItemSheet
      item={item()}
      isOpen
      onClose={jest.fn()}
      userMetadata={{ organizationId: 'org-1' }}
      {...props}
    />,
  );

beforeEach(() => {
  jest.clearAllMocks();
  useCostAllocationTab.mockReturnValue({ data: payload(), isLoading: false });
});

describe('InventoryItemSheet with cost allocation enabled', () => {
  it('tabs the sheet and loads the allocation only once its tab is opened', () => {
    renderSheet({ costAllocationEnabled: true });

    expect(screen.getByRole('tab', { name: 'Overview' })).toBeTruthy();
    expect(screen.getByText('Business Sponsor')).toBeTruthy();
    expect(useCostAllocationTab).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Cost Allocation' }));

    expect(useCostAllocationTab).toHaveBeenCalledWith(300);
    expect(screen.getByText('Set on this contract')).toBeTruthy();
    expect(
      screen.getByRole('table', { name: 'Entire contract allocation' }),
    ).toBeTruthy();
    expect(screen.queryByText('Business Sponsor')).toBeNull();
  });

  it('lands a newly selected item back on Overview', () => {
    const { rerender } = renderSheet({ costAllocationEnabled: true });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Cost Allocation' }));
    expect(screen.queryByText('Business Sponsor')).toBeNull();

    rerender(
      <InventoryItemSheet
        item={item({ id: '400-product-8', contractId: '400' })}
        isOpen
        onClose={jest.fn()}
        userMetadata={{ organizationId: 'org-1' }}
        costAllocationEnabled
      />,
    );

    expect(screen.getByText('Business Sponsor')).toBeTruthy();
  });
});

describe('InventoryItemSheet with cost allocation disabled', () => {
  it('renders the card stack with no tabs at all', () => {
    renderSheet();

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByText('Business Sponsor')).toBeTruthy();
    expect(screen.getByText('Delivery Methods')).toBeTruthy();
    expect(screen.getByText('Linked Contract')).toBeTruthy();
    expect(useCostAllocationTab).not.toHaveBeenCalled();
  });
});
