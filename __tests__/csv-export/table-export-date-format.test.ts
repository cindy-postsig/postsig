import { exportTableToCSV } from '@/utils/table-export';
import { handleDownload } from '@/app/lib/utils';

jest.mock('@/app/lib/utils', () => ({
  ...jest.requireActual('@/app/lib/utils'),
  handleDownload: jest.fn(),
}));

const mockHandleDownload = handleDownload as jest.Mock;

interface FakeRow {
  original: Record<string, any>;
  subRows: FakeRow[];
  getValue: (id: string) => any;
}

function fakeRow(original: Record<string, any>): FakeRow {
  return {
    original,
    subRows: [],
    getValue: (id: string) => original[id],
  };
}

function fakeTable(dateFormat: string, rows: FakeRow[]) {
  const columns = [
    { id: 'vendor', columnDef: { header: 'Vendor' } },
    { id: 'termStartDate', columnDef: { header: 'Start Date' } },
    { id: 'termEndDate', columnDef: { header: 'End Date' } },
  ];
  return {
    options: { meta: { userMetadata: { dateFormat } } },
    getVisibleLeafColumns: () => columns,
    getFilteredRowModel: () => ({ rows }),
  } as any;
}

async function capturedCsv(): Promise<string> {
  const blob = mockHandleDownload.mock.calls[0][0] as Blob;
  return blob.text();
}

describe('exportTableToCSV date columns', () => {
  beforeEach(() => jest.clearAllMocks());

  const row = fakeRow({
    id: 1,
    vendor: 'Acme',
    termStartDate: '2025-10-01',
    termEndDate: '2026-09-30',
  });

  it('formats date columns with the table-resolved pattern (EU)', async () => {
    await exportTableToCSV(fakeTable('dd/MM/yyyy', [row]), 'budget.csv');

    const csv = await capturedCsv();
    expect(csv).toContain('01/10/2025');
    expect(csv).toContain('30/09/2026');
    expect(csv).not.toContain('2025-10-01');
  });

  it('honors the ISO pattern when that is the resolved format', async () => {
    await exportTableToCSV(fakeTable('yyyy-MM-dd', [row]), 'budget.csv');

    const csv = await capturedCsv();
    expect(csv).toContain('2025-10-01');
    expect(csv).toContain('2026-09-30');
  });
});
