import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { exportMonthlyReportExcel } from '@/app/lib/actions/export-monthly-report';

jest.mock('@/data/users', () => ({
  getUserMetadata: jest.fn().mockResolvedValue({ isPostsig: true }),
  getEffectiveDateFormat: jest.fn().mockResolvedValue('MM/dd/yyyy'),
  getEffectiveBaseCurrency: jest.fn().mockResolvedValue('USD'),
}));
jest.mock('@/lib/audit', () => ({
  auditLogger: { logExportEvent: jest.fn().mockResolvedValue(undefined) },
  getUserAuditContext: jest.fn().mockResolvedValue({}),
}));

// Pins the monthly-report XLSX formatter: the export is a renderer over the
// page's engine-computed transform data (the values themselves are pinned by
// monthly-report-goldens), so this golden asserts the workbook faithfully
// serializes what the page shows — sheets, headers, and cell contents.
// Regenerate deliberately with UPDATE_GOLDENS=1; never hand-edit the JSON.
const GOLDEN_PATH = path.join(
  __dirname,
  '__goldens__',
  'monthly-report-export-goldens.json',
);

const CLOCK = new Date(2026, 6, 15);

const subRow = (over: Record<string, unknown>) => {
  const row = {
    id: '10-100',
    contractId: 10,
    name: 'Acme',
    vendor: 'Acme',
    product: 'Widget Data Feed',
    currentMonth: 1000,
    nextMonth: 1100,
    change: 100,
    tags: ['finance'],
    isSplit: false,
    supersededProducts: [],
    currentYearProducts: [],
    ...over,
  };
  // A USD org against a USD base: nothing converts, so each row displays the
  // same amounts it rolls up with.
  return {
    ...row,
    currency: 'USD',
    displayCurrentMonth: row.currentMonth,
    displayNextMonth: row.nextMonth,
    displayChange: row.change,
    // Applied last so a caller can state a different denomination.
    ...over,
  };
};

const report = {
  overview: {
    currentMonthSpend: { amount: 3456.78, label: 'Current Month Spend' },
    nextMonthSpend: {
      amount: 4000,
      change: 543.22,
      changePercent: 15.714,
      label: 'Next Month Spend',
    },
  },
  spendByBusinessGroup: [
    {
      id: 1,
      name: 'Research',
      vendors: 1,
      currentMonth: 1000,
      nextMonth: 1100,
      change: 100,
      currency: 'USD',
      displayCurrentMonth: 1000,
      displayNextMonth: 1100,
      displayChange: 100,
      subRows: [subRow({})],
    },
  ],
  spendByBusinessSponsor: [
    {
      id: 2,
      name: 'Alice',
      vendors: 2,
      currentMonth: 2456.78,
      nextMonth: 2900,
      change: 443.22,
      currency: 'USD',
      displayCurrentMonth: 2456.78,
      displayNextMonth: 2900,
      displayChange: 443.22,
      subRows: [
        subRow({
          isSplit: true,
          currentMonth: 500,
          nextMonth: 550,
          change: 50,
        }),
        subRow({
          id: '11-200',
          contractId: 11,
          vendor: 'Globex',
          product: 'Index Terminal',
          currentMonth: 1956.78,
          nextMonth: 2350,
          change: 393.22,
          tags: [],
        }),
      ],
    },
  ],
  priceChanges: [
    {
      id: 11,
      contractId: 11,
      vendor: 'Globex',
      product: 'Index Terminal',
      logo: '',
      previousPrice: 1956.78,
      newPrice: 2350,
      change: 393.22,
      reasonForChange: 'Renewal with 20.1% annual increase',
      tags: ['index'],
      currency: 'USD',
      changeBase: 393.22,
    },
    {
      id: 12,
      contractId: 12,
      vendor: 'Initech',
      product: 'Zero Base',
      logo: '',
      previousPrice: 0,
      newPrice: 100,
      change: 100,
      reasonForChange: 'New contract',
      tags: [],
      currency: 'USD',
      changeBase: 100,
    },
  ],
  upcomingRenewalsContracts: [
    {
      vendor: 'Acme',
      currentYearProducts: [{ vendor_products: { name: 'Widget Data Feed' } }],
      termEndDate: '2026-09-30',
      cancelByDate: '2026-08-01',
      currentBudget: 12000,
      projectedBudget: 13200,
      tags: [{ name: 'finance' }],
    },
    {
      vendor: 'Globex',
      product: 'Index Terminal',
      termEndDate: [{ date: '2026-10-31' }],
      cancelByDate: null,
      currentBudget: 23481.36,
      tags: [],
    },
  ],
  topVendorsBySpend: [
    { name: 'Globex', spend: 1956.78 },
    { name: 'Acme', spend: 1500 },
  ],
};

async function workbookCells(bytes: number[]) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(bytes).buffer);
  const sheets: Record<string, unknown[][]> = {};
  workbook.eachSheet((sheet) => {
    const rows: unknown[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const values = row.values as unknown[];
      rows.push(values.slice(1).map((v) => v ?? null));
    });
    sheets[sheet.name] = rows;
  });
  return sheets;
}

describe('monthly-report export goldens', () => {
  beforeAll(() => {
    // Freeze only Date: the generated-on cell reads the clock, while ExcelJS
    // streams need real timers to flush.
    jest.useFakeTimers({
      now: CLOCK,
      doNotFake: [
        'setTimeout',
        'setInterval',
        'setImmediate',
        'nextTick',
        'queueMicrotask',
      ],
    });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('serializes the report data into the pinned workbook cells', async () => {
    const capture = {
      amortized: await workbookCells(
        await exportMonthlyReportExcel(report, 'finance', 'amortized'),
      ),
      actual: await workbookCells(
        await exportMonthlyReportExcel(report, null, 'actual'),
      ),
    };

    if (process.env.UPDATE_GOLDENS) {
      writeFileSync(GOLDEN_PATH, JSON.stringify(capture, null, 2) + '\n');
    }
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
    expect(capture).toEqual(golden);
  });
});
