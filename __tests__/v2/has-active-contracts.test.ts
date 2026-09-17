import { hasActiveContracts } from '@/lib/v2/contracts/service';
import { fetchContractsBase } from '@/app/lib/contracts/actions';

jest.mock('@/app/lib/contracts/actions', () => ({
  fetchContractsBase: jest.fn(),
}));

const mockFetchContractsBase = fetchContractsBase as jest.Mock;

const published = { id: 1, status_id: 4, ai_extraction_status: 'complete' };
const unpublished = { id: 2, status_id: 1, ai_extraction_status: 'complete' };
const failed = { id: 3, status_id: 4, ai_extraction_status: 'ai_failed' };

describe('hasActiveContracts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is false when the org has no contracts', async () => {
    mockFetchContractsBase.mockResolvedValue([]);
    await expect(hasActiveContracts()).resolves.toBe(false);
  });

  it('is true when the org has a published contract', async () => {
    mockFetchContractsBase.mockResolvedValue([published]);
    await expect(hasActiveContracts()).resolves.toBe(true);
  });

  it('is false when the only contracts are unpublished or AI-failed', async () => {
    mockFetchContractsBase.mockResolvedValue([unpublished, failed]);
    await expect(hasActiveContracts()).resolves.toBe(false);
  });
});
