/**
 * @jest-environment jsdom
 */
import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import type { OwnersCatalogData } from '@/lib/v2/owners/catalog';

// Radix's popper measures its content and cmdk scrolls the highlighted row
// into view; jsdom has neither layout nor ResizeObserver.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = jest.fn();
});

const invalidateOrganizationDataCache = jest.fn();
jest.mock('@/app/lib/actions/cache-actions', () => ({
  invalidateOrganizationDataCache: () => invalidateOrganizationDataCache(),
}));

const toast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast }),
}));

const can = jest.fn();
jest.mock('@/components/providers/AbilityProvider', () => ({
  useAbility: () => ({ can }),
}));

const useOwnersCatalog = jest.fn();
const useSaveContractOwners = jest.fn();
const saveOwners = jest.fn();
jest.mock('@/hooks/api/useOwners', () => ({
  useOwnersCatalog: (...args: unknown[]) => useOwnersCatalog(...args),
  useSaveContractOwners: (...args: unknown[]) => useSaveContractOwners(...args),
}));

jest.mock('@/components/settings/CreateBusinessGroupDialog', () => ({
  __esModule: true,
  default: () => null,
}));

import ContractOwner from '@/app/ui/contracts/owner';

const CONTRACT = {
  id: 42,
  business_justification: 'Renewal',
  business_order: 'PO-1',
  vendor_products_details: [],
  contract_owners: [
    {
      id: 1,
      role: 'sponsor',
      user_id: 'u-1',
      org_employee_id: null,
      label: null,
      org_unit_id: null,
      users: { name: 'Ada Lovelace', email: 'ada@acme.com' },
    },
    {
      id: 2,
      role: 'sponsor',
      user_id: null,
      org_employee_id: null,
      label: 'Acme Corp',
      org_unit_id: null,
    },
    {
      id: 3,
      role: 'group',
      user_id: null,
      org_employee_id: null,
      label: null,
      org_unit_id: 100,
      org_units: { name: 'Markets', level: 'business_group', parent_id: null },
    },
  ],
};

const CATALOG: OwnersCatalogData = {
  users: [{ id: 'u-2', name: 'Grace Hopper', email: 'grace@acme.com' }],
  employees: [{ id: 7, name: 'Alan Turing', unitPath: 'Bank · Ops' }],
  groups: [
    {
      key: 'business_group',
      label: 'Business Groups',
      items: [
        { target: { kind: 'org_unit', id: 100, name: 'Markets' } },
        { target: { kind: 'org_unit', id: 200, name: 'Platform' } },
      ],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  can.mockReturnValue(true);
  saveOwners.mockResolvedValue(undefined);
  useSaveContractOwners.mockReturnValue({ mutateAsync: saveOwners });
  useOwnersCatalog.mockReturnValue({ data: undefined, isLoading: false });
});

describe('ContractOwner', () => {
  it('renders the sponsors and groups carried on the contract', () => {
    render(<ContractOwner contract={CONTRACT} />);

    expect(screen.getByText('Ada Lovelace, Acme Corp')).toBeDefined();
    expect(screen.getByText('Markets')).toBeDefined();
  });

  it('keeps the field labels unchanged', () => {
    render(<ContractOwner contract={CONTRACT} />);

    expect(screen.getByText('Contract Owner')).toBeDefined();
    expect(screen.getByText('Business Sponsor')).toBeDefined();
    expect(screen.getByText('Business Groups')).toBeDefined();
    expect(screen.getByText('Business Justification')).toBeDefined();
  });

  it('offers Add Contract Owner when the contract has no owners', () => {
    render(<ContractOwner contract={{ ...CONTRACT, contract_owners: [] }} />);

    expect(screen.getByText('Add Contract Owner')).toBeDefined();
  });

  it('saves owner refs and unit ids through the v2 API and nothing else', async () => {
    render(<ContractOwner contract={CONTRACT} />);

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(saveOwners).toHaveBeenCalledTimes(1));
    expect(useSaveContractOwners).toHaveBeenCalledWith(42);
    expect(saveOwners).toHaveBeenCalledWith({
      sponsors: [
        { kind: 'user', id: 'u-1' },
        { kind: 'label', name: 'Acme Corp' },
      ],
      groupUnitIds: [100],
      justification: 'Renewal',
      order: 'PO-1',
    });
    // The service busts the org cache itself now.
    expect(invalidateOrganizationDataCache).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({
      title: 'Success',
      description: 'Saved successfully',
    });
  });

  it('omits the groups when the user cannot manage the organization', async () => {
    can.mockImplementation(
      (_action: string, subject: string) => subject !== 'Organization',
    );
    render(<ContractOwner contract={CONTRACT} />);

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(saveOwners).toHaveBeenCalledTimes(1));
    expect(saveOwners.mock.calls[0][0]).not.toHaveProperty('groupUnitIds');
  });

  it('reports a failed save instead of claiming success', async () => {
    saveOwners.mockRejectedValue(new Error('nope'));
    render(<ContractOwner contract={CONTRACT} />);

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'Error saving changes',
        variant: 'destructive',
      }),
    );
  });

  it('shows the owners a later contract payload carries', () => {
    const { rerender } = render(<ContractOwner contract={CONTRACT} />);
    expect(screen.getByText('Ada Lovelace, Acme Corp')).toBeDefined();

    rerender(
      <ContractOwner
        contract={{
          ...CONTRACT,
          contract_owners: [
            {
              id: 9,
              role: 'sponsor',
              user_id: null,
              org_employee_id: null,
              label: 'Grace Hopper',
              org_unit_id: null,
            },
            {
              id: 10,
              role: 'group',
              user_id: null,
              org_employee_id: null,
              label: null,
              org_unit_id: 200,
              org_units: {
                name: 'Platform',
                level: 'business_group',
                parent_id: null,
              },
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('Grace Hopper')).toBeDefined();
    expect(screen.getByText('Platform')).toBeDefined();
    expect(screen.queryByText('Ada Lovelace, Acme Corp')).toBeNull();
  });
});

describe('ContractOwner editing', () => {
  beforeEach(() => {
    useOwnersCatalog.mockReturnValue({ data: CATALOG, isLoading: false });
  });

  const startEditing = () => {
    render(<ContractOwner contract={CONTRACT} />);
    fireEvent.click(screen.getByText('Edit'));
  };

  // The trigger is a combobox, a role whose accessible name never comes from
  // its content, so its own label is the only handle on it.
  const openPicker = (triggerLabel: string) =>
    fireEvent.click(screen.getByText(triggerLabel));

  const savedSponsors = () => saveOwners.mock.calls[0][0].sponsors;
  const savedGroupUnitIds = () => saveOwners.mock.calls[0][0].groupUnitIds;

  it('adds a PostSig user and an employee as their own refs', async () => {
    startEditing();

    openPicker('2 sponsors selected');
    fireEvent.click(screen.getByRole('option', { name: /Grace Hopper/ }));
    openPicker('3 sponsors selected');
    fireEvent.click(screen.getByRole('option', { name: /Alan Turing/ }));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(saveOwners).toHaveBeenCalledTimes(1));
    expect(savedSponsors()).toEqual([
      { kind: 'user', id: 'u-1' },
      { kind: 'label', name: 'Acme Corp' },
      { kind: 'user', id: 'u-2' },
      { kind: 'employee', id: 7 },
    ]);
    expect(
      await screen.findByText(
        'Ada Lovelace, Acme Corp, Grace Hopper, Alan Turing',
      ),
    ).toBeDefined();
  });

  it('adds a sponsor the contract already has only once', async () => {
    startEditing();

    openPicker('2 sponsors selected');
    fireEvent.change(screen.getByPlaceholderText('Search or add sponsor...'), {
      target: { value: 'acme corp' },
    });
    fireEvent.click(screen.getByRole('option', { name: /Add "acme corp"/ }));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(saveOwners).toHaveBeenCalledTimes(1));
    expect(savedSponsors()).toEqual([
      { kind: 'user', id: 'u-1' },
      { kind: 'label', name: 'Acme Corp' },
    ]);
  });

  it('drops a sponsor whose chip was removed', async () => {
    startEditing();

    fireEvent.click(within(screen.getByText('Acme Corp')).getByRole('button'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(saveOwners).toHaveBeenCalledTimes(1));
    expect(savedSponsors()).toEqual([{ kind: 'user', id: 'u-1' }]);
  });

  it('adds a group and removes the one already on the contract', async () => {
    startEditing();

    openPicker('1 group selected');
    fireEvent.click(screen.getByRole('option', { name: /Platform/ }));
    fireEvent.click(screen.getByRole('option', { name: /Markets/ }));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(saveOwners).toHaveBeenCalledTimes(1));
    expect(savedGroupUnitIds()).toEqual([200]);
  });

  it('leaves the groups untouched when one is toggled on and off again', async () => {
    startEditing();

    openPicker('1 group selected');
    fireEvent.click(screen.getByRole('option', { name: /Platform/ }));
    fireEvent.click(screen.getByRole('option', { name: /Platform/ }));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(saveOwners).toHaveBeenCalledTimes(1));
    expect(savedGroupUnitIds()).toEqual([100]);
  });
});
