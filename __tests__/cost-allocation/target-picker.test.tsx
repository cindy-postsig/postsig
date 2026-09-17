/**
 * @jest-environment jsdom
 */
import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { TargetPicker } from '@/components/contracts/cost-allocation/TargetPicker';
import type { PickerCategory } from '@/lib/v2/cost-allocation/picker';

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

const catalog: PickerCategory[] = [
  {
    key: 'department',
    label: 'Departments',
    items: [
      {
        target: { kind: 'org_unit', id: 1, name: 'Research' },
        breadcrumb: 'Bank',
      },
      { target: { kind: 'org_unit', id: 2, name: 'Ops' } },
    ],
  },
  {
    key: 'user',
    label: 'Users',
    items: [
      {
        target: { kind: 'employee', id: 9, name: 'Ada Lovelace', orgUnitId: 1 },
      },
    ],
  },
];

const openPicker = () => {
  const onToggle = jest.fn();
  const onCreateBusinessGroup = jest
    .fn()
    .mockResolvedValue({ kind: 'org_unit', id: 50, name: 'Platform' });
  render(
    <TargetPicker
      catalog={catalog}
      selectedKeys={new Set(['org_unit:2'])}
      onToggle={onToggle}
      onCreateBusinessGroup={onCreateBusinessGroup}
      triggerLabel="Add Allocation Target"
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Add Allocation Target' }),
  );
  return { onToggle, onCreateBusinessGroup };
};

const checkedState = (option: HTMLElement) =>
  within(option).getByRole('checkbox').getAttribute('aria-checked');

describe('TargetPicker', () => {
  it('browses into a category, shows what is already picked, toggles, and comes back', () => {
    const { onToggle } = openPicker();

    fireEvent.click(screen.getByRole('option', { name: 'Departments' }));
    const research = screen.getByRole('option', { name: /Research/ });
    expect(research.textContent).toContain('· Bank');
    expect(checkedState(research)).toBe('false');
    expect(checkedState(screen.getByRole('option', { name: /Ops/ }))).toBe(
      'true',
    );

    fireEvent.click(research);
    expect(onToggle).toHaveBeenCalledWith({
      kind: 'org_unit',
      id: 1,
      name: 'Research',
    });

    fireEvent.click(screen.getByRole('option', { name: 'Departments' }));
    expect(screen.getByRole('option', { name: 'Users' })).toBeTruthy();
  });

  it('searches every category by name, labelling each hit, and says when nothing matches', () => {
    openPicker();
    const search = screen.getByPlaceholderText('Search allocation targets');

    fireEvent.change(search, { target: { value: 'ada' } });
    const hit = screen.getByRole('option', { name: /Ada Lovelace/ });
    expect(hit.textContent).toContain('Users');
    expect(screen.queryByRole('option', { name: 'Departments' })).toBeNull();

    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText('No results found.')).toBeTruthy();
  });

  it('creates a business group from the list, and the name field keeps its caret keys', async () => {
    const { onCreateBusinessGroup } = openPicker();

    fireEvent.click(
      screen.getByRole('option', { name: /Create business group/ }),
    );
    const name = screen.getByPlaceholderText('Business group name');
    fireEvent.change(name, { target: { value: 'Platform' } });
    // cmdk claims Home/End for list navigation and default-prevents them;
    // a true return means the key reached nobody but the field.
    expect(fireEvent.keyDown(name, { key: 'Home' })).toBe(true);
    fireEvent.keyDown(name, { key: 'Enter' });

    expect(screen.getByRole('option', { name: 'Users' })).toBeTruthy();
    await waitFor(() =>
      expect(onCreateBusinessGroup).toHaveBeenCalledWith('Platform'),
    );
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Business group name')).toBeNull(),
    );
  });
});
