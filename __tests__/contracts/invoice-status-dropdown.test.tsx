/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@/components/providers/AbilityProvider', () => ({
  useAbility: () => ({ can: () => true }),
}));

jest.mock('@/components/ui/dropdown-menu', () => {
  const react = require('react') as typeof React;
  const ValueContext = react.createContext<(value: string) => void>(() => {});
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    react.createElement('div', null, children);

  return {
    DropdownMenu: passthrough,
    DropdownMenuTrigger: passthrough,
    DropdownMenuContent: passthrough,
    DropdownMenuLabel: passthrough,
    DropdownMenuSeparator: () => react.createElement('hr'),
    DropdownMenuRadioGroup: ({
      children,
      onValueChange,
    }: {
      children?: React.ReactNode;
      onValueChange: (value: string) => void;
    }) =>
      react.createElement(
        ValueContext.Provider,
        { value: onValueChange },
        children,
      ),
    DropdownMenuRadioItem: ({
      children,
      value,
      disabled,
    }: {
      children?: React.ReactNode;
      value: string;
      disabled?: boolean;
    }) => {
      const onValueChange = react.useContext(ValueContext);
      return react.createElement(
        'button',
        { disabled, onClick: () => onValueChange(value) },
        children,
      );
    },
  };
});

import InvoiceStatusDropdown from '@/components/contracts/InvoiceStatusDropdown';

const renderDropdown = (
  onStatusUpdate: jest.Mock,
  props: Partial<React.ComponentProps<typeof InvoiceStatusDropdown>> = {},
) =>
  render(
    <InvoiceStatusDropdown
      currentStatus="review"
      onStatusUpdate={onStatusUpdate}
      isLoading={false}
      {...props}
    />,
  );

const openDialogFor = (label: string) =>
  fireEvent.click(screen.getByRole('button', { name: label }));

const button = (name: string) =>
  screen.getByRole('button', { name }) as HTMLButtonElement;

const reasonField = () =>
  screen.getByLabelText('Reason (optional)') as HTMLTextAreaElement;

describe('InvoiceStatusDropdown decision reason', () => {
  afterEach(() => jest.clearAllMocks());

  it('offers a skip button instead of blocking on an empty reason', () => {
    renderDropdown(jest.fn().mockResolvedValue(true));

    openDialogFor('Approved');

    expect(button('Skip').disabled).toBe(false);
    expect(reasonField().value).toBe('');
  });

  it('applies the status with no reason when skipped', async () => {
    const onStatusUpdate = jest.fn().mockResolvedValue(true);
    renderDropdown(onStatusUpdate);

    openDialogFor('Declined');
    fireEvent.click(button('Skip'));

    await waitFor(() => expect(onStatusUpdate).toHaveBeenCalledTimes(1));
    expect(onStatusUpdate).toHaveBeenCalledWith('declined', undefined);
  });

  it('does not resubmit a stored reason when skipped', async () => {
    const onStatusUpdate = jest.fn().mockResolvedValue(true);
    renderDropdown(onStatusUpdate, {
      currentReason: 'Existing decision reason',
    });

    openDialogFor('Declined');
    expect(reasonField().value).toBe('Existing decision reason');
    fireEvent.click(button('Skip'));

    await waitFor(() => expect(onStatusUpdate).toHaveBeenCalledTimes(1));
    expect(onStatusUpdate).toHaveBeenCalledWith('declined', undefined);
  });

  it('passes the trimmed reason through when confirmed', async () => {
    const onStatusUpdate = jest.fn().mockResolvedValue(true);
    renderDropdown(onStatusUpdate);

    openDialogFor('Void');
    fireEvent.change(reasonField(), {
      target: { value: '  Duplicate invoice  ' },
    });
    fireEvent.click(button('Confirm'));

    await waitFor(() => expect(onStatusUpdate).toHaveBeenCalledTimes(1));
    expect(onStatusUpdate).toHaveBeenCalledWith('void', 'Duplicate invoice');
  });

  it('keeps confirm disabled until a reason is typed', () => {
    renderDropdown(jest.fn().mockResolvedValue(true));

    openDialogFor('Paid');
    expect(button('Confirm').disabled).toBe(true);

    fireEvent.change(reasonField(), {
      target: { value: 'Cleared by bank' },
    });
    expect(button('Confirm').disabled).toBe(false);
  });

  it('does not prompt for a reason when moving back to review', async () => {
    const onStatusUpdate = jest.fn().mockResolvedValue(true);
    renderDropdown(onStatusUpdate, { currentStatus: 'paid' });

    openDialogFor('In Review');

    await waitFor(() => expect(onStatusUpdate).toHaveBeenCalledTimes(1));
    expect(onStatusUpdate).toHaveBeenCalledWith('review', undefined);
    expect(screen.queryByLabelText('Reason (optional)')).toBeNull();
  });
});
