import { cellToString, isZeroLike } from '@/lib/v2/employee-import/cell-value';

describe('cellToString', () => {
  it('passes through trimmed strings', () => {
    expect(cellToString('  Sales Trading  ')).toBe('Sales Trading');
  });

  it('stringifies numbers without coercing zero to empty', () => {
    expect(cellToString(70133)).toBe('70133');
    expect(cellToString(0)).toBe('0');
  });

  it('stringifies booleans', () => {
    expect(cellToString(true)).toBe('true');
  });

  it('renders a Date as a UTC-anchored ISO date', () => {
    expect(cellToString(new Date(Date.UTC(2019, 9, 1)))).toBe('2019-10-01');
  });

  // An HR export almost always carries mailto-linked email cells. Without
  // explicit handling these stringify to "[object Object]" and land in a
  // column with a unique index.
  it('unwraps a hyperlink cell to its display text', () => {
    expect(
      cellToString({
        text: 'user1@berenberg.de',
        hyperlink: 'mailto:user1@berenberg.de',
      }),
    ).toBe('user1@berenberg.de');
  });

  it('falls back to the hyperlink when there is no display text', () => {
    expect(cellToString({ hyperlink: 'mailto:user2@berenberg.de' })).toBe(
      'user2@berenberg.de',
    );
  });

  it('joins rich text runs', () => {
    expect(
      cellToString({ richText: [{ text: 'Equity ' }, { text: 'Sales' }] }),
    ).toBe('Equity Sales');
  });

  it('unwraps a formula cell to its result', () => {
    expect(cellToString({ result: 5 })).toBe('5');
  });

  it.each([[{ error: '#N/A' }], [null], [undefined], [NaN]])(
    'renders %p as an empty string',
    (input) => {
      expect(cellToString(input)).toBe('');
    },
  );
});

describe('isZeroLike', () => {
  it.each([0, '0', '0.0', '000', ' 0 '])('treats %p as zero', (input) => {
    expect(isZeroLike(input)).toBe(true);
  });

  it.each(['', '70133', 'O', '0x', '10', null])(
    'does not treat %p as zero',
    (input) => {
      expect(isZeroLike(input)).toBe(false);
    },
  );
});
