import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
};
jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: mockLogger,
}));

jest.mock('unzipper', () => ({
  Open: {
    buffer: jest.fn(),
  },
}));

// `file-type` is ESM-only with no CJS entry point, which this runner cannot
// resolve. Mock the thin wrapper - the repo's single integration point - and
// sniff the fixture signatures directly, so an entry is judged on its bytes
// exactly as in production.
jest.mock('@/utils/file-type', () => ({
  __esModule: true,
  detectFileType: jest.fn(async (buffer: Uint8Array) => {
    const bytes = Buffer.from(buffer);
    if (bytes.subarray(0, 5).toString() === '%PDF-')
      return { mime: 'application/pdf', ext: 'pdf' };
    if (bytes[0] === 0x4d && bytes[1] === 0x5a)
      return { mime: 'application/x-msdownload', ext: 'exe' };
    if (bytes.subarray(0, 4).toString('hex') === '504b0304')
      return { mime: 'application/zip', ext: 'zip' };
    if (bytes.subarray(0, 4).toString('hex') === '89504e47')
      return { mime: 'image/png', ext: 'png' };
    return undefined;
  }),
}));

import { extractZipFiles, MAX_ZIP_DEPTH } from '../zip';
const unzipper = require('unzipper');

interface MockEntry {
  path: string;
  type: string;
  content: number[];
}

/** Bytes that sniff as their extension claims. */
const PDF_BYTES = [...Buffer.from('%PDF-1.4\ntrailer\n<<>>\n%%EOF\n')];
const CSV_BYTES = [...Buffer.from('name,amount\nacme,100\n')];
const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ZIP_BYTES = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00];
/** An MZ/PE executable: the shape the pen test smuggled through. */
const EXE_BYTES = [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00];

function makeMockFile(entry: MockEntry) {
  return {
    path: entry.path,
    type: entry.type,
    buffer: jest
      .fn<() => Promise<Buffer>>()
      .mockResolvedValue(Buffer.from(entry.content)),
  };
}

function mockZipDirectory(files: MockEntry[]) {
  (unzipper.Open.buffer as ReturnType<typeof jest.fn>).mockResolvedValue({
    files: files.map(makeMockFile),
  });
}

/**
 * Queue one directory per `extractZipFiles` call.
 *
 * Validating a `.zip` entry also opens it, to tell a plain archive from an
 * Office package, so a nested entry costs one extra `Open.buffer` call before
 * its recursion. Those probes are served an empty directory - no OOXML marker
 * - which is exactly what keeps the entry recursion-eligible.
 */
function mockZipDirectorySequence(calls: MockEntry[][]) {
  const mock = unzipper.Open.buffer as ReturnType<typeof jest.fn>;
  const queue = calls.map((files) => ({ files: files.map(makeMockFile) }));
  let next = 0;
  let pendingProbe = false;

  mock.mockImplementation(async () => {
    if (pendingProbe) {
      pendingProbe = false;
      return { files: [] };
    }
    const directory = queue[next++] ?? { files: [] };
    pendingProbe = directory.files.some((f) => f.path.endsWith('.zip'));
    return directory;
  });
}

describe('extractZipFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should extract supported files from a flat zip', async () => {
    mockZipDirectory([
      { path: 'doc.pdf', type: 'File', content: PDF_BYTES },
      { path: 'data.csv', type: 'File', content: CSV_BYTES },
    ]);

    const result = await extractZipFiles(
      Buffer.from([]),
      '/base',
      'archive.zip',
    );

    expect(result).toHaveLength(2);
    expect(result[0].fileName).toBe('doc.pdf');
    expect(result[0].fileType).toBe('application/pdf');
    expect(result[0].filePath).toBe('/base/archive/doc.pdf');
    expect(result[1].fileName).toBe('data.csv');
    expect(result[1].fileType).toBe('text/csv');
  });

  it('should skip unsupported file types', async () => {
    mockZipDirectory([
      { path: 'photo.png', type: 'File', content: PNG_BYTES },
      { path: 'doc.pdf', type: 'File', content: PDF_BYTES },
    ]);

    const result = await extractZipFiles(
      Buffer.from([]),
      '/base',
      'archive.zip',
    );

    expect(result).toHaveLength(1);
    expect(result[0].fileName).toBe('doc.pdf');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      {
        fileName: 'photo.png',
        fileType: 'image/png',
        sniffedFileType: 'image/png',
      },
      'Skipping unsupported file type extracted from ZIP',
    );
  });

  it('should skip directories and __MACOSX entries', async () => {
    mockZipDirectory([
      { path: 'subdir/', type: 'Directory', content: [] },
      { path: '__MACOSX/._doc.pdf', type: 'File', content: PDF_BYTES },
      { path: 'real.pdf', type: 'File', content: PDF_BYTES },
    ]);

    const result = await extractZipFiles(
      Buffer.from([]),
      '/base',
      'archive.zip',
    );

    expect(result).toHaveLength(1);
    expect(result[0].fileName).toBe('real.pdf');
  });

  it('should skip empty files', async () => {
    mockZipDirectory([
      { path: 'empty.pdf', type: 'File', content: [] },
      { path: 'valid.pdf', type: 'File', content: PDF_BYTES },
    ]);

    const result = await extractZipFiles(
      Buffer.from([]),
      '/base',
      'archive.zip',
    );

    expect(result).toHaveLength(1);
    expect(result[0].fileName).toBe('valid.pdf');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { fileName: 'empty.pdf' },
      'Skipping empty file in ZIP',
    );
  });

  it('should skip hidden files', async () => {
    mockZipDirectory([
      { path: '.hidden', type: 'File', content: [1, 2] },
      { path: 'visible.pdf', type: 'File', content: PDF_BYTES },
    ]);

    const result = await extractZipFiles(
      Buffer.from([]),
      '/base',
      'archive.zip',
    );

    expect(result).toHaveLength(1);
    expect(result[0].fileName).toBe('visible.pdf');
  });
});

describe('extractZipFiles nested zip extraction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should recurse into nested zip files', async () => {
    mockZipDirectorySequence([
      [
        { path: 'inner.zip', type: 'File', content: ZIP_BYTES },
        { path: 'top-level.pdf', type: 'File', content: PDF_BYTES },
      ],
      [{ path: 'nested-doc.pdf', type: 'File', content: PDF_BYTES }],
    ]);

    const result = await extractZipFiles(Buffer.from([]), '/base', 'outer.zip');

    expect(result).toHaveLength(2);
    expect(result[0].fileName).toBe('nested-doc.pdf');
    expect(result[0].filePath).toBe('/base/outer/inner/nested-doc.pdf');
    expect(result[1].fileName).toBe('top-level.pdf');
    expect(result[1].filePath).toBe('/base/outer/top-level.pdf');
    // Two extractions plus one marker probe on inner.zip, which validation
    // opens to tell a plain archive from an Office package.
    expect(unzipper.Open.buffer).toHaveBeenCalledTimes(3);
  });

  it('should stop at MAX_ZIP_DEPTH', async () => {
    mockZipDirectory([{ path: 'deep.zip', type: 'File', content: ZIP_BYTES }]);

    const result = await extractZipFiles(
      Buffer.from([]),
      '/base',
      'archive.zip',
      MAX_ZIP_DEPTH,
    );

    expect(result).toHaveLength(0);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { zipFileName: 'archive.zip', depth: MAX_ZIP_DEPTH },
      'Max ZIP nesting depth reached, skipping',
    );
    expect(unzipper.Open.buffer).not.toHaveBeenCalled();
  });

  it('should handle three levels of nesting', async () => {
    mockZipDirectorySequence([
      [{ path: 'level1.zip', type: 'File', content: ZIP_BYTES }],
      [{ path: 'level2.zip', type: 'File', content: ZIP_BYTES }],
      [{ path: 'deepest.pdf', type: 'File', content: PDF_BYTES }],
    ]);

    const result = await extractZipFiles(Buffer.from([]), '/base', 'top.zip');

    expect(result).toHaveLength(1);
    expect(result[0].fileName).toBe('deepest.pdf');
    expect(result[0].filePath).toBe('/base/top/level1/level2/deepest.pdf');
    // Three extractions plus one marker probe per nested archive.
    expect(unzipper.Open.buffer).toHaveBeenCalledTimes(5);
  });

  it('should not include zip files themselves in output', async () => {
    mockZipDirectorySequence([
      [{ path: 'inner.zip', type: 'File', content: ZIP_BYTES }],
      [{ path: 'doc.pdf', type: 'File', content: PDF_BYTES }],
    ]);

    const result = await extractZipFiles(Buffer.from([]), '/base', 'outer.zip');

    const zipResults = result.filter((f) => f.fileType === 'application/zip');
    expect(zipResults).toHaveLength(0);
    expect(result).toHaveLength(1);
    expect(result[0].fileName).toBe('doc.pdf');
  });

  describe('content validation', () => {
    it('drops an executable disguised as a PDF', async () => {
      mockZipDirectory([
        { path: 'report.pdf', type: 'File', content: EXE_BYTES },
      ]);

      const result = await extractZipFiles(
        Buffer.from([]),
        '/base',
        'archive.zip',
      );

      expect(result).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        {
          fileName: 'report.pdf',
          fileType: 'application/pdf',
          sniffedFileType: 'application/x-msdownload',
        },
        'Skipping unsupported file type extracted from ZIP',
      );
    });

    it('extracts exactly one file from a mixed archive', async () => {
      mockZipDirectory([
        { path: 'genuine.pdf', type: 'File', content: PDF_BYTES },
        { path: 'spoofed.pdf', type: 'File', content: EXE_BYTES },
      ]);

      const result = await extractZipFiles(
        Buffer.from([]),
        '/base',
        'archive.zip',
      );

      expect(result).toHaveLength(1);
      expect(result[0].fileName).toBe('genuine.pdf');
    });

    // A spoofed .pdf is now absent rather than extracted, so it no longer
    // reaches the caller's non-PDF branch and no longer produces a failed
    // contracts row. This behaviour change is intended.
    it('does not hand a spoofed PDF to the caller as a non-PDF file', async () => {
      mockZipDirectory([
        { path: 'spoofed.pdf', type: 'File', content: EXE_BYTES },
      ]);

      const result = await extractZipFiles(
        Buffer.from([]),
        '/base',
        'archive.zip',
      );

      expect(
        result.filter((f) => f.fileType !== 'application/pdf'),
      ).toHaveLength(0);
    });

    it('does not recurse into a .zip whose bytes are not an archive', async () => {
      mockZipDirectory([
        { path: 'payload.zip', type: 'File', content: EXE_BYTES },
      ]);

      const result = await extractZipFiles(
        Buffer.from([]),
        '/base',
        'archive.zip',
      );

      expect(result).toEqual([]);
      expect(unzipper.Open.buffer).toHaveBeenCalledTimes(1);
    });
  });
});
