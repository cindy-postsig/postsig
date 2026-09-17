import {
  ImportFileError,
  MAX_IMPORT_FILE_SIZE,
  validateImportFile,
} from '@/lib/v2/employee-import/validate-file';

function fakeFile(name: string, size: number, type = ''): File {
  return { name, size, type } as File;
}

describe('validateImportFile', () => {
  it.each(['staff.csv', 'staff.xlsx', 'STAFF.XLSX'])('accepts %s', (name) => {
    expect(() => validateImportFile(fakeFile(name, 1024))).not.toThrow();
  });

  it.each(['staff.txt', 'staff.xls', 'staff.xlsm', 'staff'])(
    'rejects %s',
    (name) => {
      expect(() => validateImportFile(fakeFile(name, 1024))).toThrow(
        ImportFileError,
      );
    },
  );

  it('rejects an empty file', () => {
    expect(() => validateImportFile(fakeFile('staff.csv', 0))).toThrow(
      /empty/i,
    );
  });

  it('names the limit when the file is too large', () => {
    expect(() =>
      validateImportFile(fakeFile('staff.xlsx', MAX_IMPORT_FILE_SIZE + 1)),
    ).toThrow(/exceeds maximum of 4MB/);
  });

  // Browsers leave the type empty for some xlsx uploads.
  it('accepts an empty MIME type', () => {
    expect(() =>
      validateImportFile(fakeFile('staff.xlsx', 1024, '')),
    ).not.toThrow();
  });

  it.each([
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ])('accepts the %s MIME type', (type) => {
    expect(() =>
      validateImportFile(fakeFile('staff.xlsx', 1024, type)),
    ).not.toThrow();
  });

  it('rejects a mismatched MIME type', () => {
    expect(() =>
      validateImportFile(fakeFile('staff.xlsx', 1024, 'application/zip')),
    ).toThrow(/Invalid file type/);
  });
});
