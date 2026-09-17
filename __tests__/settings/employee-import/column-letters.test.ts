import {
  columnLetterToIndex,
  indexToColumnLetter,
} from '@/lib/v2/employee-import/column-letters';

describe('columnLetterToIndex', () => {
  it.each([
    ['A', 0],
    ['B', 1],
    ['Z', 25],
    ['AA', 26],
    ['AB', 27],
    ['AC', 28],
    ['AD', 29],
    ['BZ', 77],
  ])('maps %s to %i', (letter, index) => {
    expect(columnLetterToIndex(letter)).toBe(index);
  });

  it('accepts lowercase and surrounding whitespace', () => {
    expect(columnLetterToIndex('aa')).toBe(26);
    expect(columnLetterToIndex(' ad ')).toBe(29);
  });

  it.each(['', '1', 'A1', '-', 'A B'])('rejects %p', (input) => {
    expect(() => columnLetterToIndex(input)).toThrow(/Invalid column letter/);
  });
});

describe('indexToColumnLetter', () => {
  it.each([
    [0, 'A'],
    [25, 'Z'],
    [26, 'AA'],
    [29, 'AD'],
    [77, 'BZ'],
  ])('maps %i to %s', (index, letter) => {
    expect(indexToColumnLetter(index)).toBe(letter);
  });

  it('rejects negative and non-integer indexes', () => {
    expect(() => indexToColumnLetter(-1)).toThrow(/Invalid column index/);
    expect(() => indexToColumnLetter(1.5)).toThrow(/Invalid column index/);
  });

  it('round-trips A through BZ', () => {
    for (let i = 0; i <= 77; i++) {
      expect(columnLetterToIndex(indexToColumnLetter(i))).toBe(i);
    }
  });
});
