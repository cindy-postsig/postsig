import {
  autoDetectMapping,
  describeColumns,
  guessHasHeaderRow,
} from '@/lib/v2/employee-import/describe-columns';
import type { SheetRow } from '@/lib/v2/employee-import/types';

describe('describeColumns', () => {
  const rows: SheetRow[] = [
    ['First Name', 'Cost Centre', 'Empty'],
    ['Ada', 70133, null],
    ['Grace', 70028, null],
    ['Alan', null, null],
  ];

  it('labels columns by letter and collects up to three samples', () => {
    const columns = describeColumns(rows, true, 3);

    expect(columns[0]).toEqual({
      index: 0,
      letter: 'A',
      header: 'First Name',
      samples: ['Ada', 'Grace', 'Alan'],
      nonEmptyCount: 3,
    });
    expect(columns[1]).toMatchObject({
      letter: 'B',
      header: 'Cost Centre',
      samples: ['70133', '70028'],
      nonEmptyCount: 2,
    });
    expect(columns[2]).toMatchObject({ header: 'Empty', samples: [] });
  });

  it('treats row 1 as data and reports no headers when headerless', () => {
    const columns = describeColumns(rows, false, 3);

    expect(columns[0].header).toBeNull();
    expect(columns[0].samples).toEqual(['First Name', 'Ada', 'Grace']);
    expect(columns[0].nonEmptyCount).toBe(4);
  });
});

describe('guessHasHeaderRow', () => {
  it('is false when row 1 contains a Date', () => {
    expect(
      guessHasHeaderRow([['a', new Date(Date.UTC(2019, 0, 1)), 'c']]),
    ).toBe(false);
  });

  it('is false when row 1 contains a number — the Berenberg case', () => {
    expect(guessHasHeaderRow([['user 1_ldn', 'User 1', 70133]])).toBe(false);
  });

  it('is true when row 1 is all text and matches at least two aliases', () => {
    expect(guessHasHeaderRow([['First Name', 'Last Name', 'Notes']])).toBe(
      true,
    );
  });

  it('is false when row 1 is text but matches fewer than two aliases', () => {
    expect(guessHasHeaderRow([['First Name', 'Widgets', 'Notes']])).toBe(false);
  });

  it('is false for an empty sheet', () => {
    expect(guessHasHeaderRow([])).toBe(false);
  });
});

describe('autoDetectMapping', () => {
  const column = (index: number, header: string | null) => ({
    index,
    letter: 'X',
    header,
    samples: [],
    nonEmptyCount: 0,
  });

  it.each([
    'Business Group',
    'business_group',
    'BUSINESSGROUP',
    ' Business Grp ',
  ])('auto-detects %s as the business group column', (header) => {
    expect(autoDetectMapping([column(4, header)])).toEqual({
      business_group: { sources: [{ index: 4 }] },
    });
  });

  it('maps known headers case-insensitively', () => {
    const fields = autoDetectMapping([
      column(0, 'First Name'),
      column(1, ' SURNAME '),
      column(2, 'Hire Date'),
      column(3, 'Termination Date'),
    ]);

    expect(fields).toEqual({
      first_name: { sources: [{ index: 0 }] },
      last_name: { sources: [{ index: 1 }] },
      start_date: { sources: [{ index: 2 }] },
      leave_date: { sources: [{ index: 3 }] },
    });
  });

  it('keeps the first column when two headers map to the same field', () => {
    const fields = autoDetectMapping([
      column(0, 'Email'),
      column(1, 'Work Email'),
    ]);

    expect(fields.email).toEqual({ sources: [{ index: 0 }] });
  });

  it('produces nothing for a headerless file', () => {
    expect(autoDetectMapping([column(0, null), column(1, null)])).toEqual({});
  });
});
