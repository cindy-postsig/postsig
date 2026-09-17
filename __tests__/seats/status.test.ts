import {
  seatInactiveReasonLabels,
  seatInactiveReasons,
  seatStatusLabel,
  type SeatHolderStatus,
} from '@/lib/v2/seats/status';

const holder = (over: Partial<SeatHolderStatus> = {}): SeatHolderStatus => ({
  status: 'active',
  deleted_at: null,
  ...over,
});

describe('seatInactiveReasons', () => {
  it('is empty for a live seat held by an active employee', () => {
    expect(seatInactiveReasons(holder(), false)).toEqual([]);
  });

  it('names a departed holder a leaver', () => {
    expect(seatInactiveReasons(holder({ status: 'inactive' }), false)).toEqual([
      'leaver',
    ]);
  });

  it('names a holder on leave', () => {
    expect(seatInactiveReasons(holder({ status: 'on_leave' }), false)).toEqual([
      'on_leave',
    ]);
  });

  it('treats a soft-deleted holder as a leaver, whatever the status says', () => {
    expect(
      seatInactiveReasons(
        holder({ status: 'on_leave', deleted_at: '2026-03-01T00:00:00Z' }),
        false,
      ),
    ).toEqual(['leaver']);
  });

  it('names a seat the roster cannot place', () => {
    expect(seatInactiveReasons(undefined, false)).toEqual(['not_in_hr']);
  });

  it('flags a dormant seat even when its holder is active', () => {
    expect(seatInactiveReasons(holder(), true)).toEqual(['dormant']);
  });

  it('keeps every applicable reason, roster first', () => {
    expect(seatInactiveReasons(holder({ status: 'inactive' }), true)).toEqual([
      'leaver',
      'dormant',
    ]);
    expect(seatInactiveReasons(undefined, true)).toEqual([
      'not_in_hr',
      'dormant',
    ]);
  });
});

describe('seatStatusLabel', () => {
  it('reads Active with no reasons', () => {
    expect(seatStatusLabel([])).toBe('Active');
  });

  it('spells out the reasons in one Inactive label', () => {
    expect(seatStatusLabel(['leaver'])).toBe('Inactive (Leaver)');
    expect(seatStatusLabel(['not_in_hr'])).toBe(
      'Inactive (Employee not found)',
    );
    expect(seatStatusLabel(['on_leave', 'dormant'])).toBe(
      'Inactive (On leave, No use in 90 days)',
    );
  });

  it('labels reasons on their own for a list that is already inactive', () => {
    expect(seatInactiveReasonLabels(['dormant', 'leaver'])).toEqual([
      'No use in 90 days',
      'Leaver',
    ]);
  });
});
