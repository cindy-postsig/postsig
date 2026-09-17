/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { UsersTable } from '@/components/assignments/UsersTable';
import type { UserRow } from '@/lib/v2/assignments/rows';
import type { OrgUnitTreeLevel } from '@/lib/v2/org-units/levels';

const LEVELS: OrgUnitTreeLevel[] = ['entity'];

// Ranked by assignment count, the order `buildUserRows` hands over, so the
// first page holds the same people on every run.
const row = (index: number): UserRow => ({
  id: index,
  name: `Person ${String(index).padStart(4, '0')}`,
  email: `person${index}@example.com`,
  employeeId: `E${index}`,
  path: ['Markets'],
  pathByLevel: { entity: 'Markets' },
  status: 'active',
  assignmentCount: 1000 - index,
  monthlyCost: 100,
  vendorNames: ['Bloomberg'],
  productNames: ['Terminal'],
  products: [{ name: 'Terminal', count: 1, underused: false }],
});

const ROWS = Array.from({ length: 250 }, (_, index) => row(index));

const renderTable = (rows: UserRow[] = ROWS) =>
  render(<UsersTable rows={rows} pathLevels={LEVELS} onSelect={jest.fn()} />);

const peopleRendered = () => screen.getAllByRole('row').length - 1; // less the header row

const search = () => screen.getByLabelText('Search users');

const currentPage = () =>
  screen
    .getAllByRole('button')
    .find((button) => button.getAttribute('aria-current') === 'page')
    ?.textContent;

describe('the Users table pages', () => {
  it('renders fifty people a page, counting the whole filtered set', () => {
    renderTable();
    expect(peopleRendered()).toBe(50);
    expect(screen.getByText('250 of 250 people shown')).toBeTruthy();
  });

  it('offers a page per fifty and moves between them', () => {
    renderTable();
    const first = screen.getAllByRole('row')[1].textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 5' }));
    expect(peopleRendered()).toBe(50);
    expect(screen.getAllByRole('row')[1].textContent).not.toBe(first);
    // 250 people at 50 a page is exactly five pages, and no sixth.
    expect(screen.queryByRole('button', { name: 'Go to page 6' })).toBeNull();
  });

  it('offers the page-size selector, opening on fifty', () => {
    renderTable();
    expect(screen.getByText('Rows')).toBeTruthy();
    expect(screen.getByRole('combobox').textContent).toBe('50');
  });

  it('hides the strip when everyone fits on one page', () => {
    renderTable(ROWS.slice(0, 40));
    expect(peopleRendered()).toBe(40);
    expect(screen.queryByRole('button', { name: 'Go to page 1' })).toBeNull();
  });

  it('goes back to the first page when the search narrows the table', async () => {
    renderTable();
    // TanStack arms its page auto-reset on a microtask after the first render,
    // so a synchronous run of events would outrun it.
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 5' }));
    expect(currentPage()).toBe('5');

    fireEvent.change(search(), { target: { value: 'Person' } });
    await act(async () => {});
    expect(currentPage()).toBe('1');
  });

  it('goes back to the first page when the sort changes', async () => {
    renderTable();
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 5' }));
    expect(currentPage()).toBe('5');

    fireEvent.click(screen.getByRole('button', { name: 'User' }));
    await act(async () => {});
    expect(currentPage()).toBe('1');
  });

  it('keeps the empty state when nothing matches', () => {
    renderTable();
    fireEvent.change(search(), { target: { value: 'nobody at all' } });
    expect(
      screen.getByText('Nobody in this scope matches those filters.'),
    ).toBeTruthy();
    expect(screen.getByText('0 of 250 people shown')).toBeTruthy();
  });

  it('says the scope is empty when there is nothing to filter', () => {
    renderTable([]);
    expect(screen.getByText('No assigned users in this scope.')).toBeTruthy();
  });
});

describe('the Users table search', () => {
  const people: UserRow[] = [
    {
      ...row(1),
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      employeeId: 'E-9001',
      vendorNames: ['Bloomberg'],
      productNames: ['Terminal'],
    },
    {
      ...row(2),
      name: 'Alan Turing',
      email: 'alan@example.com',
      employeeId: 'E-9002',
      vendorNames: ['LSEG'],
      productNames: ['Workspace'],
    },
  ];

  const namesShown = () =>
    screen
      .getAllByRole('row')
      .map((r) => r.textContent ?? '')
      .filter((text) => text.includes('@example.com'));

  it.each([
    ['a name', 'lovelace', 'Ada Lovelace'],
    ['an email', 'alan@', 'Alan Turing'],
    ['an employee id', 'E-9001', 'Ada Lovelace'],
    ['a vendor', 'lseg', 'Alan Turing'],
    ['a product', 'workspace', 'Alan Turing'],
  ])('matches on %s', (_label, needle, expected) => {
    renderTable(people);
    fireEvent.change(search(), { target: { value: needle } });
    expect(namesShown()).toHaveLength(1);
    expect(namesShown()[0]).toContain(expected);
  });

  it('offers a reset only once something narrows the table, and clears it', () => {
    renderTable(people);
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();

    fireEvent.change(search(), { target: { value: 'lovelace' } });
    expect(namesShown()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect((search() as HTMLInputElement).value).toBe('');
    expect(namesShown()).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('marks the sorted column for assistive tech', () => {
    renderTable(people);
    const user = screen.getByRole('button', { name: 'User' });
    expect(user.closest('th')?.getAttribute('aria-sort')).toBeNull();
    fireEvent.click(user);
    expect(user.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    fireEvent.click(user);
    expect(user.closest('th')?.getAttribute('aria-sort')).toBe('descending');
  });

  it('lists a person’s vendors in their own column', () => {
    renderTable([{ ...people[0], vendorNames: ['Bloomberg', 'LSEG'] }]);
    const table = screen.getByRole('table');
    expect(within(table).getByText('Bloomberg, LSEG')).toBeTruthy();
  });
});
