/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AccountsTab } from '@/components/bloomberg-sid/AccountsTab';
import type { SidEntityRollup } from '@/lib/v2/bloomberg-sid/transforms';

const entity = (
  over: Partial<SidEntityRollup> & Pick<SidEntityRollup, 'custNum' | 'name'>,
): SidEntityRollup => ({
  city: 'London',
  country: 'GB',
  currencyCode: 'D',
  taxRate: 20,
  auto: 2,
  term: 2,
  baseSubs: 1,
  baseCost: 100,
  uniqueExchangeProducts: 0,
  allocationRows: 0,
  allocationKnownRows: 0,
  allocationMaskedRows: 0,
  allocationKnownCost: 0,
  totalKnownCost: 100,
  ...over,
});

const ROWS = [
  entity({ custNum: 100, name: 'Citi', term: 3 }),
  entity({ custNum: 200, name: 'alpha', term: 1 }),
  entity({ custNum: 300, name: 'Berenberg', term: 2 }),
];

const rowIndexOf = (name: string) => {
  const row = screen.getByText(name).closest('tr');
  if (!row) throw new Error(`no row for ${name}`);
  return (row as HTMLTableRowElement).rowIndex;
};

describe('the Accounts tab', () => {
  it('sorts text columns from their headers', () => {
    render(<AccountsTab rows={ROWS} />);
    const byEntity = screen.getByRole('button', { name: 'Sort by Entity' });

    fireEvent.click(byEntity);
    expect(['Citi', 'Berenberg', 'alpha'].map(rowIndexOf)).toEqual([1, 2, 3]);

    fireEvent.click(byEntity);
    expect(['alpha', 'Berenberg', 'Citi'].map(rowIndexOf)).toEqual([1, 2, 3]);
  });

  it('sorts numeric columns from their headers', () => {
    render(<AccountsTab rows={ROWS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Term' }));
    expect(['Citi', 'Berenberg', 'alpha'].map(rowIndexOf)).toEqual([1, 2, 3]);
  });
});
