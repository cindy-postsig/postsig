jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockGetUserMetadata = jest.fn<Promise<unknown>, []>();
jest.mock('@/data/users', () => ({
  getUserMetadata: () => mockGetUserMetadata(),
}));

const mockGetBusinessGroupNodes = jest.fn<Promise<unknown>, unknown[]>();
jest.mock('@/lib/v2/org-units', () => ({
  getBusinessGroupNodes: (...args: unknown[]) =>
    mockGetBusinessGroupNodes(...args),
}));

import { getOrgBusinessGroupNodes } from '@/data/superuser/org-units';
import { AuthorizationError } from '@/lib/errors';

const NODES = [{ id: 1, name: 'Ops' }];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUserMetadata.mockResolvedValue({ organizationId: 'org-1' });
  mockGetBusinessGroupNodes.mockResolvedValue(NODES);
});

describe('getOrgBusinessGroupNodes', () => {
  it('rejects without a session organization', async () => {
    mockGetUserMetadata.mockResolvedValue(null);
    await expect(getOrgBusinessGroupNodes()).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(mockGetBusinessGroupNodes).not.toHaveBeenCalled();
  });

  it('loads nodes for the session organization only', async () => {
    await expect(getOrgBusinessGroupNodes()).resolves.toEqual(NODES);
    expect(mockGetBusinessGroupNodes).toHaveBeenCalledWith('org-1');
  });
});
