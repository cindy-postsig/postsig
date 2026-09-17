/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CostAllocationTabPayload } from '@/app/api/v2/handlers/cost-allocation';

const useCostAllocationTab = jest.fn();
let savePending = false;
const mutateAsync = jest.fn();
const createBusinessGroup = jest.fn();
const loadedCatalog = {
  data: {
    catalog: [
      {
        key: 'department',
        label: 'Departments',
        items: [{ target: { kind: 'org_unit', id: 1, name: 'Research' } }],
      },
      {
        key: 'user',
        label: 'Users',
        items: [
          {
            target: {
              kind: 'employee',
              id: 9,
              name: 'Ada Lovelace',
              orgUnitId: 1,
            },
          },
          {
            target: {
              kind: 'employee',
              id: 10,
              name: 'Grace Hopper',
              orgUnitId: 1,
            },
          },
        ],
      },
    ],
  },
  isLoading: false,
  error: null,
};
let catalogState: typeof loadedCatalog | Record<string, unknown> =
  loadedCatalog;

jest.mock('@/hooks/api/useCostAllocation', () => ({
  useCostAllocationTab: (...args: unknown[]) => useCostAllocationTab(...args),
  useSaveCostAllocation: () => ({ mutateAsync, isPending: savePending }),
  useCostAllocationCatalog: () => catalogState,
  costAllocationQueryKey: (id: number) => ['cost-allocation', id],
}));
jest.mock('@/hooks/api/useOrgUnits', () => ({
  useCreateBusinessGroup: () => ({ mutateAsync: createBusinessGroup }),
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

import CostAllocationTab from '@/components/contracts/cost-allocation/CostAllocationTab';
import { equalSplitPercents } from '@/lib/v2/cost-allocation/editor';

const payload = (
  overrides: Partial<CostAllocationTabPayload> = {},
): CostAllocationTabPayload => ({
  contractId: 300,
  isInvoice: true,
  resolved: {
    contractId: 300,
    scopes: [
      {
        productId: null,
        mode: 'manual',
        sourceContractId: 100,
        unlinkedUserCount: 0,
        lines: [
          {
            target: { kind: 'org_unit', id: 1, name: 'Research' },
            percent: 60,
          },
          {
            target: {
              kind: 'employee',
              id: 9,
              name: 'Ada Lovelace',
              orgUnitId: 1,
            },
            percent: 40,
          },
        ],
      },
    ],
  },
  hasOwnAllocation: false,
  sourceContract: { id: 100, label: 'MSA · ID 100' },
  parentContract: { id: 100, label: 'MSA · ID 100' },
  hasAllocationTargets: true,
  levelByUnitId: { 1: 'department' },
  seats: [],
  products: [],
  values: { contract: 1000, products: {} },
  valuesFromSource: false,
  ...overrides,
});

const renderTab = (
  props: Partial<React.ComponentProps<typeof CostAllocationTab>> = {},
) => render(<CostAllocationTab contractId={300} canEdit {...props} />);

// The tab always lands read-only; the editor is one click in from whichever
// action the resolved view offers.
const openEditor = () =>
  fireEvent.click(
    screen.queryByRole('button', { name: 'Edit allocation' }) ??
      screen.getByRole('button', { name: /^Allocate this/ }),
  );

beforeEach(() => {
  savePending = false;
  catalogState = loadedCatalog;
  jest.clearAllMocks();
});

describe('CostAllocationTab on an invoice', () => {
  it('renders the inherited allocation read-only with its source and amounts', () => {
    useCostAllocationTab.mockReturnValue({ data: payload(), isLoading: false });

    renderTab();

    expect(screen.getByText('Inherited from')).toBeTruthy();
    expect(
      screen.getByText('MSA · ID 100').closest('a')?.getAttribute('href'),
    ).toBe('/contracts/100');
    expect(screen.getByText('Research')).toBeTruthy();
    expect(screen.getByText('60%')).toBeTruthy();
    expect(screen.getByText('€600.00')).toBeTruthy();
    expect(screen.getByText('Department')).toBeTruthy();
    expect(screen.getByText('User')).toBeTruthy();
    expect(
      screen.getByRole('table', { name: 'Entire contract allocation' }),
    ).toBeTruthy();
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('prints line amounts that add up to the scope total for an equal split', () => {
    const percents = equalSplitPercents(7);
    useCostAllocationTab.mockReturnValue({
      data: payload({
        values: { contract: 1200, products: {} },
        resolved: {
          contractId: 300,
          scopes: [
            {
              productId: null,
              mode: 'manual',
              sourceContractId: 100,
              unlinkedUserCount: 0,
              lines: percents.map((percent, i) => ({
                target: {
                  kind: 'employee' as const,
                  id: i + 1,
                  name: `Person ${i + 1}`,
                  orgUnitId: 1,
                },
                percent,
              })),
            },
          ],
        },
      }),
      isLoading: false,
    });

    renderTab();

    const cells = screen
      .getByRole('table', { name: 'Entire contract allocation' })
      .querySelectorAll('tbody tr td:last-child');
    const amounts = [...cells].map((cell) =>
      Number(cell.textContent?.replace('€', '')),
    );
    expect(amounts).toEqual([172, 172, 172, 171, 171, 171, 171]);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(1200);
    expect(
      screen
        .getByRole('table', { name: 'Entire contract allocation' })
        .querySelector('tfoot td:last-child')?.textContent,
    ).toBe('€1200.00');
  });

  it("shows only the inherited product scopes for products this record carries — never a parent-only 'Product #'", () => {
    const line = {
      target: { kind: 'org_unit' as const, id: 1, name: 'Research' },
      percent: 100,
    };
    useCostAllocationTab.mockReturnValue({
      data: payload({
        resolved: {
          contractId: 300,
          scopes: [
            {
              productId: 7,
              mode: 'manual',
              sourceContractId: 100,
              unlinkedUserCount: 0,
              lines: [line],
            },
            {
              productId: 8,
              mode: 'manual',
              sourceContractId: 100,
              unlinkedUserCount: 0,
              lines: [line],
            },
          ],
        },
        values: { contract: 1000, products: { 7: 600, 8: 400 } },
        products: [{ id: 7, name: 'Terminal' }],
      }),
      isLoading: false,
    });

    renderTab({ canEdit: false });

    expect(
      screen.getByRole('table', { name: 'Terminal allocation' }),
    ).toBeTruthy();
    expect(screen.queryByText(/Product #8/)).toBeNull();
    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(screen.queryByText(/is unassigned/)).toBeNull();
  });

  it("explains an inherited by-product allocation that covers none of the record's products", () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        resolved: {
          contractId: 300,
          scopes: [
            {
              productId: 8,
              mode: 'manual',
              sourceContractId: 100,
              unlinkedUserCount: 0,
              lines: [
                {
                  target: { kind: 'org_unit', id: 1, name: 'Research' },
                  percent: 100,
                },
              ],
            },
          ],
        },
        products: [{ id: 7, name: 'Terminal' }],
      }),
      isLoading: false,
    });

    renderTab({ canEdit: false });

    expect(screen.getByText('Inherited from')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/is unassigned/)).toBeNull();
    expect(
      screen.getByText(/carries none of the products it allocates/),
    ).toBeTruthy();
  });

  it('offers an override that opens the editor pre-filled with the inherited lines', () => {
    useCostAllocationTab.mockReturnValue({ data: payload(), isLoading: false });

    renderTab();
    fireEvent.click(
      screen.getByRole('button', { name: 'Override for this invoice' }),
    );

    expect(screen.getByLabelText('Percentage for Research')).toBeTruthy();
    expect(
      screen.getByRole('table', { name: 'Contract allocation' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Save Allocation' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('labels an own override and lets an admin remove it', async () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        hasOwnAllocation: true,
        sourceContract: null,
        resolved: {
          contractId: 300,
          scopes: [
            {
              productId: null,
              mode: 'active_users',
              sourceContractId: 300,
              unlinkedUserCount: 2,
              lines: [
                {
                  target: {
                    kind: 'employee',
                    id: 9,
                    name: 'Ada Lovelace',
                    orgUnitId: 1,
                  },
                  percent: 100,
                },
              ],
            },
          ],
        },
      }),
      isLoading: false,
    });
    mutateAsync.mockResolvedValue(undefined);

    renderTab();

    expect(screen.getByText('Set on this invoice')).toBeTruthy();
    expect(screen.getByText(/Split equally among active users/)).toBeTruthy();
    expect(screen.getByText(/2 unlinked seats are not included/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove override' }));
    expect(mutateAsync).toHaveBeenCalledWith([]);
  });

  it('renders zero, like the tables, for a stamped record with no value in the window', () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        isInvoice: false,
        values: { contract: 0, products: {} },
        resolved: {
          contractId: 300,
          scopes: [
            {
              productId: 7,
              mode: 'manual',
              sourceContractId: 100,
              unlinkedUserCount: 0,
              lines: [
                {
                  target: { kind: 'org_unit', id: 1, name: 'Research' },
                  percent: 100,
                },
              ],
            },
          ],
        },
        products: [{ id: 7, name: 'Terminal' }],
      }),
      isLoading: false,
    });

    renderTab({ canEdit: false });

    expect(screen.getAllByText('€0.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('—')).toBeNull();
  });

  it('renders a dash, never zero, when the engine has no value for the record', () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({ values: { contract: null, products: {} } }),
      isLoading: false,
    });

    renderTab();

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText(/€0\.00/)).toBeNull();
  });

  it("labels the source contract's amounts on an inheriting record with no value of its own", () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({ isInvoice: false, valuesFromSource: true }),
      isLoading: false,
    });

    renderTab({ canEdit: false });

    expect(
      screen.getByText(
        'Amounts shown are from MSA · ID 100 — this contract has no value of its own.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('€600.00')).toBeTruthy();
    expect(screen.getByText('€400.00')).toBeTruthy();
  });

  it('keeps the plain amounts when the record has its own value', () => {
    useCostAllocationTab.mockReturnValue({ data: payload(), isLoading: false });

    renderTab({ canEdit: false });

    expect(screen.queryByText(/Amounts shown are from/)).toBeNull();
  });

  it('offers to allocate an unassigned invoice in place or on its parent, and the primary opens the editor', () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        sourceContract: null,
        resolved: { contractId: 300, scopes: [] },
      }),
      isLoading: false,
    });

    renderTab();

    expect(screen.getByText(/This invoice is unassigned/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Override/ })).toBeNull();
    expect(
      screen.getByText('MSA · ID 100').closest('a')?.getAttribute('href'),
    ).toBe('/contracts/100?view=cost-allocation');
    expect(screen.getByText(/to cover all its invoices/)).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Allocate this invoice' }),
    );

    expect(
      screen.getByRole('button', { name: 'Save Allocation' }),
    ).toBeTruthy();
  });

  it('offers only the in-place allocation when an unassigned invoice has no parent', () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        sourceContract: null,
        parentContract: null,
        resolved: { contractId: 300, scopes: [] },
      }),
      isLoading: false,
    });

    renderTab();

    expect(
      screen.getByRole('button', { name: 'Allocate this invoice' }),
    ).toBeTruthy();
    expect(screen.queryByText(/or set up on/)).toBeNull();
  });

  it('hides every action for read-only users', () => {
    useCostAllocationTab.mockReturnValue({ data: payload(), isLoading: false });

    renderTab({ canEdit: false });

    expect(screen.queryByRole('button', { name: /Override/ })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Edit allocation/ }),
    ).toBeNull();
  });
});

describe('CostAllocationTab on a contract', () => {
  it('lands read-only on an unallocated contract, with Allocate this contract opening the editor', () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        isInvoice: false,
        sourceContract: null,
        resolved: { contractId: 300, scopes: [] },
      }),
      isLoading: false,
    });

    renderTab();

    expect(
      screen.queryByRole('button', { name: 'Save Allocation' }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Allocate this contract' }),
    );
    expect(
      screen.getByRole('button', { name: 'Add Allocation Target' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Save Allocation' }),
    ).toBeTruthy();
  });

  it('lands read-only on an own allocation, and Cancel drops back out of the editor', () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        isInvoice: false,
        sourceContract: null,
        hasOwnAllocation: true,
        resolved: {
          contractId: 300,
          scopes: payload().resolved.scopes.map((scope) => ({
            ...scope,
            sourceContractId: 300,
          })),
        },
      }),
      isLoading: false,
    });

    renderTab();

    expect(
      screen.queryByRole('button', { name: 'Save Allocation' }),
    ).toBeNull();
    openEditor();
    expect(
      screen.getByRole('button', { name: 'Save Allocation' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      screen.queryByRole('button', { name: 'Save Allocation' }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Edit allocation' }),
    ).toBeTruthy();
  });

  it('returns to the read-only view after a save', async () => {
    mutateAsync.mockResolvedValue(undefined);
    useCostAllocationTab.mockReturnValue({
      data: payload({
        isInvoice: false,
        sourceContract: null,
        hasOwnAllocation: true,
        resolved: {
          contractId: 300,
          scopes: payload().resolved.scopes.map((scope) => ({
            ...scope,
            sourceContractId: 300,
          })),
        },
      }),
      isLoading: false,
    });

    renderTab();
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Save Allocation' }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Edit allocation' }),
      ).toBeTruthy(),
    );
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: 'Save Allocation' }),
    ).toBeNull();
  });

  it('clears every line in one click and Save issues the delete', async () => {
    mutateAsync.mockResolvedValue(undefined);
    useCostAllocationTab.mockReturnValue({
      data: payload({
        isInvoice: false,
        sourceContract: null,
        hasOwnAllocation: true,
        resolved: {
          contractId: 300,
          scopes: payload().resolved.scopes.map((scope) => ({
            ...scope,
            sourceContractId: 300,
          })),
        },
      }),
      isLoading: false,
    });

    renderTab();
    openEditor();
    expect(screen.getByLabelText('Percentage for Research')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));

    expect(screen.queryByLabelText('Percentage for Research')).toBeNull();
    expect(screen.queryByLabelText('Percentage for Ada Lovelace')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Save Allocation' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith([]));
  });

  it('keeps the split method across Clear all', () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        isInvoice: false,
        sourceContract: null,
        hasOwnAllocation: true,
        seats: [{ productId: null, employeeId: 9 }],
        resolved: {
          contractId: 300,
          scopes: payload().resolved.scopes.map((scope) => ({
            ...scope,
            sourceContractId: 300,
          })),
        },
      }),
      isLoading: false,
    });

    renderTab();
    openEditor();
    expect(
      screen.getByRole('radio', { name: 'Manual' }).getAttribute('data-state'),
    ).toBe('on');

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.queryByRole('radio', { name: 'Manual' })).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'Add all active users (1)' }),
    );
    expect(
      screen.getByRole('radio', { name: 'Manual' }).getAttribute('data-state'),
    ).toBe('on');
  });

  it('hides Clear all while the scope tracks active users', () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        isInvoice: false,
        sourceContract: null,
        hasOwnAllocation: true,
        seats: [{ productId: null, employeeId: 9 }],
        resolved: {
          contractId: 300,
          scopes: [
            {
              productId: null,
              mode: 'active_users',
              sourceContractId: 300,
              unlinkedUserCount: 0,
              lines: [
                {
                  target: {
                    kind: 'employee',
                    id: 9,
                    name: 'Ada Lovelace',
                    orgUnitId: 1,
                  },
                  percent: 100,
                },
              ],
            },
          ],
        },
      }),
      isLoading: false,
    });

    renderTab();
    openEditor();

    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
  });

  it('offers the active-user shortcut beside the picker and adds every seat holder in one click', () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        isInvoice: false,
        sourceContract: null,
        resolved: { contractId: 300, scopes: [] },
        seats: [
          { productId: null, employeeId: 9 },
          { productId: null, employeeId: 10 },
          { productId: null, employeeId: null },
        ],
      }),
      isLoading: false,
    });

    renderTab();
    openEditor();

    expect(screen.getByText(/Add all 2 active users/)).toBeTruthy();
    const shortcut = screen.getByRole('button', {
      name: 'Add all active users (2)',
    });
    fireEvent.click(shortcut);

    expect(screen.getByLabelText('Percentage for Ada Lovelace')).toBeTruthy();
    expect(screen.getByLabelText('Percentage for Grace Hopper')).toBeTruthy();
    expect((shortcut as HTMLButtonElement).disabled).toBe(true);
  });

  it('leaves a seat holder who is off the catalog out of the shortcut and the live split', () => {
    // Employee 11 holds an unreleased seat but is absent from the catalog's
    // Users category: departed, on leave, or deleted. A seat outlives the
    // employment, so it must not make them an active user.
    useCostAllocationTab.mockReturnValue({
      data: payload({
        isInvoice: false,
        sourceContract: null,
        resolved: { contractId: 300, scopes: [] },
        seats: [
          { productId: null, employeeId: 9 },
          { productId: null, employeeId: 11 },
        ],
      }),
      isLoading: false,
    });

    renderTab();
    openEditor();

    const shortcut = screen.getByRole('button', {
      name: 'Add all active users (1)',
    });
    fireEvent.click(shortcut);

    expect(screen.getByLabelText('Percentage for Ada Lovelace')).toBeTruthy();
    expect(screen.queryByText(/Employee #11/)).toBeNull();
    expect(
      (screen.getByLabelText('Percentage for Ada Lovelace') as HTMLInputElement)
        .value,
    ).toBe('100');
  });

  it('hides the active-user shortcut when the contract has no linked seats', () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        isInvoice: false,
        sourceContract: null,
        resolved: { contractId: 300, scopes: [] },
      }),
      isLoading: false,
    });

    renderTab();

    expect(
      screen.queryByRole('button', { name: /Add all active users/ }),
    ).toBeNull();
  });

  it('hides the active-user shortcut while the scope tracks active users', () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        isInvoice: false,
        sourceContract: null,
        hasOwnAllocation: true,
        seats: [{ productId: null, employeeId: 9 }],
        resolved: {
          contractId: 300,
          scopes: [
            {
              productId: null,
              mode: 'active_users',
              sourceContractId: 300,
              unlinkedUserCount: 0,
              lines: [
                {
                  target: {
                    kind: 'employee',
                    id: 9,
                    name: 'Ada Lovelace',
                    orgUnitId: 1,
                  },
                  percent: 100,
                },
              ],
            },
          ],
        },
      }),
      isLoading: false,
    });

    renderTab();

    expect(screen.getByText(/Split equally among active users/)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Add all active users/ }),
    ).toBeNull();
  });

  it('replaces the placeholder zero when a percentage is typed in Manual mode', () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        isInvoice: false,
        sourceContract: null,
        hasOwnAllocation: true,
        resolved: {
          contractId: 300,
          scopes: [
            {
              productId: null,
              mode: 'manual',
              sourceContractId: 300,
              unlinkedUserCount: 0,
              lines: [
                {
                  target: { kind: 'org_unit', id: 1, name: 'Research' },
                  percent: 0,
                },
              ],
            },
          ],
        },
      }),
      isLoading: false,
    });

    renderTab();
    openEditor();
    const input = screen.getByLabelText(
      'Percentage for Research',
    ) as HTMLInputElement;
    expect(input.value).toBe('0');

    fireEvent.change(input, { target: { value: '05' } });

    expect(input.value).toBe('5');
  });

  it('selects the whole value when a percentage or amount input takes focus', () => {
    const select = jest.spyOn(HTMLInputElement.prototype, 'select');
    useCostAllocationTab.mockReturnValue({
      data: payload({
        isInvoice: false,
        sourceContract: null,
        hasOwnAllocation: true,
        resolved: {
          contractId: 300,
          scopes: [
            {
              productId: null,
              mode: 'manual',
              sourceContractId: 300,
              unlinkedUserCount: 0,
              lines: [
                {
                  target: { kind: 'org_unit', id: 1, name: 'Research' },
                  percent: 60,
                },
              ],
            },
          ],
        },
      }),
      isLoading: false,
    });

    renderTab();
    openEditor();
    const percent = screen.getByLabelText(
      'Percentage for Research',
    ) as HTMLInputElement;
    fireEvent.focus(percent);
    expect(percent.selectionStart).toBe(0);
    expect(percent.selectionEnd).toBe(percent.value.length);

    select.mockClear();
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit amount for Research' }),
    );
    const amount = screen.getByLabelText(
      'Amount for Research',
    ) as HTMLInputElement;
    fireEvent.focus(amount);
    expect(select).toHaveBeenCalled();
    expect(select.mock.instances).toContain(amount);
    select.mockRestore();
  });

  it('shows a skeleton while the editor waits for the catalog', () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        isInvoice: false,
        sourceContract: null,
        resolved: { contractId: 300, scopes: [] },
      }),
      isLoading: false,
    });
    catalogState = { data: undefined, isLoading: true, error: null };

    renderTab();

    expect(
      screen.queryByRole('button', { name: 'Save Allocation' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Add Allocation Target' }),
    ).toBeNull();
  });

  it('still offers Cancel when the catalog fails to load', () => {
    catalogState = {
      data: undefined,
      isLoading: false,
      error: new Error('nope'),
    };
    useCostAllocationTab.mockReturnValue({
      data: payload({
        isInvoice: false,
        sourceContract: null,
        hasOwnAllocation: true,
        resolved: {
          contractId: 300,
          scopes: payload().resolved.scopes.map((scope) => ({
            ...scope,
            sourceContractId: 300,
          })),
        },
      }),
      isLoading: false,
    });

    renderTab();
    openEditor();

    expect(screen.getByText('Could not load allocation targets')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.getByRole('button', { name: 'Edit allocation' }),
    ).toBeTruthy();
  });

  it('does not offer Cancel out of the error state while a save is in flight', () => {
    savePending = true;
    catalogState = {
      data: undefined,
      isLoading: false,
      error: new Error('nope'),
    };
    useCostAllocationTab.mockReturnValue({
      data: payload({
        isInvoice: false,
        sourceContract: null,
        hasOwnAllocation: true,
        resolved: {
          contractId: 300,
          scopes: payload().resolved.scopes.map((scope) => ({
            ...scope,
            sourceContractId: 300,
          })),
        },
      }),
      isLoading: false,
    });

    renderTab();
    openEditor();

    // Unmounting the editor does not abort the mutation, so the allocation
    // would land after the user asked to discard it.
    expect(
      screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('surfaces a catalog load failure inside the editor', () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        isInvoice: false,
        sourceContract: null,
        resolved: { contractId: 300, scopes: [] },
      }),
      isLoading: false,
    });
    catalogState = {
      data: undefined,
      isLoading: false,
      error: new Error('catalog down'),
    };

    renderTab();
    openEditor();

    expect(screen.getByText('Could not load allocation targets')).toBeTruthy();
    expect(screen.getByText('catalog down')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Save Allocation' }),
    ).toBeNull();
  });

  it('shows the scope chooser only for two or more products', () => {
    const unassigned = (products: { id: number; name: string }[]) =>
      payload({
        isInvoice: false,
        sourceContract: null,
        resolved: { contractId: 300, scopes: [] },
        products,
      });
    useCostAllocationTab.mockReturnValue({
      data: unassigned([{ id: 1, name: 'Terminal' }]),
      isLoading: false,
    });

    const { unmount } = renderTab();
    openEditor();
    expect(
      screen.queryByText('How would you like to allocate costs?'),
    ).toBeNull();
    unmount();

    useCostAllocationTab.mockReturnValue({
      data: unassigned([
        { id: 1, name: 'Terminal' },
        { id: 2, name: 'Data Feed' },
      ]),
      isLoading: false,
    });
    renderTab();
    openEditor();
    expect(
      screen.getByText('How would you like to allocate costs?'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'By Product (2)' }));
    expect(screen.getByText('Terminal')).toBeTruthy();
    expect(screen.getByText('Data Feed')).toBeTruthy();
  });

  it('names each product scope table after its product', () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        isInvoice: false,
        sourceContract: null,
        hasOwnAllocation: true,
        resolved: {
          contractId: 300,
          scopes: [
            {
              productId: 1,
              mode: 'manual',
              sourceContractId: 300,
              unlinkedUserCount: 0,
              lines: [
                {
                  target: { kind: 'org_unit', id: 1, name: 'Research' },
                  percent: 100,
                },
              ],
            },
          ],
        },
        products: [
          { id: 1, name: 'Terminal' },
          { id: 2, name: 'Data Feed' },
        ],
      }),
      isLoading: false,
    });

    renderTab();

    expect(
      screen.getByRole('table', { name: 'Terminal allocation' }),
    ).toBeTruthy();
  });

  it('keeps a product-scoped editor alive when a product appears under it', () => {
    const initial = [
      { id: 1, name: 'Terminal' },
      { id: 2, name: 'Data Feed' },
    ];
    const unassigned = (products: { id: number; name: string }[]) =>
      payload({
        isInvoice: false,
        sourceContract: null,
        resolved: { contractId: 300, scopes: [] },
        products,
      });
    useCostAllocationTab.mockReturnValue({
      data: unassigned(initial),
      isLoading: false,
    });

    const { rerender } = renderTab();
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'By Product (2)' }));
    useCostAllocationTab.mockReturnValue({
      data: unassigned([...initial, { id: 3, name: 'Analytics' }]),
      isLoading: false,
    });
    rerender(<CostAllocationTab contractId={300} canEdit />);

    expect(screen.getByText('Analytics')).toBeTruthy();
    expect(screen.getByText('Terminal')).toBeTruthy();
  });

  it('shows the settings empty state when the org has nothing to allocate to', () => {
    useCostAllocationTab.mockReturnValue({
      data: payload({
        isInvoice: false,
        sourceContract: null,
        hasAllocationTargets: false,
        resolved: { contractId: 300, scopes: [] },
      }),
      isLoading: false,
    });

    renderTab();

    expect(screen.getByText('Nothing to allocate to yet')).toBeTruthy();
    expect(
      screen
        .getByText('Settings › Employees')
        .closest('a')
        ?.getAttribute('href'),
    ).toBe('/settings/employees');
    expect(
      screen.getByText('Settings › Groups').closest('a')?.getAttribute('href'),
    ).toBe('/settings/groups');
  });
});
