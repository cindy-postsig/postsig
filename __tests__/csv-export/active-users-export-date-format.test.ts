import { exportActiveUsersCSV } from '@/app/lib/actions/contract';
import { getEffectiveDateFormat } from '@/data/users';
import { fetchContractsById } from '@/app/lib/contracts/actions';

jest.mock('@/data/users', () => ({ getEffectiveDateFormat: jest.fn() }));
jest.mock('@/app/lib/contracts/actions', () => ({
  fetchContractsById: jest.fn(),
  fetchContracts: jest.fn(),
}));

const mockGetEffectiveDateFormat = getEffectiveDateFormat as jest.Mock;
const mockFetchContractsById = fetchContractsById as jest.Mock;

const users = [
  {
    name: 'Jane Doe',
    email: 'jane@example.com',
    start_date: '2025-10-01',
    leave_date: '2026-03-15',
  },
];

describe('active users export date format', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchContractsById.mockResolvedValue([
      {
        vendors: { name: 'Acme' },
        contract_types: { name: 'Subscription' },
        vendor_products_details: [],
      },
    ]);
  });

  it('formats Start Date / Leave Date columns with the resolved pattern (EU)', async () => {
    mockGetEffectiveDateFormat.mockResolvedValue('dd/MM/yyyy');

    const blob = await exportActiveUsersCSV({ id: 1, users });
    const csv = await blob!.text();

    expect(csv).toContain('01/10/2025');
    expect(csv).toContain('15/03/2026');
    expect(csv).not.toContain('2025-10-01');
  });

  it('honors the ISO pattern when that is the resolved format', async () => {
    mockGetEffectiveDateFormat.mockResolvedValue('yyyy-MM-dd');

    const blob = await exportActiveUsersCSV({ id: 1, users });
    const csv = await blob!.text();

    expect(csv).toContain('2025-10-01');
    expect(csv).toContain('2026-03-15');
  });

  it('includes Entity, Business Unit, and Team columns with their values', async () => {
    mockGetEffectiveDateFormat.mockResolvedValue('yyyy-MM-dd');

    const blob = await exportActiveUsersCSV({
      id: 1,
      users: [
        {
          name: 'Jane Doe',
          email: 'jane@example.com',
          entity: 'Acme EMEA Ltd',
          business_unit: 'Trading',
          team: 'Payments',
        },
      ],
    });
    const csv = await blob!.text();

    expect(csv).toContain('Entity');
    expect(csv).toContain('Business Unit');
    expect(csv).toContain('Team');
    expect(csv).toContain('Acme EMEA Ltd');
    expect(csv).toContain('Trading');
    expect(csv).toContain('Payments');
  });
});
