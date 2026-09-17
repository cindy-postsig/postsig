/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DateField } from '@/components/ui/date-field';

const renderField = (value = '2025-03-01') => {
  const onChange = jest.fn();
  render(<DateField label="From" value={value} onChange={onChange} />);
  return { onChange, input: screen.getByLabelText('From') as HTMLInputElement };
};

const calendar = () => screen.queryByRole('dialog');

describe('DateField', () => {
  it('keeps a bare ArrowDown for the date input and opens the calendar on Alt+ArrowDown', () => {
    const { input } = renderField();

    // ArrowDown alone steps the focused segment of a date input; the
    // calendar must not steal it.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(calendar()).toBeNull();

    fireEvent.keyDown(input, { key: 'ArrowDown', altKey: true });
    expect(calendar()).toBeTruthy();
  });

  it('opens from its icon and hands back the picked day as a local ISO date', () => {
    const { onChange } = renderField();

    fireEvent.click(screen.getByRole('button', { name: 'Pick the from date' }));
    const grid = within(calendar() as HTMLElement).getByRole('grid');
    fireEvent.click(within(grid).getByText('15'));

    expect(onChange).toHaveBeenCalledWith('2025-03-15');
    expect(calendar()).toBeNull();
  });

  it('will not pick a day the input itself rejects', () => {
    const onChange = jest.fn();
    render(
      <DateField
        label="To"
        value="2025-03-15"
        min="2025-03-10"
        max="2025-03-20"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pick the to date' }));
    const grid = within(calendar() as HTMLElement).getByRole('grid');
    const day = (label: string) =>
      within(grid).getByText(label).closest('button') as HTMLButtonElement;

    expect(day('7').disabled).toBe(true);
    expect(day('29').disabled).toBe(true);
    expect(day('12').disabled).toBe(false);
    fireEvent.click(day('7'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('passes typed entry straight through', () => {
    const { onChange, input } = renderField('');

    fireEvent.change(input, { target: { value: '2026-01-31' } });

    expect(onChange).toHaveBeenCalledWith('2026-01-31');
  });

  it("shows and reads the date in the user's pattern, and hands back ISO", () => {
    const onChange = jest.fn();
    render(
      <DateField
        label="From"
        value="2025-03-01"
        pattern="dd.MM.yyyy"
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('From') as HTMLInputElement;
    expect(input.value).toBe('01.03.2025');
    expect(input.placeholder).toBe('dd.mm.yyyy');

    fireEvent.change(input, { target: { value: '15.03.2025' } });
    expect(onChange).toHaveBeenCalledWith('2025-03-15');
  });

  it('keeps an incomplete or wrongly formatted entry in the box and clears the value', () => {
    const onChange = jest.fn();
    render(
      <DateField
        label="From"
        value="2025-03-01"
        pattern="dd.MM.yyyy"
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('From') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '15.03' } });
    expect(onChange).toHaveBeenCalledWith('');
    expect(input.value).toBe('15.03');

    // An ISO date is not a date in this pattern, and a two-digit year is not
    // a year — neither may slip through as a value.
    onChange.mockClear();
    fireEvent.change(input, { target: { value: '2025-03-15' } });
    expect(onChange).toHaveBeenLastCalledWith('');
    fireEvent.change(input, { target: { value: '15.03.25' } });
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(input.value).toBe('15.03.25');
  });
});
