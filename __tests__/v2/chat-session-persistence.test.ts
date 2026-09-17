import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { UIMessage } from 'ai';
import type { UserMetadata } from '@/constants/types';

jest.mock('@/utils/pino', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const mockFrom = jest.fn<(table: string) => unknown>();

jest.mock('@/utils/supabase/server', () => ({
  createClient: () => ({ from: mockFrom }),
}));

const mockGetUserMetadata = jest.fn<() => Promise<UserMetadata | null>>();

jest.mock('@/data/users', () => ({
  getUserMetadata: mockGetUserMetadata,
}));

import {
  getChatSession,
  partitionStoredTurn,
  saveAssistantMessage,
} from '@/lib/v2/chat/persistence';
import type { ChatMessage } from '@/lib/v2/chat/persistence';

const SESSION_ROW = {
  id: 7,
  organization_id: 'org-1',
  user_id: 'user-1',
  title: 'Spend questions',
  created_at: '2026-09-11T00:00:00Z',
  updated_at: '2026-09-11T00:05:00Z',
};

function mockSessionLookup(result: { data: unknown; error: unknown }) {
  const maybeSingle = jest.fn(async () => result);
  const eqOrg = jest.fn(() => ({ maybeSingle }));
  const eqUser = jest.fn(() => ({ eq: eqOrg }));
  const eqId = jest.fn(() => ({ eq: eqUser }));
  const select = jest.fn(() => ({ eq: eqId }));
  mockFrom.mockReturnValue({ select });
  return { select, eqId, eqUser, eqOrg };
}

function mockMessageInsert(inserted: Record<string, unknown>) {
  const insert = jest.fn(() => ({
    select: () => ({ single: async () => ({ data: inserted, error: null }) }),
  }));
  const update = jest.fn(() => ({ eq: async () => ({ error: null }) }));
  mockFrom.mockImplementation((table: string) =>
    table === 'chat_messages' ? { insert } : { update },
  );
  return { insert, update };
}

function asPart(part: unknown): UIMessage['parts'][number] {
  return part as UIMessage['parts'][number];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUserMetadata.mockResolvedValue({
    userId: 'user-1',
    organizationId: 'org-1',
  } as UserMetadata);
});

describe('getChatSession', () => {
  it("returns the caller's session", async () => {
    const { select, eqId, eqUser, eqOrg } = mockSessionLookup({
      data: SESSION_ROW,
      error: null,
    });

    const session = await getChatSession(7);

    expect(mockFrom).toHaveBeenCalledWith('chat_sessions');
    expect(select).toHaveBeenCalledWith('*');
    expect(eqId).toHaveBeenCalledWith('id', 7);
    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(eqOrg).toHaveBeenCalledWith('organization_id', 'org-1');
    expect(session).toEqual(SESSION_ROW);
  });

  it("returns null when the session is missing or someone else's", async () => {
    mockSessionLookup({ data: null, error: null });

    expect(await getChatSession(7)).toBeNull();
  });

  it('throws when the lookup fails', async () => {
    mockSessionLookup({ data: null, error: { message: 'boom' } });

    await expect(getChatSession(7)).rejects.toThrow(
      'Failed to fetch chat session',
    );
  });

  it('throws when there is no authenticated user', async () => {
    mockGetUserMetadata.mockResolvedValue(null);

    await expect(getChatSession(7)).rejects.toThrow('User not authenticated');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('throws when the caller has no organization', async () => {
    mockGetUserMetadata.mockResolvedValue({ userId: 'user-1' } as UserMetadata);

    await expect(getChatSession(7)).rejects.toThrow('User not authenticated');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('partitionStoredTurn', () => {
  const row = (id: number, clientMessageId?: string): ChatMessage => ({
    id,
    session_id: 7,
    role: 'user',
    content: `message ${id}`,
    metadata: clientMessageId ? { clientMessageId } : null,
    created_at: '2026-09-11T00:00:00Z',
  });

  it('keeps every row when the client message id is new', () => {
    const stored = [row(1, 'a'), row(2), row(3, 'b')];

    expect(partitionStoredTurn(stored, 'c')).toEqual({
      history: stored,
      alreadyStored: false,
    });
  });

  it('drops the turn stored by an earlier attempt of the same message', () => {
    const stored = [row(1, 'a'), row(2), row(3, 'b')];

    expect(partitionStoredTurn(stored, 'b')).toEqual({
      history: [stored[0], stored[1]],
      alreadyStored: true,
    });
  });
});

describe('saveAssistantMessage', () => {
  it('skips persistence when the response has neither text nor completed tool output', async () => {
    await saveAssistantMessage(7, {
      id: 'a1',
      role: 'assistant',
      parts: [asPart({ type: 'tool-get_spend', state: 'input-streaming' })],
    });

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('stores the text and completed tool parts of the response', async () => {
    const { insert, update } = mockMessageInsert({
      id: 99,
      session_id: 7,
      role: 'assistant',
      content: 'Answer',
      metadata: null,
      created_at: '2026-09-11T00:06:00Z',
    });

    await saveAssistantMessage(7, {
      id: 'a1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Answer' },
        asPart({
          type: 'tool-get_spend',
          state: 'output-available',
          toolCallId: 'c1',
          toolName: 'get_spend',
          input: { vendor: 'AWS' },
          output: { total: 1 },
        }),
      ],
    });

    expect(insert).toHaveBeenCalledWith({
      session_id: 7,
      role: 'assistant',
      content: 'Answer',
      metadata: {
        toolParts: [
          {
            type: 'tool-get_spend',
            state: 'output-available',
            toolCallId: 'c1',
            toolName: 'get_spend',
            args: { vendor: 'AWS' },
            output: { total: 1 },
          },
        ],
      },
    });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('stores a text-only response with null metadata', async () => {
    const { insert } = mockMessageInsert({
      id: 100,
      session_id: 7,
      role: 'assistant',
      content: 'Just text',
      metadata: null,
      created_at: '2026-09-11T00:07:00Z',
    });

    await saveAssistantMessage(7, {
      id: 'a2',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Just text' }],
    });

    expect(insert).toHaveBeenCalledWith({
      session_id: 7,
      role: 'assistant',
      content: 'Just text',
      metadata: null,
    });
  });
});
