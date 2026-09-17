/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { formatCurrency } from '@/app/lib/utils';
import {
  SeatDetailRow,
  SeatExpanderCell,
  hasSeatDetail,
} from '@/components/assignments/SeatDetail';
import type { AssignmentSeat } from '@/lib/v2/assignments/types';

const eur = (value: number) => formatCurrency(value, 'EUR', true) ?? '';

const seat = (over: Partial<AssignmentSeat> = {}): AssignmentSeat => ({
  id: -266891005,
  contractId: -500,
  productId: 28,
  productName: 'Bloomberg Anywhere',
  vendorId: 9,
  vendorName: 'Bloomberg',
  deliveryMethods: ['Terminal'],
  orgEmployeeId: 1,
  holderName: 'Ada Lovelace',
  assignedDate: '2000-04-07',
  inactiveReasons: [],
  underused: false,
  monthlyCost: 2062.6,
  entitlements: {
    monthlyCost: 43.7,
    exchanges: [
      { code: 'CBOE', name: 'Cboe Europe L1', monthlyCost: 26.22 },
      { code: 'LSE', name: 'LSE L2', monthlyCost: 17.48 },
    ],
  },
  ...over,
});

const inRow = (cell: React.ReactNode) =>
  render(
    <table>
      <tbody>
        <tr>{cell}</tr>
      </tbody>
    </table>,
  );

const inBody = (row: React.ReactNode) =>
  render(
    <table>
      <tbody>{row}</tbody>
    </table>,
  );

describe('hasSeatDetail', () => {
  it('is true only for a seat carrying entitlements', () => {
    expect(hasSeatDetail(seat())).toBe(true);
    expect(hasSeatDetail(seat({ entitlements: undefined }))).toBe(false);
  });
});

describe('SeatExpanderCell', () => {
  it('offers the chevron, named for the state it would move to, and reports the click', () => {
    const onToggle = jest.fn();
    inRow(<SeatExpanderCell seat={seat()} open={false} onToggle={onToggle} />);

    const button = screen.getByRole('button', {
      name: 'Show details for Bloomberg Anywhere',
    });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('reads as Hide once open', () => {
    inRow(<SeatExpanderCell seat={seat()} open onToggle={jest.fn()} />);
    expect(
      screen
        .getByRole('button', { name: 'Hide details for Bloomberg Anywhere' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('leaves the cell empty for a seat with nothing to open', () => {
    inRow(
      <SeatExpanderCell
        seat={seat({ entitlements: undefined })}
        open={false}
        onToggle={jest.fn()}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('SeatDetailRow', () => {
  it('lists the terminal at its own price and each exchange at its share', () => {
    inBody(<SeatDetailRow seat={seat()} colSpan={8} baseCurrency="EUR" />);

    expect(
      screen.queryByText('Bloomberg Anywhere — 2 exchange entitlements'),
    ).not.toBeNull();
    const rows = screen.getAllByRole('row').slice(2);
    expect(rows.map((row) => row.textContent)).toEqual([
      `Terminal28Bloomberg Anywhere${eur(2018.9)}`,
      `ExchangeCBOECboe Europe L1${eur(26.22)}`,
      `ExchangeLSELSE L2${eur(17.48)}`,
    ]);
  });

  it('names one exchange in the singular', () => {
    inBody(
      <SeatDetailRow
        seat={seat({
          entitlements: {
            monthlyCost: 43.7,
            exchanges: [
              { code: 'CBOE', name: 'Cboe Europe L1', monthlyCost: 43.7 },
            ],
          },
        })}
        colSpan={8}
        baseCurrency="EUR"
      />,
    );
    expect(
      screen.queryByText('Bloomberg Anywhere — 1 exchange entitlement'),
    ).not.toBeNull();
  });

  it('says so when the seat is charged for entitlements the report never named', () => {
    inBody(
      <SeatDetailRow
        seat={seat({ entitlements: { monthlyCost: 43.7, exchanges: [] } })}
        colSpan={8}
        baseCurrency="EUR"
      />,
    );
    expect(
      screen.queryByText('No exchange permissions on this seat.'),
    ).not.toBeNull();
    expect(screen.queryByText(eur(2018.9))).not.toBeNull();
  });

  it('renders nothing inside the row for a seat without entitlements', () => {
    inBody(
      <SeatDetailRow
        seat={seat({ entitlements: undefined })}
        colSpan={8}
        baseCurrency="EUR"
      />,
    );
    expect(screen.queryByText('Terminal')).toBeNull();
    expect(screen.getByRole('cell').textContent).toBe('');
  });
});
