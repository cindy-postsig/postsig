/**
 * Product column of the report CSV export.
 *
 * The UI collapses a multi-product contract to "Name +N"; the export used to
 * write only that first name, dropping the rest. These pin the whole list, and
 * the order of the sources it is read from.
 */
import { parse } from 'csv-parse/sync';
import { exportReportCSV } from '@/app/lib/actions/export-report';
import { getReportData } from '@/lib/v2/reports/service';
import { getEffectiveDateFormat } from '@/data/users';

jest.mock('@/lib/v2/reports/service', () => ({
  getReportData: jest.fn(),
}));

jest.mock('@/data/users', () => ({
  getUserMetadata: jest.fn(),
  getEffectiveDateFormat: jest.fn(),
}));

const mockGetReportData = getReportData as jest.Mock;
const mockGetEffectiveDateFormat = getEffectiveDateFormat as jest.Mock;

const named = (name: string, extra: Record<string, unknown> = {}) => ({
  vendor_products: { id: name.length, name },
  ...extra,
});

/** The Product cell of the single exported data row. */
async function productCell(
  row: Record<string, unknown>,
  reportType = 'auto-renewals',
): Promise<string> {
  mockGetReportData.mockResolvedValue({
    rows: [{ id: '101', contract_id: '101', vendor: 'Acme', ...row }],
    contracts: [],
    totalValueInUSD: 0,
  });

  const csv = await (await exportReportCSV([101], reportType)).text();
  const [headers, dataRow] = parse(csv, {
    relaxColumnCount: true,
  }) as string[][];

  const index = headers.indexOf('Product');
  expect(index).toBeGreaterThan(-1);
  return dataRow[index];
}

describe('report CSV export — Product column (PSK-1978)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEffectiveDateFormat.mockResolvedValue('yyyy-MM-dd');
  });

  it('lists every product of a multi-product contract, not just the first', async () => {
    const cell = await productCell({
      currentYearProducts: [named('Playwright'), named('Projects')],
    });

    expect(cell).toBe('Playwright, Projects');
  });

  it.each(['dora', 'contract-omissions', 'unexecuted', 'all-renewals'])(
    'lists every product on the %s report',
    async (reportType) => {
      const cell = await productCell(
        { currentYearProducts: [named('Playwright'), named('Projects')] },
        reportType,
      );

      expect(cell).toBe('Playwright, Projects');
    },
  );

  it('leaves a single-product contract unchanged', async () => {
    const cell = await productCell({
      currentYearProducts: [named('Product1')],
    });

    expect(cell).toBe('Product1');
  });

  it('renders an empty cell when the contract has no products', async () => {
    const cell = await productCell({ currentYearProducts: [] });

    expect(cell).toBe('');
  });

  it('prefers the current-year products over the whole-term product list', async () => {
    const cell = await productCell({
      currentYearProducts: [named('Playwright')],
      product: [named('Playwright'), named('Retired')],
    });

    expect(cell).toBe('Playwright');
  });

  it('de-dupes products repeated across term years', async () => {
    const cell = await productCell({
      product: [
        named('Playwright', { year: 1 }),
        named('Playwright', { year: 2 }),
        named('Projects', { year: 1 }),
      ],
    });

    expect(cell).toBe('Playwright, Projects');
  });

  // A row whose active period resolved empty carries only currentProducts. A
  // name from the wrong period still beats a blank cell.
  it('falls back to currentProducts when the current year and term lists are empty', async () => {
    const cell = await productCell({
      currentYearProducts: [],
      product: [],
      currentProducts: [named('Playwright'), named('Projects')],
    });

    expect(cell).toBe('Playwright, Projects');
  });

  it('reads products carrying a flat name instead of vendor_products', async () => {
    const cell = await productCell({
      product: [{ name: 'Playwright' }, { name: 'Projects' }],
    });

    expect(cell).toBe('Playwright, Projects');
  });
});
