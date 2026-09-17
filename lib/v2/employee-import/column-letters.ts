/**
 * Spreadsheet column letters (A, B, … Z, AA, AB, …) <-> 0-based indexes.
 * Headerless files are mapped by letter, so this is the user-facing column name.
 */

const LETTERS_ONLY = /^[A-Za-z]+$/;

export function columnLetterToIndex(letter: string): number {
  const trimmed = letter.trim();
  if (!LETTERS_ONLY.test(trimmed)) {
    throw new Error(`Invalid column letter: "${letter}"`);
  }

  let index = 0;
  for (const char of trimmed.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

export function indexToColumnLetter(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Invalid column index: ${index}`);
  }

  let remaining = index;
  let letter = '';
  do {
    letter = String.fromCharCode(65 + (remaining % 26)) + letter;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return letter;
}
