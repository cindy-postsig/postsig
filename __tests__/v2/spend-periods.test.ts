import { enumeratePeriods } from '@/lib/v2/spend';
import { parseUTCDate } from '@/lib/v2/spend/dates';

const jan = { startMonth: 1 };
const april = { startMonth: 4 };

describe('enumeratePeriods', () => {
  it('enumerates a January-fiscal year as 12 month keys', () => {
    const periods = enumeratePeriods(
      parseUTCDate('2026-01-01'),
      parseUTCDate('2027-01-01'),
      'month',
      jan,
    );
    expect(periods).toHaveLength(12);
    expect(periods[0]).toBe('2026-01');
    expect(periods[11]).toBe('2026-12');
  });

  it('enumerates an April-fiscal year as four fiscal quarters', () => {
    const periods = enumeratePeriods(
      parseUTCDate('2026-04-01'),
      parseUTCDate('2027-04-01'),
      'quarter',
      april,
    );
    expect(periods).toEqual([
      'FY2026-Q1',
      'FY2026-Q2',
      'FY2026-Q3',
      'FY2026-Q4',
    ]);
  });

  it('collapses a whole fiscal year to one key at year granularity', () => {
    const periods = enumeratePeriods(
      parseUTCDate('2026-04-01'),
      parseUTCDate('2027-04-01'),
      'year',
      april,
    );
    expect(periods).toEqual(['FY2026']);
  });

  it('includes the month containing a mid-month exclusive end', () => {
    const periods = enumeratePeriods(
      parseUTCDate('2026-01-15'),
      parseUTCDate('2026-03-15'),
      'month',
      jan,
    );
    expect(periods).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('excludes the end month when the window ends exactly on its first day', () => {
    const periods = enumeratePeriods(
      parseUTCDate('2026-01-01'),
      parseUTCDate('2026-03-01'),
      'month',
      jan,
    );
    expect(periods).toEqual(['2026-01', '2026-02']);
  });

  it('returns no periods for an empty window', () => {
    expect(
      enumeratePeriods(
        parseUTCDate('2026-01-01'),
        parseUTCDate('2026-01-01'),
        'month',
        jan,
      ),
    ).toEqual([]);
  });

  it('spans multiple fiscal years at year granularity', () => {
    const periods = enumeratePeriods(
      parseUTCDate('2025-06-01'),
      parseUTCDate('2027-06-01'),
      'year',
      april,
    );
    expect(periods).toEqual(['FY2025', 'FY2026', 'FY2027']);
  });
});
