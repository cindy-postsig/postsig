const mockGetUserMetadata = jest.fn();
const mockCreateSignedUrl = jest.fn();
const mockCreateServiceClient = jest.fn();

jest.mock('@/data/users', () => ({
  getUserMetadata: (...args: unknown[]) => mockGetUserMetadata(...args),
}));

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => mockCreateServiceClient(),
}));

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// react's cache() is a passthrough outside a request scope.
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  cache: (fn: unknown) => fn,
}));

import { getContractDocuments } from '../documents';

const buildSupabase = (rows: Record<string, unknown>[]) => ({
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(async () => ({ data: rows, error: null })),
    })),
  })),
  storage: {
    from: jest.fn(() => ({ createSignedUrl: mockCreateSignedUrl })),
  },
});

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 91,
  contract_id: 400,
  file_path: 'uid/berenberg.pdf',
  type: null,
  description: null,
  created_at: null,
  ...overrides,
});

describe('getContractDocuments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserMetadata.mockResolvedValue({
      userId: 'u1',
      organizationId: 'o1',
    });
    mockCreateSignedUrl.mockImplementation(async (path: string) => ({
      data: { signedUrl: `https://signed/${path}` },
      error: null,
    }));
  });

  // Documents are translated for extraction (psk-1907), but the viewer reads
  // the uploaded original, so only file_path is ever signed.
  it('signs the uploaded original', async () => {
    mockCreateServiceClient.mockReturnValue(
      buildSupabase([row({ translated_file_path: 'uid/berenberg.en.pdf' })]),
    );

    const { documents } = await getContractDocuments(400);

    expect(documents[0]).toMatchObject({
      file_path: 'uid/berenberg.pdf',
      signedUrl: 'https://signed/uid/berenberg.pdf',
    });
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      'uid/berenberg.pdf',
      expect.any(Number),
    );
  });

  it('leaves the URL null when signing fails', async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: null,
      error: { message: 'not found' },
    });
    mockCreateServiceClient.mockReturnValue(buildSupabase([row()]));

    const { documents } = await getContractDocuments(400);

    expect(documents[0].signedUrl).toBeNull();
  });

  it('returns a null URL when the row has no file path', async () => {
    mockCreateServiceClient.mockReturnValue(
      buildSupabase([row({ file_path: null })]),
    );

    const { documents, count } = await getContractDocuments(400);

    expect(documents[0].signedUrl).toBeNull();
    expect(count).toBe(1);
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('returns nothing without a signed-in user', async () => {
    mockGetUserMetadata.mockResolvedValue(null);

    await expect(getContractDocuments(400)).resolves.toEqual({
      documents: [],
      count: 0,
    });
  });
});

export {};
