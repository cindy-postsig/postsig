/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CostAllocationTabPayload } from '@/app/api/v2/handlers/cost-allocation';
import type { InvoiceReportRow } from '@/lib/v2/cost-allocation/invoice-report-rows';

const useCostAllocationTab = jest.fn();
const mutateAsync = jest.fn();
const createBusinessGroup = jest.fn();
jest.mock('@/hooks/api/useCostAllocation', () => ({
  useCostAllocationTab: (...args: unknown[]) => useCostAllocationTab(...args),
  useSaveCostAllocation: () => ({ mutateAsync, isPending: false }),
  useCostAllocationCatalog: () => ({
    data: {
      catalog: [
        {
          key: 'department',
          label: 'Departments',
          items: [{ target: { kind: 'org_unit', id: 1, name: 'Research' } }],
        },
      ],
    },
    isLoading: false,
    error: null,
  }),
  costAllocationQueryKey: (id: number) => ['cost-allocation', id],
}));
jest.mock('@/hooks/api/useOrgUnits', () => ({
  useCreateBusinessGroup: () => ({ mutateAsync: createBusinessGroup }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));
const refresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
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

import { InvoiceAllocationSheet } from '@/components/reports/invoice-cost-allocation/InvoiceAllocationSheet';

const inheritedScope = {
  productId: null,
  mode: 'manual' as const,
  sourceContractId: 100,
  unlinkedUserCount: 0,
  lines: [
    {
      target: { kind: 'org_unit' as const, id: 1, name: 'Research' },
      percent: 60,
    },
    {
      target: {
        kind: 'employee' as const,
        id: 9,
        name: 'Ada Lovelace',
        orgUnitId: 1,
      },
      percent: 40,
    },
  ],
};

const payload = (
  overrides: Partial<CostAllocationTabPayload> = {},
): CostAllocationTabPayload => ({
  contractId: 300,
  isInvoice: true,
  resolved: { contractId: 300, scopes: [inheritedScope] },
  hasOwnAllocation: false,
  sourceContract: { id: 100, label: 'MSA-2026-001' },
  parentContract: { id: 100, label: 'MSA-2026-001' },
  hasAllocationTargets: true,
  levelByUnitId: { 1: 'department' },
  seats: [],
  products: [{ id: 7, name: 'Terminal' }],
  values: { contract: 1000, products: {} },
  valuesFromSource: false,
  ...overrides,
});

const row = (overrides: Partial<InvoiceReportRow> = {}): InvoiceReportRow => ({
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
  targets: [],
  unlinkedUserCount: 0,
  ...overrides,
});

const formatAmount = (value: number | null) =>
  value === null ? '—' : `€${value.toFixed(2)}`;

const renderSheet = (
  props: Partial<React.ComponentProps<typeof InvoiceAllocationSheet>> = {},
) =>
  render(
    <InvoiceAllocationSheet
      row={row()}
      canEdit
      formatAmount={formatAmount}
      dateFormat="yyyy-MM-dd"
      onClose={jest.fn()}
      {...props}
    />,
  );

// Radix's popper measures its content; jsdom has no ResizeObserver and the
// measurements are irrelevant to where the popover is mounted.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  // The picker's cmdk list scrolls its highlighted row into view.
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('InvoiceAllocationSheet', () => {
  it('shows the invoice context, the inherited allocation with its source, and the linked contract', () => {
    useCostAllocationTab.mockReturnValue({ data: payload(), isLoading: false });

    renderSheet();

    expect(useCostAllocationTab).toHaveBeenCalledWith(300);
    expect(screen.getByText('INV-300')).toBeTruthy();
    expect(screen.getByText('2026-08-10')).toBeTruthy();
    expect(screen.getAllByText('€1000.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Inherited from')).toBeTruthy();
    expect(screen.getByText('Research')).toBeTruthy();
    expect(screen.getByText('60%')).toBeTruthy();
    expect(screen.getByText('€600.00')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Override for this invoice' }),
    ).toBeTruthy();
    const contractLinks = screen
      .getAllByText('MSA-2026-001')
      .map((el) => el.closest('a')?.getAttribute('href'))
      .filter(Boolean);
    expect(contractLinks).toContain('/contracts/100');
  });

  it('labels an own override and refreshes the report after removing it', async () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        hasOwnAllocation: true,
        sourceContract: null,
        resolved: {
          contractId: 300,
          scopes: [{ ...inheritedScope, sourceContractId: 300 }],
        },
      }),
      isLoading: false,
    });
    mutateAsync.mockResolvedValue(undefined);

    renderSheet({ row: row({ provenance: { kind: 'own' } }) });

    expect(screen.getByText('Set on this invoice')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove override' }));
    expect(mutateAsync).toHaveBeenCalledWith([]);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('offers to allocate an unassigned invoice in place, or on its parent for all its invoices', () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        sourceContract: null,
        resolved: { contractId: 300, scopes: [] },
      }),
      isLoading: false,
    });

    renderSheet({ row: row({ provenance: { kind: 'none' } }) });

    expect(screen.getByText(/This invoice is unassigned/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Override/ })).toBeNull();
    expect(screen.getByText(/or set up on/)).toBeTruthy();
    expect(screen.getByText(/to cover all its invoices/)).toBeTruthy();
    expect(
      screen
        .getAllByText('MSA-2026-001')
        .map((el) => el.closest('a')?.getAttribute('href')),
    ).toContain('/contracts/100?view=cost-allocation');

    fireEvent.click(
      screen.getByRole('button', { name: 'Allocate this invoice' }),
    );

    expect(
      screen.getByRole('button', { name: 'Save Allocation' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('offers only the in-place allocation for an unassigned invoice with no parent', () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        sourceContract: null,
        parentContract: null,
        resolved: { contractId: 300, scopes: [] },
      }),
      isLoading: false,
    });

    renderSheet({
      row: row({
        provenance: { kind: 'none' },
        parentContract: null,
        sourceContract: null,
      }),
    });

    expect(screen.queryByText(/or set up on/)).toBeNull();
    expect(screen.queryByText('Linked Contract')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Allocate this invoice' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Override/ })).toBeNull();
  });

  it('opens the target picker inside the sheet, where Radix allows scrolling', () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        sourceContract: null,
        resolved: { contractId: 300, scopes: [] },
      }),
      isLoading: false,
    });

    renderSheet({ row: row({ provenance: { kind: 'none' } }) });
    fireEvent.click(
      screen.getByRole('button', { name: 'Allocate this invoice' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Add Allocation Target' }),
    );

    const search = screen.getByPlaceholderText('Search allocation targets');
    const sheet = screen.getByRole('dialog', { name: 'Terminal' });
    expect(sheet.contains(search)).toBe(true);
  });

  it('hides every action for read-only users', () => {
    useCostAllocationTab.mockReturnValue({ data: payload(), isLoading: false });

    renderSheet({ canEdit: false });

    expect(screen.queryByRole('button', { name: /Override/ })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Remove override/ }),
    ).toBeNull();
  });
});
