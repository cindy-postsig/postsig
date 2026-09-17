import {
  assignmentsWindow,
  defaultAssignmentsMonth,
  isAssignmentsMonth,
  monthRange,
  stepMonth,
} from '@/lib/v2/assignments/window';

const TODAY = new Date('2026-09-08T12:00:00Z');

describe('isAssignmentsMonth', () => {
  it('accepts a YYYY-MM month and nothing else', () => {
    expect(isAssignmentsMonth('2026-04')).toBe(true);
    expect(isAssignmentsMonth('2026-13')).toBe(false);
    expect(isAssignmentsMonth('2026-00')).toBe(false);
    expect(isAssignmentsMonth('2026-04-01')).toBe(false);
    expect(isAssignmentsMonth('april')).toBe(false);
    expect(isAssignmentsMonth(undefined)).toBe(false);
  });
});

describe('defaultAssignmentsMonth', () => {
  it('is the current calendar month', () => {
    expect(defaultAssignmentsMonth(TODAY)).toBe('2026-09');
  });
});

describe('assignmentsWindow', () => {
  it('spells the month out for the page to print', () => {
    expect(assignmentsWindow('2026-04')).toEqual({
      month: '2026-04',
      label: 'April 2026',
    });
    expect(assignmentsWindow('2026-12').label).toBe('December 2026');
  });
});

describe('monthRange', () => {
  it('is half-open: the first of the month to the first of the next', () => {
    const { start, end } = monthRange('2026-12');
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('stepMonth', () => {
  it('walks whole months across year boundaries', () => {
    expect(stepMonth('2026-01', -1)).toBe('2025-12');
    expect(stepMonth('2026-12', 1)).toBe('2027-01');
    expect(stepMonth('2026-04', 1)).toBe('2026-05');
  });
});
