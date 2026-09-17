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

describe('order number CSV export', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserMetadata.mockResolvedValue({});
    mockGetEffectiveDateFormat.mockResolvedValue('yyyy-MM-dd');
    mockGetReportData.mockResolvedValue({
      rows: [],
      contracts: [],
      totalValueInUSD: 0,
    });
  });

  describe('report export (exportReportCSV)', () => {
    it('adds a "Contract No." column populated from orderNumber for a standard report', async () => {
      mockGetReportData.mockResolvedValue({
        rows: [
          {
            id: '1',
            vendor: 'Acme',
            orderNumber: 'PO-123',
            isReportRow: false,
          },
        ],
        contracts: [],
        totalValueInUSD: 0,
      });

      const csv = await (await exportReportCSV([1], 'auto-renewals')).text();

      expect(csv).toContain('Contract No.');
      expect(csv).toContain('PO-123');
    });

    it('labels the column "Invoice No." for the invoice discrepancy report', async () => {
      mockGetReportData.mockResolvedValue({
        rows: [
          { id: '2', vendor: 'Acme', orderNumber: 'INV-9', isReportRow: false },
        ],
        contracts: [],
        totalValueInUSD: 0,
      });

      const csv = await (await exportReportCSV([2], 'invoices')).text();

      expect(csv).toContain('Invoice No.');
      expect(csv).toContain('INV-9');
      expect(csv).not.toContain('Contract No.');
    });
  });

  describe('invoice folder export (exportInvoiceFolderCSV)', () => {
    it('adds an "Invoice No." column from metadata.lineage.order_number', async () => {
      mockFetchContractsById.mockResolvedValue([
        {
          id: 55,
          status_id: 4,
          currency: 'usd',
          vendors: { name: 'Acme' },
          metadata: { lineage: { order_number: 'INV-555' } },
        },
      ]);
      mockGeneratePriceHistory.mockReturnValue({ currentTermStartDate: null });
      mockExtractBudget.mockReturnValue({
        currentProducts: [
          {
            product_id: 1,
            fees: 100,
            vendor_products: { name: 'Widget' },
            periodInfo: { yearWithinTerm: 1, termIndex: 0 },
          },
        ],
      });
      mockGetProductYearLabel.mockReturnValue('FY1');

      const csv = await (await exportInvoiceFolderCSV([55], 1)).text();

      expect(csv).toContain('Invoice No.');
      expect(csv).toContain('INV-555');
    });

    it('renders the literal string "null" order number as empty', async () => {
      mockFetchContractsById.mockResolvedValue([
        {
          id: 56,
          status_id: 4,
          currency: 'usd',
          vendors: { name: 'Acme' },
          metadata: { lineage: { order_number: 'null' } },
        },
      ]);
      mockGeneratePriceHistory.mockReturnValue({ currentTermStartDate: null });
      mockExtractBudget.mockReturnValue({
        currentProducts: [
          {
            product_id: 1,
            fees: 100,
            vendor_products: { name: 'Widget' },
            periodInfo: { yearWithinTerm: 1, termIndex: 0 },
          },
        ],
      });
      mockGetProductYearLabel.mockReturnValue('FY1');

      const csv = await (await exportInvoiceFolderCSV([56], 1)).text();

      expect(csv).toContain('Invoice No.');
      expect(csv).not.toContain('null');
    });
  });

  describe('bulk contracts export (exportCSV)', () => {
    beforeEach(() => {
      mockGeneratePriceHistory.mockReturnValue({ currentTermStartDate: null });
      mockExtractBudget.mockReturnValue({ currentProducts: [] });
      mockGetProductYearLabel.mockReturnValue('FY1');
    });

    it('adds a "Contract No." column from metadata.lineage.order_number', async () => {
      const csv = await (
        await exportCSV({
          fiscalYearStartMonth: 1,
          format: 'csv',
          contracts: [
            {
              id: 77,
              status_id: 4,
              currency: 'usd',
              vendors: { name: 'Acme' },
              metadata: { lineage: { order_number: 'PO-777' } },
            },
          ] as unknown as Parameters<typeof exportCSV>[0]['contracts'],
        })
      )?.text();

      expect(csv).toContain('Contract No.');
      expect(csv).toContain('PO-777');
    });

    it('escapes order numbers that would execute as spreadsheet formulas', async () => {
      const csv = await (
        await exportCSV({
          fiscalYearStartMonth: 1,
          format: 'csv',
          contracts: [
            {
              id: 78,
              status_id: 4,
              currency: 'usd',
              vendors: { name: 'Acme' },
              metadata: { lineage: { order_number: '=SUM(A1:A9)' } },
            },
          ] as unknown as Parameters<typeof exportCSV>[0]['contracts'],
        })
      )?.text();

      expect(csv).toContain("'=SUM(A1:A9)");
      expect(csv).not.toMatch(/(^|,)"=SUM/m);
    });

    it('reorders configurable columns to match columnOrder and appends rich fields', async () => {
      const csv = await (
        await exportCSV({
          fiscalYearStartMonth: 1,
          format: 'csv',
          columnOrder: ['product', 'vendor'],
          contracts: [
            {
              id: 79,
              status_id: 4,
              currency: 'usd',
              vendors: { name: 'Acme' },
              metadata: { lineage: { order_number: 'PO-79' } },
            },
          ] as unknown as Parameters<typeof exportCSV>[0]['contracts'],
        })
      )?.text();

      const header = (csv ?? '').split('\n')[0];
      // Configurable columns follow the requested order (Product before Vendor).
      expect(header.indexOf('Product Name')).toBeGreaterThan(-1);
      expect(header.indexOf('Product Name')).toBeLessThan(
        header.indexOf('Vendor'),
      );
      // Rich (non-configurable) fields are still appended.
      expect(header).toContain('Payment Terms');
      // Hidden configurable columns are dropped entirely.
      expect(header).not.toContain('Contract No.');
      expect(header).not.toContain('Current Spend');
    });
  });
});
