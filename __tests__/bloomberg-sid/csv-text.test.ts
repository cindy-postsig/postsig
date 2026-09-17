import {
  decodeSidCsv,
  detectDelimiter,
  parseCsvText,
} from '@/lib/v2/bloomberg-sid/csv-text';

describe('decodeSidCsv', () => {
  it('decodes latin1, strips the BOM and NUL block padding', () => {
    const bytes = Uint8Array.from([
      0xef,
      0xbb,
      0xbf,
      ...Buffer.from('Name\nM\xfcller\n', 'latin1'),
      0,
      0,
      0,
    ]);
    expect(decodeSidCsv(bytes.buffer)).toBe('Name\nMüller\n');
  });

  it('keeps 0x80-0x9F bytes as their code points, like the importer', () => {
    const bytes = Uint8Array.from([0x80, 0x9f, 0xe4]);
    expect(decodeSidCsv(bytes.buffer)).toBe('\u0080\u009fä');
  });
});

describe('detectDelimiter', () => {
  it('picks the delimiter that dominates the header line', () => {
    expect(detectDelimiter('a;b;c\n1,2;3')).toBe(';');
    expect(detectDelimiter('a,b,c\n1;2,3')).toBe(',');
    expect(detectDelimiter('a,b;c')).toBe(',');
  });
});

describe('parseCsvText', () => {
  it('splits rows and fields on the detected delimiter', () => {
    expect(parseCsvText('SID;Name\r\n1;Alice\n2;Bob')).toEqual([
      ['SID', 'Name'],
      ['1', 'Alice'],
      ['2', 'Bob'],
    ]);
  });

  it('honours quoted fields with embedded delimiters, quotes and newlines', () => {
    expect(parseCsvText('a,b\n"x, y","say ""hi""\nthere"')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"\nthere'],
    ]);
  });

  it('drops blank rows and keeps empty trailing fields', () => {
    expect(parseCsvText('a,b,c\n\n1,,\n , ,\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', ''],
    ]);
  });
});
