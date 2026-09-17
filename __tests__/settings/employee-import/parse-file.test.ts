import ExcelJS from 'exceljs';
import {
  ImportParseError,
  parseCsvText,
  parseXlsxBuffer,
} from '@/lib/v2/employee-import/parse-file';

async function buildWorkbook(
  build: (workbook: ExcelJS.Workbook) => void,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

describe('parseXlsxBuffer', () => {
  it('returns dense rows that preserve Dates, numeric zero, and blanks', async () => {
    const buffer = await buildWorkbook((workbook) => {
      const sheet = workbook.addWorksheet('Tabelle1');
      sheet.addRow([
        'user 1_ldn',
        null,
        'User 1',
        'LDN',
        new Date(Date.UTC(2019, 9, 1)),
        null,
        70133,
        'Sales Trading Equities LD',
      ]);
      sheet.addRow(['user 3_ldn', null, 'User 3', 'LDN', null, null, 0, null]);
    });

    const sheet = await parseXlsxBuffer(buffer);

    expect(sheet.sheetName).toBe('Tabelle1');
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[0]).toHaveLength(sheet.columnCount);
    expect(sheet.rows[0][4]).toBeInstanceOf(Date);
    expect((sheet.rows[0][4] as Date).toISOString()).toBe(
      '2019-10-01T00:00:00.000Z',
    );
    expect(sheet.rows[0][6]).toBe(70133);
    expect(sheet.rows[0][1]).toBeNull();
    // Numeric zero must survive as 0, not collapse to null/''.
    expect(sheet.rows[1][6]).toBe(0);
  });

  it('densifies a sparse row to the full column count', async () => {
    const buffer = await buildWorkbook((workbook) => {
      const sheet = workbook.addWorksheet('Sparse');
      const row = sheet.getRow(1);
      row.getCell(1).value = 'A';
      row.getCell(30).value = 'AD';
      row.commit();
    });

    const sheet = await parseXlsxBuffer(buffer);

    expect(sheet.columnCount).toBe(30);
    expect(sheet.rows[0]).toHaveLength(30);
    expect(sheet.rows[0][0]).toBe('A');
    expect(sheet.rows[0][29]).toBe('AD');
    expect(sheet.rows[0][14]).toBeNull();
  });

  it('selects a sheet by name and defaults to the first', async () => {
    const buffer = await buildWorkbook((workbook) => {
      workbook.addWorksheet('First').addRow(['a']);
      workbook.addWorksheet('Second').addRow(['b']);
    });

    expect((await parseXlsxBuffer(buffer)).sheetName).toBe('First');
    expect((await parseXlsxBuffer(buffer, 'Second')).sheetName).toBe('Second');
    expect((await parseXlsxBuffer(buffer)).sheetNames).toEqual([
      'First',
      'Second',
    ]);
  });

  it('rejects an unknown sheet name', async () => {
    const buffer = await buildWorkbook((workbook) => {
      workbook.addWorksheet('First').addRow(['a']);
    });

    await expect(parseXlsxBuffer(buffer, 'Nope')).rejects.toThrow(
      ImportParseError,
    );
  });

  it('rejects a file that is not a workbook', async () => {
    const buffer = new TextEncoder().encode('not a workbook').buffer;
    await expect(parseXlsxBuffer(buffer as ArrayBuffer)).rejects.toThrow(
      ImportParseError,
    );
  });
});

describe('parseCsvText', () => {
  it('pads ragged rows out to the widest row', () => {
    const sheet = parseCsvText('a,b,c\nd,e\n');

    expect(sheet.columnCount).toBe(3);
    expect(sheet.rows).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', null],
    ]);
  });

  it('strips a BOM and trims values', () => {
    const sheet = parseCsvText('﻿First Name , Last Name\nAda , Lovelace');
    expect(sheet.rows[0]).toEqual(['First Name', 'Last Name']);
    expect(sheet.rows[1]).toEqual(['Ada', 'Lovelace']);
  });
});
