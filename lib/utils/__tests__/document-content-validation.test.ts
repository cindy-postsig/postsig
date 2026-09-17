import { describe, expect, it, jest } from '@jest/globals';

// `file-type` and its tokenizer dependencies are ESM-only with no CJS entry
// point, which this CJS Jest runner cannot resolve. The thin wrapper is the
// repo's single integration point with it, so it is mocked here and the sniff
// results below are the values the real file-type@21.3.x returns for these
// exact inputs, measured directly rather than assumed.
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

import { validateDocumentContent } from '../document-content-validation';

/** Register what the real file-type returns for a fixture's exact bytes. */
function sniffsAs(buffer: Buffer, mime: string | undefined): Uint8Array {
  SNIFFS.push([buffer.toString('base64'), mime]);
  return new Uint8Array(buffer);
}

const PDF_MIME = 'application/pdf';
const XLS_MIME = 'application/vnd.ms-excel';
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CSV_MIME = 'text/csv';

function genuinePdf(): Uint8Array {
  return sniffsAs(
    Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'),
    PDF_MIME,
  );
}

function windowsExecutable(): Uint8Array {
  const buf = Buffer.alloc(256);
  buf.write('MZ', 0);
  buf.writeUInt32LE(0x80, 0x3c);
  buf.write('PE\0\0', 0x80);
  return sniffsAs(buf, 'application/x-msdownload');
}

function cfbDocument(): Uint8Array {
  const signature = Buffer.from([
    0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
  ]);
  return sniffsAs(
    Buffer.concat([signature, Buffer.alloc(1024)]),
    'application/x-cfb',
  );
}

function workbookBytes(): Uint8Array {
  return sniffsAs(Buffer.from('PK workbook'), XLSX_MIME);
}

describe('validateDocumentContent', () => {
  describe('declared application/pdf', () => {
    it('accepts a genuine PDF', async () => {
      const result = await validateDocumentContent(PDF_MIME, genuinePdf());

      expect(result.accepted).toBe(true);
    });

    it('rejects an executable declared as a PDF', async () => {
      const result = await validateDocumentContent(
        PDF_MIME,
        windowsExecutable(),
      );

      expect(result.accepted).toBe(false);
      expect(result.sniffedMimeType).toBe('application/x-msdownload');
    });

    it('rejects a spreadsheet declared as a PDF', async () => {
      const result = await validateDocumentContent(PDF_MIME, workbookBytes());

      expect(result.accepted).toBe(false);
    });
  });

  describe('declared spreadsheet types', () => {
    it('accepts a workbook declared as xlsx', async () => {
      const result = await validateDocumentContent(XLSX_MIME, workbookBytes());

      expect(result.accepted).toBe(true);
    });

    it('accepts a CFB document declared as xls', async () => {
      const result = await validateDocumentContent(XLS_MIME, cfbDocument());

      expect(result.accepted).toBe(true);
    });

    it('rejects an executable declared as xlsx', async () => {
      const result = await validateDocumentContent(
        XLSX_MIME,
        windowsExecutable(),
      );

      expect(result.accepted).toBe(false);
    });
  });

  describe('declared text/csv', () => {
    it('accepts text with no binary signature', async () => {
      const csv = sniffsAs(Buffer.from('name,amount\nacme,100\n'), undefined);
      const result = await validateDocumentContent(CSV_MIME, csv);

      expect(result.accepted).toBe(true);
    });

    it('rejects an executable declared as CSV', async () => {
      const result = await validateDocumentContent(
        CSV_MIME,
        windowsExecutable(),
      );

      expect(result.accepted).toBe(false);
    });

    it('rejects an unrecognised blob carrying NUL bytes', async () => {
      const blob = sniffsAs(
        Buffer.from([0x61, 0x2c, 0x62, 0x0a, 0x00, 0x01]),
        undefined,
      );
      const result = await validateDocumentContent(CSV_MIME, blob);

      expect(result.accepted).toBe(false);
    });
  });

  describe('declared types outside the allowlist', () => {
    it('rejects an executable declared as itself', async () => {
      const result = await validateDocumentContent(
        'application/x-msdownload',
        windowsExecutable(),
      );

      expect(result.accepted).toBe(false);
    });

    it('rejects a genuine PDF declared as plain text', async () => {
      const result = await validateDocumentContent('text/plain', genuinePdf());

      expect(result.accepted).toBe(false);
    });
  });
});
