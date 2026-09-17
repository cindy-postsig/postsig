import { Table } from '@tanstack/react-table';
import { exportTableToCSV } from '@/utils/table-export';
import { handleDownload } from '@/app/lib/utils';

jest.mock('@/app/lib/utils', () => ({
  ...jest.requireActual('@/app/lib/utils'),
  handleDownload: jest.fn(),
}));

const mockHandleDownload = handleDownload as jest.Mock;

/** The slice of the table a context-aware header actually reads. */
interface HeaderContext {
  table: { options: { meta?: { reportType?: string } } };
}

type FakeRow = Record<string, unknown>;

/**
 * Mirrors the real column headers, which are components that read the report
 * type off the table meta to decide their title.
 */
const contextAwareHeader = ({ table }: HeaderContext) => ({
  props: {
    title:
      table.options.meta?.reportType === 'invoices-folder'
        ? 'Billing Period Start Date'
        : 'Start Date',
  },
});

function fakeTable(reportType?: string): Table<FakeRow> {
  const columns = [
    { id: 'vendor', columnDef: { header: 'Vendor' } },
    { id: 'termStartDate', columnDef: { header: contextAwareHeader } },
  ];
  const row = {
    original: { id: 1, vendor: 'Acme', termStartDate: '2025-10-01' },
    subRows: [],
    getValue: (id: string) => row.original[id as keyof typeof row.original],
  };
  // Intentionally partial: exportTableToCSV only touches these members.
  return {
    options: {
      meta: { reportType, userMetadata: { dateFormat: 'yyyy-MM-dd' } },
    },
    getVisibleLeafColumns: () => columns,
    getFilteredRowModel: () => ({ rows: [row] }),
  } as unknown as Table<FakeRow>;
}

async function capturedCsv(): Promise<string> {
  const blob = mockHandleDownload.mock.calls[0][0] as Blob;
  return blob.text();
}

describe('exportTableToCSV headers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves function headers that depend on the table context', async () => {
    await exportTableToCSV(fakeTable('invoices-folder'), 'invoices.csv');

    expect(await capturedCsv()).toContain('Billing Period Start Date');
  });

  it('falls back to the default title when the table has no report type', async () => {
    await exportTableToCSV(fakeTable(), 'budget.csv');

    const csv = await capturedCsv();
    expect(csv).toContain('Start Date');
    expect(csv).not.toContain('Billing Period Start Date');
  });
});
