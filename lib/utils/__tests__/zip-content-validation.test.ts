import { describe, expect, it, jest } from '@jest/globals';
import { deflateRawSync } from 'node:zlib';

// `file-type` and its tokenizer dependencies are ESM-only with no CJS entry
// point, which this CJS Jest runner cannot resolve. The thin wrapper is the
// repo's single integration point with it, so it is mocked here and the sniff
// results below are the values the real file-type@21.3.x returns for these
// exact fixtures, measured directly rather than assumed.
const SNIFFS: Array<[string, string | undefined]> = [];

jest.mock('@/utils/file-type', () => ({
  __esModule: true,
  detectFileType: jest.fn(async (buffer: Uint8Array) => {
    const key = Buffer.from(buffer).toString('base64');
    const hit = SNIFFS.find(([k]) => k === key);
    const mime = hit?.[1];
    return mime === undefined ? undefined : { mime, ext: '' };
  }),
}));

import { validateZipEntry } from '../zip-content-validation';

/** Register what the real file-type returns for a fixture's exact bytes. */
function sniffsAs(buffer: Buffer, mime: string | undefined): Buffer {
  SNIFFS.push([buffer.toString('base64'), mime]);
  return buffer;
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function localHeader(nameLen: number, raw: Buffer, packed: Buffer): Buffer {
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(raw.length ? 8 : 0, 8);
  h.writeUInt32LE(crc32(raw), 14);
  h.writeUInt32LE(packed.length, 18);
  h.writeUInt32LE(raw.length, 22);
  h.writeUInt16LE(nameLen, 26);
  return h;
}

function centralHeader(
  nameLen: number,
  raw: Buffer,
  packed: Buffer,
  offset: number,
): Buffer {
  const h = Buffer.alloc(46);
  h.writeUInt32LE(0x02014b50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(20, 6);
  h.writeUInt16LE(raw.length ? 8 : 0, 10);
  h.writeUInt32LE(crc32(raw), 16);
  h.writeUInt32LE(packed.length, 20);
  h.writeUInt32LE(raw.length, 24);
  h.writeUInt16LE(nameLen, 28);
  h.writeUInt32LE(offset, 42);
  return h;
}

function endOfCentralDirectory(
  count: number,
  size: number,
  off: number,
): Buffer {
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(size, 12);
  eocd.writeUInt32LE(off, 16);
  return eocd;
}

/** Minimal ZIP writer: deflated entries, no extra fields, no zip64. */
export function buildZip(files: Record<string, Buffer>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const [name, raw] of Object.entries(files)) {
    const packed = raw.length ? deflateRawSync(raw) : Buffer.alloc(0);
    const nameBuf = Buffer.from(name);

    locals.push(localHeader(nameBuf.length, raw, packed), nameBuf, packed);
    centrals.push(centralHeader(nameBuf.length, raw, packed, offset), nameBuf);
    offset += 30 + nameBuf.length + packed.length;
  }

  const directory = Buffer.concat(centrals);
  const count = Object.keys(files).length;
  const eocd = endOfCentralDirectory(count, directory.length, offset);
  return Buffer.concat([...locals, directory, eocd]);
}

const SPREADSHEETML_PART =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
const WORDPROCESSINGML_PART =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TYPES_OPEN =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types ' +
  'xmlns="http://schemas.openxmlformats.org/package/2006/content-types">';

function contentTypes(overridePartMime?: string): string {
  if (!overridePartMime) return `${TYPES_OPEN}</Types>`;
  const override = `<Override PartName="/xl/workbook.xml" ContentType="${overridePartMime}"/>`;
  return `${TYPES_OPEN}${override}</Types>`;
}

/** A workbook as real generators write it: carries the OOXML Override. */
export function realShapedXlsx(): Buffer {
  return sniffsAs(
    buildZip({
      '[Content_Types].xml': Buffer.from(contentTypes(SPREADSHEETML_PART)),
      'xl/workbook.xml': Buffer.from('<workbook/>'),
    }),
    XLSX_MIME,
  );
}

/** An older-generator package: marker present, Override absent. */
function bareMarkerXlsx(): Buffer {
  return sniffsAs(
    buildZip({
      '[Content_Types].xml': Buffer.from(contentTypes()),
      'xl/workbook.xml': Buffer.from('<workbook/>'),
    }),
    'application/zip',
  );
}

function docxShaped(): Buffer {
  return sniffsAs(
    buildZip({
      '[Content_Types].xml': Buffer.from(contentTypes(WORDPROCESSINGML_PART)),
      'word/document.xml': Buffer.from('<document/>'),
    }),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
}

export function plainArchive(): Buffer {
  return sniffsAs(
    buildZip({ 'notes.txt': Buffer.from('hello') }),
    'application/zip',
  );
}

export function genuinePdf(): Buffer {
  return sniffsAs(
    Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'),
    'application/pdf',
  );
}

export function windowsExecutable(): Buffer {
  const buf = Buffer.alloc(256);
  buf.write('MZ', 0);
  buf.writeUInt32LE(0x80, 0x3c);
  buf.write('PE\0\0', 0x80);
  return sniffsAs(buf, 'application/x-msdownload');
}

function cfbDocument(): Buffer {
  const signature = Buffer.from([
    0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
  ]);
  return sniffsAs(
    Buffer.concat([signature, Buffer.alloc(1024)]),
    'application/x-cfb',
  );
}

describe('validateZipEntry', () => {
  describe('.pdf', () => {
    it('accepts a genuine PDF', async () => {
      const result = await validateZipEntry('report.pdf', genuinePdf());

      expect(result.accepted).toBe(true);
      expect(result.mimeType).toBe('application/pdf');
    });

    it('rejects an executable renamed .pdf', async () => {
      const result = await validateZipEntry('report.pdf', windowsExecutable());

      expect(result.accepted).toBe(false);
      expect(result.sniffedMimeType).toBe('application/x-msdownload');
    });
  });

  describe('.xlsx', () => {
    it('accepts a workbook carrying the OOXML Override', async () => {
      const result = await validateZipEntry('book.xlsx', realShapedXlsx());

      expect(result.accepted).toBe(true);
      expect(result.mimeType).toBe(XLSX_MIME);
      expect(result.sniffedMimeType).toBe(XLSX_MIME);
    });

    it('accepts a package whose marker lacks the Override', async () => {
      const result = await validateZipEntry('book.xlsx', bareMarkerXlsx());

      expect(result.accepted).toBe(true);
      expect(result.mimeType).toBe(XLSX_MIME);
      expect(result.sniffedMimeType).toBe('application/zip');
    });

    it('rejects a plain archive renamed .xlsx', async () => {
      const result = await validateZipEntry('book.xlsx', plainArchive());

      expect(result.accepted).toBe(false);
      expect(result.recursionEligible).toBe(false);
    });

    it('rejects a word package renamed .xlsx', async () => {
      const result = await validateZipEntry('book.xlsx', docxShaped());

      expect(result.accepted).toBe(false);
    });
  });

  describe('.xls', () => {
    it('accepts a CFB document', async () => {
      const result = await validateZipEntry('legacy.xls', cfbDocument());

      expect(result.accepted).toBe(true);
      expect(result.mimeType).toBe('application/vnd.ms-excel');
      expect(result.sniffedMimeType).toBe('application/x-cfb');
    });

    it('rejects an executable renamed .xls', async () => {
      const result = await validateZipEntry('legacy.xls', windowsExecutable());

      expect(result.accepted).toBe(false);
    });
  });

  describe('.csv', () => {
    it('accepts text with no binary signature', async () => {
      const csv = Buffer.from('name,amount\nacme,100\n');
      const result = await validateZipEntry('rows.csv', csv);

      expect(result.accepted).toBe(true);
      expect(result.mimeType).toBe('text/csv');
    });

    it('rejects an executable renamed .csv', async () => {
      const result = await validateZipEntry('rows.csv', windowsExecutable());

      expect(result.accepted).toBe(false);
      expect(result.sniffedMimeType).toBe('application/x-msdownload');
    });

    it('rejects an unrecognised binary blob carrying NUL bytes', async () => {
      const head = Buffer.from('a,b\n1,');
      const blob = Buffer.concat([head, Buffer.from([0x00, 0x01, 0x02])]);
      const result = await validateZipEntry('rows.csv', blob);

      expect(result.accepted).toBe(false);
      expect(result.sniffedMimeType).toBeUndefined();
    });
  });

  describe('.zip', () => {
    it('marks a plain archive recursion-eligible but not accepted', async () => {
      const result = await validateZipEntry('payload.zip', plainArchive());

      expect(result.recursionEligible).toBe(true);
      expect(result.accepted).toBe(false);
    });

    it('rejects an Office package renamed .zip', async () => {
      const result = await validateZipEntry('payload.zip', realShapedXlsx());

      expect(result.recursionEligible).toBe(false);
      expect(result.accepted).toBe(false);
    });

    it('rejects an executable renamed .zip', async () => {
      const result = await validateZipEntry('payload.zip', windowsExecutable());

      expect(result.recursionEligible).toBe(false);
      expect(result.accepted).toBe(false);
    });
  });

  describe('disallowed extensions', () => {
    it('rejects .exe', async () => {
      const result = await validateZipEntry('setup.exe', windowsExecutable());

      expect(result.accepted).toBe(false);
    });

    it('rejects .txt even when the bytes are genuine text', async () => {
      const result = await validateZipEntry('notes.txt', Buffer.from('hello'));

      expect(result.accepted).toBe(false);
    });

    it('rejects a file with no extension', async () => {
      const result = await validateZipEntry('README', genuinePdf());

      expect(result.accepted).toBe(false);
    });

    it('matches the extension case-insensitively', async () => {
      const result = await validateZipEntry('REPORT.PDF', genuinePdf());

      expect(result.accepted).toBe(true);
    });
  });
});
