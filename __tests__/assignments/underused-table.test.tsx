/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { UnderusedTable } from '@/components/assignments/UnderusedTable';
import type { UnderusedRow } from '@/lib/v2/assignments/rows';

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

const seat = (over: Partial<UnderusedRow> = {}): UnderusedRow => ({
  seatId: 1,
  employeeId: 10,
  userName: 'Ada Lovelace',
  email: 'ada@example.com',
  department: 'Rates',
  vendorName: 'Bloomberg',
  productName: 'Terminal',
  inactiveReasons: ['dormant'],
  lastUsed: null,
  monthlyCost: 100,
  ...over,
});

const ROWS: UnderusedRow[] = [
  seat(),
  seat({
    seatId: 2,
    employeeId: 11,
    userName: 'Alan Turing',
    email: 'alan@example.com',
    department: 'Credit',
    vendorName: 'LSEG',
    productName: 'Workspace',
    inactiveReasons: ['leaver'],
    monthlyCost: 50,
  }),
];

const renderTable = (rows: UnderusedRow[] = ROWS) =>
  render(<UnderusedTable rows={rows} onSelectUser={jest.fn()} />);

const search = () => screen.getByLabelText('Search underutilized licences');

describe('the Underutilized table', () => {
  it('heads the list with what the shown seats cost a month', () => {
    renderTable();
    expect(
      screen.getByText(/2 licences · \$150\.00 \/ month at risk/),
    ).toBeTruthy();
  });

  it.each([
    ['a user', 'turing', 'Alan Turing'],
    ['a department', 'rates', 'Ada Lovelace'],
    ['a vendor', 'lseg', 'Alan Turing'],
    ['a product', 'terminal', 'Ada Lovelace'],
    ['a reason', 'leaver', 'Alan Turing'],
  ])('searches on %s', (_label, needle, expected) => {
    renderTable();
    fireEvent.change(search(), { target: { value: needle } });
    expect(screen.getByText(expected)).toBeTruthy();
    // The headline follows the filter, not the whole scope.
    expect(screen.getByText(/1 licence · /)).toBeTruthy();
  });

  it('filters on a vendor from its header popover, and resets', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Vendor' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('LSEG'));
    expect(screen.queryByText('Alan Turing')).toBeNull();
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByText('Alan Turing')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('spells out every reason the seat was flagged for', () => {
    renderTable([seat({ inactiveReasons: ['leaver', 'dormant'] })]);
    expect(screen.getByText('Leaver, No use in 90 days')).toBeTruthy();
  });

  it('filters on a reason from its header popover', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Reason' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Leaver'));
    expect(screen.queryByText('Alan Turing')).toBeNull();
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
  });

  it('sorts on a column, marking it for assistive tech', () => {
    renderTable();
    const monthly = screen.getByRole('button', { name: 'Monthly' });
    const names = () =>
      screen
        .getAllByRole('row')
        .map((row) => row.textContent ?? '')
        .filter((text) => text.includes('@example.com'));

    // Dearest first is the order the builder hands over.
    expect(names()[0]).toContain('Ada Lovelace');
    fireEvent.click(monthly);
    expect(monthly.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    expect(names()[0]).toContain('Alan Turing');

    fireEvent.click(monthly);
    expect(monthly.closest('th')?.getAttribute('aria-sort')).toBe('descending');
    expect(names()[0]).toContain('Ada Lovelace');
  });

  it('says nothing is flagged rather than showing an empty table', () => {
    renderTable([]);
    expect(screen.getByText('Nothing flagged in this scope.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('names an unlinked seat without offering a profile to open', () => {
    renderTable([seat({ employeeId: null, email: null })]);
    const table = screen.getByRole('table');
    expect(within(table).getByText('Ada Lovelace')).toBeTruthy();
    expect(
      within(table).queryByRole('button', { name: /Ada Lovelace/ }),
    ).toBeNull();
  });
});
