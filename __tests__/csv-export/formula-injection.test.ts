import ExcelJS from 'exceljs';
import { escapeSpreadsheetCell, csvField } from '@/lib/csv-export/escape';
import { stringifyCsv } from '@/lib/csv-export/stringify';
import { exportInventoryCSV } from '@/app/lib/actions/export-inventory';
import { exportReportCSV } from '@/app/lib/actions/export-report';
import { exportCompanyCSV } from '@/app/lib/actions/investor/export';
import { getReportData } from '@/lib/v2/reports/service';

jest.mock('@/data/users', () => ({
  getUserMetadata: jest.fn().mockResolvedValue({ isPostsig: true }),
  getEffectiveDateFormat: jest.fn().mockResolvedValue('yyyy-MM-dd'),
  getEffectiveBaseCurrency: jest.fn().mockResolvedValue('USD'),
}));
jest.mock('@/lib/v2/reports/service', () => ({ getReportData: jest.fn() }));
jest.mock('@/lib/csv-export/assert-export', () => ({
  assertCsvExportAllowed: jest.fn(),
}));
jest.mock('@/lib/audit', () => ({
  auditLogger: { logExportEvent: jest.fn().mockResolvedValue(undefined) },
  getUserAuditContext: jest.fn().mockResolvedValue({}),
}));

const mockGetReportData = getReportData as jest.Mock;

// The payloads the pen test used, plus the other triggers Excel acts on.
const PAYLOADS = [
  '=1+1',
  '=HYPERLINK("http://evil.example","click")',
  '+1+1',
  '-1+1',
  '@SUM(A1)',
  '\t=1+1',
  '\r=1+1',
];

describe('escapeSpreadsheetCell', () => {
  it.each(PAYLOADS)('prefixes %j so it is rendered as text', (payload) => {
    expect(escapeSpreadsheetCell(payload)).toBe(`'${payload}`);
  });

  it('leaves ordinary values untouched', () => {
    expect(escapeSpreadsheetCell('PO-123')).toBe('PO-123');
    expect(escapeSpreadsheetCell('')).toBe('');
    expect(escapeSpreadsheetCell('Acme = Widgets')).toBe('Acme = Widgets');
  });

  // Prefixing these would turn every negative amount in every export into
  // left-aligned text that no longer sums.
  it.each(['-1', '-1234.56', '+3', '1e-9', '-.5'])(
    'leaves the numeric literal %j alone',
    (value) => {
      expect(escapeSpreadsheetCell(value)).toBe(value);
    },
  );
});

describe('csvField', () => {
  it('quotes, escapes the formula and doubles embedded quotes', () => {
    expect(csvField('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  });

  it('renders null and undefined as an empty field', () => {
    expect(csvField(null)).toBe('""');
    expect(csvField(undefined)).toBe('""');
  });

  it('keeps a value from breaking out of its cell', () => {
    expect(csvField('a","b')).toBe('"a"",""b"');
  });
});

describe('stringifyCsv', () => {
  it('escapes every string cell, not just the first column', () => {
    const csv = stringifyCsv([['=1+1', 'ok', '@cmd']], { quoted: true });
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'@cmd");
    expect(csv).not.toMatch(/"=1\+1"/);
  });

  it('leaves numbers alone', () => {
    expect(stringifyCsv([[-12.5, '-12.5']])).toBe('-12.5,-12.5\n');
  });
});

describe('export surfaces', () => {
  beforeEach(() => jest.clearAllMocks());

  it('escapes a formula-style group name in the inventory CSV', async () => {
    const csv = await (
      await exportInventoryCSV(
        [{ vendor: 'Acme', businessGroup: '=1+1', product: 'Widget' }],
        ['vendor', 'businessGroup', 'product'],
      )
    ).text();

    expect(csv).toContain("'=1+1");
    expect(csv).not.toContain('"=1+1"');
  });

  it('escapes a formula-style group name in a report CSV', async () => {
    mockGetReportData.mockResolvedValue({
      rows: [
        {
          id: '1',
          vendor: '=HYPERLINK("http://evil.example","click")',
          isReportRow: false,
        },
      ],
      contracts: [],
      totalValueInUSD: 0,
    });

    const csv = await (await exportReportCSV([1], 'auto-renewals')).text();

    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain('"=HYPERLINK');
  });

  it('escapes formula-style company fields in the investor company CSV', async () => {
    const csv = await exportCompanyCSV({
      id: 1,
      name: '=1+1',
      stage: '@cmd',
      fund: 'Fund I',
      industry: 'SaaS',
      headquarters: 'NYC',
      entityType: 'C-Corp',
      corporateJurisdiction: 'DE',
      foundedYear: 2020,
      companyUrl: 'https://acme.example',
      postMoneyValuation: 1000,
      totalEquityFinancing: 1000,
      currentPricePerUnit: 1,
      lastTransactionDate: null,
      myTotalFMV: 1,
      myAggregateCost: 1,
      impliedValue: 1,
      multiple: null,
      myFullyDilutedPercent: null,
      myEntryDate: null,
      stageAtEntry: 'Seed',
      myEntryCost: 1,
    } as unknown as Parameters<typeof exportCompanyCSV>[0]);

    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"\'@cmd"');
  });
});

describe('xlsx exports', () => {
  // exceljs types a plain JS string as a string cell, so a formula-style value
  // is written as shared-string text and never as an <f> formula element.
  // This pins that, since the xlsx exports rely on it instead of prefixing.
  it('writes a formula-style string as text, not a formula', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(['=1+1', '=HYPERLINK("http://evil.example")']);

    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    const reread = new ExcelJS.Workbook();
    await reread.xlsx.load(bytes.buffer);
    const row = reread.getWorksheet('Sheet1')!.getRow(1);

    expect(row.getCell(1).type).toBe(ExcelJS.ValueType.String);
    expect(row.getCell(1).formula).toBeUndefined();
    expect(row.getCell(2).type).toBe(ExcelJS.ValueType.String);
    expect(row.getCell(2).formula).toBeUndefined();
  });
});
