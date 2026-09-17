import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { UserMetadata } from '@/constants/types';

jest.mock('@/utils/pino', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const mockSelect = jest.fn<() => unknown>();
const mockEq = jest.fn<() => unknown>();
const mockOrder = jest.fn<() => unknown>();
const mockRange = jest.fn<() => unknown>();
const mockFrom = jest.fn<() => unknown>();

jest.mock('@/utils/supabase/server', () => ({
  createClient: () => ({ from: mockFrom }),
}));

const mockGetUserMetadata = jest.fn<() => Promise<UserMetadata | null>>();
mockGetUserMetadata.mockResolvedValue({
  userId: 'user-1',
  organizationId: 'org-1',
} as UserMetadata);

jest.mock('@/data/users', () => ({
  getUserMetadata: mockGetUserMetadata,
}));

import { getChatMessages } from '@/lib/v2/chat/persistence';

const MOCK_ROWS = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1,
  session_id: 100,
  role: i % 2 === 0 ? 'user' : 'assistant',
  content: `Message ${i + 1}`,
  metadata: null,
  created_at: `2026-01-01T00:${String(i).padStart(2, '0')}:00Z`,
  chat_sessions: { user_id: 'user-1' },
}));

function setupQueryChain(
  rows: Record<string, unknown>[],
  count: number | null = null,
) {
  const result = { data: rows, error: null, count };
  mockRange.mockReturnValue(result);
  mockOrder.mockReturnValue({ ...result, range: mockRange });
  mockEq
    .mockReturnValueOnce({ eq: mockEq })
    .mockReturnValueOnce({ order: mockOrder });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ select: mockSelect });
}

describe('getChatMessages pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserMetadata.mockResolvedValue({
      userId: 'user-1',
      organizationId: 'org-1',
    } as UserMetadata);
  });

  it('returns all messages when no pagination params given', async () => {
    setupQueryChain(MOCK_ROWS);

    const result = await getChatMessages(100);

    expect(result.messages).toHaveLength(25);
    expect(result.totalCount).toBeUndefined();
    expect(mockSelect).toHaveBeenCalledWith(
      '*, chat_sessions!inner(user_id)',
      {},
    );
    expect(mockRange).not.toHaveBeenCalled();
  });

  it('applies limit and offset when pagination params given', async () => {
    const page = MOCK_ROWS.slice(10, 20);
    setupQueryChain(page, 25);

    const result = await getChatMessages(100, { limit: 10, offset: 10 });

    expect(result.messages).toHaveLength(10);
    expect(result.totalCount).toBe(25);
    expect(mockSelect).toHaveBeenCalledWith('*, chat_sessions!inner(user_id)', {
      count: 'exact',
    });
    expect(mockRange).toHaveBeenCalledWith(10, 19);
  });

  it('defaults offset to 0 when only limit is provided', async () => {
    const page = MOCK_ROWS.slice(0, 5);
    setupQueryChain(page, 25);

    const result = await getChatMessages(100, { limit: 5 });

    expect(result.messages).toHaveLength(5);
    expect(result.totalCount).toBe(25);
    expect(mockRange).toHaveBeenCalledWith(0, 4);
  });

  it('maps row fields correctly', async () => {
    setupQueryChain([MOCK_ROWS[0]]);

    const result = await getChatMessages(100);
    const msg = result.messages[0];

    expect(msg).toEqual({
      id: 1,
      session_id: 100,
      role: 'user',
      content: 'Message 1',
      metadata: null,
      created_at: '2026-01-01T00:00:00Z',
    });
  });

  it('throws when user is not authenticated', async () => {
    mockGetUserMetadata.mockResolvedValueOnce(null);

    await expect(getChatMessages(100)).rejects.toThrow(
      'User not authenticated',
    );
  });
});
