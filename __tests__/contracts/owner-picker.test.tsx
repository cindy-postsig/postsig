/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  GroupPicker,
  SponsorPicker,
  type SelectedSponsor,
} from '@/components/contracts/OwnerPicker';
import type { PickerCategory } from '@/lib/v2/cost-allocation/picker';
import type {
  OwnerCatalogEmployee,
  OwnerCatalogUser,
} from '@/lib/v2/owners/catalog';

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

const USERS: OwnerCatalogUser[] = [
  { id: 'u-1', name: 'Ada Lovelace', email: 'ada@acme.com' },
];

const EMPLOYEES: OwnerCatalogEmployee[] = [
  { id: 7, name: 'Alan Turing', unitPath: 'Bank · Ops' },
];

const GROUPS: PickerCategory[] = [
  {
    key: 'business_group',
    label: 'Business Groups',
    items: [{ target: { kind: 'org_unit', id: 100, name: 'Markets' } }],
  },
];

function renderSponsors(
  query: string,
  {
    users = USERS,
    employees = EMPLOYEES,
    selected = [],
  }: {
    users?: OwnerCatalogUser[];
    employees?: OwnerCatalogEmployee[];
    selected?: SelectedSponsor[];
  } = {},
) {
  const onAdd = jest.fn();
  render(
    <SponsorPicker
      open
      onOpenChange={() => {}}
      users={users}
      employees={employees}
      isLoading={false}
      selected={selected}
      query={query}
      onQueryChange={() => {}}
      onAdd={onAdd}
    />,
  );
  return onAdd;
}

describe('SponsorPicker', () => {
  it('offers the typed text as a label when no catalog name matches it', () => {
    renderSponsors('ada l');

    expect(screen.getByRole('option', { name: /Add "ada l"/ })).toBeDefined();
  });

  it('leads with the catalog entry when the typed name matches one exactly', () => {
    renderSponsors('  ADA LOVELACE ');

    expect(screen.queryByRole('option', { name: /^Add "/ })).toBeNull();
    expect(screen.getAllByRole('option')[0].textContent).toContain(
      'Ada Lovelace',
    );
  });

  it('says no user matched the typed text', () => {
    renderSponsors('zzz');

    expect(screen.getByText('No users found.')).toBeDefined();
  });

  it('says the organization has no users to offer', () => {
    renderSponsors('', { users: [], employees: [] });

    expect(screen.getByText('No organization users found.')).toBeDefined();
  });
});

describe('GroupPicker', () => {
  it('says no group matched the typed text, and still offers to create one', () => {
    render(
      <GroupPicker
        open
        onOpenChange={() => {}}
        categories={GROUPS}
        isLoading={false}
        selected={[]}
        query="zzz"
        onQueryChange={() => {}}
        onToggle={() => {}}
        onCreateNew={() => {}}
      />,
    );

    expect(screen.getByText('No groups found.')).toBeDefined();
    expect(
      screen.getByRole('option', { name: /Create new business group/ }),
    ).toBeDefined();
  });
});
