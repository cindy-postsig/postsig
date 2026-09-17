import { exportInventoryCSV } from '@/app/lib/actions/export-inventory';
import { getEffectiveDateFormat } from '@/data/users';

jest.mock('@/data/users', () => ({
  getEffectiveDateFormat: jest.fn(),
  getEffectiveBaseCurrency: jest.fn().mockResolvedValue('USD'),
}));

const mockGetEffectiveDateFormat = getEffectiveDateFormat as jest.Mock;

const inventoryItem = {
  contractId: '123',
  vendor: 'Acme',
  productName: 'Widget',
  startDate: '2026-12-31',
  endDate: '2027-01-15',
};

describe('cpm inventory export date format', () => {
  beforeEach(() => jest.clearAllMocks());

  it('formats date columns using the resolved org/user pattern (EU)', async () => {
    mockGetEffectiveDateFormat.mockResolvedValue('dd/MM/yyyy');

    const blob = await exportInventoryCSV([inventoryItem]);
    const csv = await blob.text();

    expect(csv).toContain('31/12/2026');
    expect(csv).toContain('15/01/2027');
    expect(csv).not.toContain('2026-12-31');
  });

  it('honors the ISO pattern when that is the resolved format', async () => {
    mockGetEffectiveDateFormat.mockResolvedValue('yyyy-MM-dd');

    const blob = await exportInventoryCSV([inventoryItem]);
    const csv = await blob.text();

    expect(csv).toContain('2026-12-31');
    expect(csv).toContain('2027-01-15');
  });
});
