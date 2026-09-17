import {
  exportReportCSV,
  exportInvoiceFolderCSV,
} from '@/app/lib/actions/export-report';
import { exportCSV } from '@/app/lib/actions/contract';
import { getUserMetadata, getEffectiveDateFormat } from '@/data/users';
import { fetchContractsById } from '@/app/lib/contracts/actions';
import { getReportData } from '@/lib/v2/reports/service';
import {
  generatePriceHistory,
  extractBudgetFromPriceHistory,
  getProductYearLabel,
} from '@/app/lib/budget';

jest.mock('@/data/users', () => ({
  getUserMetadata: jest.fn(),
  getEffectiveDateFormat: jest.fn(),
  getEffectiveBaseCurrency: jest.fn().mockResolvedValue('USD'),
}));
jest.mock('@/app/lib/contracts/actions', () => ({
  fetchContractsById: jest.fn(),
}));
jest.mock('@/lib/v2/reports/service', () => ({
  getReportData: jest.fn(),
}));
jest.mock('@/app/lib/budget', () => ({
  generatePriceHistory: jest.fn(),
  extractBudgetFromPriceHistory: jest.fn(),
  getProductYearLabel: jest.fn(),
}));
jest.mock('@/lib/csv-export/assert-export', () => ({
  assertCsvExportAllowed: jest.fn(),
}));

const mockGetUserMetadata = getUserMetadata as jest.Mock;
const mockGetEffectiveDateFormat = getEffectiveDateFormat as jest.Mock;
const mockFetchContractsById = fetchContractsById as jest.Mock;
const mockGetReportData = getReportData as jest.Mock;
const mockGeneratePriceHistory = generatePriceHistory as jest.Mock;
const mockExtractBudget = extractBudgetFromPriceHistory as jest.Mock;
const mockGetProductYearLabel = getProductYearLabel as jest.Mock;

/** All CSV fields are emitted quoted, so headers match on the quoted literal. */
function headerRow(csv: string): string {
  return csv.split('\n')[0] ?? '';
}

const INVOICE_TYPE_ID = 6;

describe('invoice CSV column headers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserMetadata.mockResolvedValue({});
    mockGetEffectiveDateFormat.mockResolvedValue('yyyy-MM-dd');
    mockGetReportData.mockResolvedValue({
      rows: [],
      contracts: [],
      totalValueInUSD: 0,
    });
    mockGeneratePriceHistory.mockReturnValue({ currentTermStartDate: null });
    mockExtractBudget.mockReturnValue({ currentProducts: [] });
    mockGetProductYearLabel.mockReturnValue('FY1');
  });

  describe('invoice discrepancy report (exportReportCSV)', () => {
    beforeEach(() => {
      mockGetReportData.mockResolvedValue({
        rows: [{ id: '1', vendor: 'Acme', isReportRow: false }],
        contracts: [],
        totalValueInUSD: 0,
      });
    });

    it('labels the term dates as billing period dates', async () => {
      const csv = await (await exportReportCSV([1], 'invoices')).text();
      const header = headerRow(csv);

      expect(header).toContain('"Billing Period Start Date"');
      expect(header).toContain('"Billing Period End Date"');
      expect(header).not.toContain('"Start Date"');
      expect(header).not.toContain('"End Date"');
    });

    it('leaves the term date labels alone on non-invoice reports', async () => {
      const csv = await (await exportReportCSV([1], 'auto-renewals')).text();
      const header = headerRow(csv);

      expect(header).toContain('"Start Date"');
      expect(header).toContain('"End Date"');
      expect(header).not.toContain('"Billing Period Start Date"');
    });
  });

  describe('invoices folder export (exportInvoiceFolderCSV)', () => {
    it('exports invoice date and billing period dates', async () => {
      mockFetchContractsById.mockResolvedValue([
        {
          id: 55,
          status_id: 4,
          currency: 'usd',
          execution_date: '2026-03-14',
          vendors: { name: 'Acme' },
          term_end_date: [{ date: '2026-06-30' }],
        },
      ]);
      mockExtractBudget.mockReturnValue({
        currentProducts: [
          {
            product_id: 1,
            fees: 100,
            startDate: '2026-04-01',
            vendor_products: { name: 'Widget' },
            periodInfo: { yearWithinTerm: 1, termIndex: 0 },
          },
        ],
      });

      const csv = await (await exportInvoiceFolderCSV([55], 1)).text();
      const header = headerRow(csv);

      expect(header).toContain('"Invoice Date"');
      expect(header).toContain('"Billing Period Start Date"');
      expect(header).toContain('"Billing Period End Date"');
      expect(header).not.toContain('"Due Date"');

      expect(csv).toContain('"2026-03-14"');
      expect(csv).toContain('"2026-04-01"');
      expect(csv).toContain('"2026-06-30"');
    });
  });

  describe('contract export (exportCSV)', () => {
    const ACTIVE = 4;
    const ARCHIVED = 5;

    const buildContract = ([typeId, statusId]: [number, number]) => ({
      id: 77,
      type_id: typeId,
      status_id: statusId,
      currency: 'usd',
      vendors: { name: 'Acme' },
    });

    const exportContracts = async (contracts: [number, number][]) =>
      (
        await exportCSV({
          fiscalYearStartMonth: 1,
          format: 'csv',
          contracts: contracts.map(buildContract) as unknown as Parameters<
            typeof exportCSV
          >[0]['contracts'],
        })
      )?.text() ?? '';

    it('uses invoice labels when every exported contract is an invoice', async () => {
      const header = headerRow(
        await exportContracts([[INVOICE_TYPE_ID, ACTIVE]]),
      );

      expect(header).toContain('"Invoice Date"');
      expect(header).toContain('"Billing Period Start Date"');
      expect(header).toContain('"Billing Period End Date"');
      expect(header).not.toContain('"Execution Date"');
      expect(header).not.toContain('"Term Start Date"');
      expect(header).not.toContain('"Term End Date"');
    });

    it('keeps contract labels for non-invoice contracts', async () => {
      const header = headerRow(await exportContracts([[1, ACTIVE]]));

      expect(header).toContain('"Execution Date"');
      expect(header).toContain('"Term Start Date"');
      expect(header).toContain('"Term End Date"');
      expect(header).not.toContain('"Invoice Date"');
    });

    it('keeps contract labels when invoices are mixed with other types', async () => {
      const header = headerRow(
        await exportContracts([
          [INVOICE_TYPE_ID, ACTIVE],
          [1, ACTIVE],
        ]),
      );

      expect(header).toContain('"Execution Date"');
      expect(header).not.toContain('"Invoice Date"');
    });

    it('ignores contracts that the status filter drops from the export', async () => {
      const header = headerRow(
        await exportContracts([
          [INVOICE_TYPE_ID, ACTIVE],
          [1, ARCHIVED],
        ]),
      );

      expect(header).toContain('"Invoice Date"');
      expect(header).not.toContain('"Execution Date"');
    });

    it('keeps contract labels when nothing survives the status filter', async () => {
      const header = headerRow(
        await exportContracts([[INVOICE_TYPE_ID, ARCHIVED]]),
      );

      expect(header).toContain('"Execution Date"');
      expect(header).not.toContain('"Invoice Date"');
    });
  });
});
