import { createClient } from '@/utils/supabase/server';
import { getUserMetadata } from '@/data/users';
import logger from '@/utils/pino';
import type { UIMessage } from 'ai';
import { extractToolPartsFromMessage, getTextFromMessage } from './ui-messages';
import type {
  ChatSession,
  ChatMessage,
  ChatMessageRole,
  ChatSessionsResult,
  ChatMessagesResult,
  CreateSessionInput,
  CreateSessionResult,
  SaveMessageInput,
  SaveMessageResult,
  UpdateSessionTitleInput,
  ChatMessageMetadata,
  PaginationParams,
} from './types';

/**
 * Get all chat sessions for the current user
 */
export async function getChatSessions(): Promise<ChatSessionsResult> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata?.userId || !userMetadata?.organizationId) {
    throw new Error('User not authenticated');
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('chat_sessions' as never)
    .select('*')
    .eq('user_id', userMetadata.userId)
    .eq('organization_id', userMetadata.organizationId)
    .order('updated_at', { ascending: false });

  if (error) {
    logger.error(
      { error, userId: userMetadata.userId },
      'Failed to fetch chat sessions',
    );
    throw new Error('Failed to fetch chat sessions');
  }

  const sessions: ChatSession[] = (
    (data as Record<string, unknown>[]) ?? []
  ).map((row) => ({
    id: row.id as number,
    organization_id: row.organization_id as string,
    user_id: row.user_id as string,
    title: row.title as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }));

  return { sessions };
}

export async function getChatSession(
  sessionId: number,
): Promise<ChatSession | null> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata?.userId || !userMetadata?.organizationId) {
    throw new Error('User not authenticated');
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('chat_sessions' as never)
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userMetadata.userId)
    .eq('organization_id', userMetadata.organizationId)
    .maybeSingle();

  if (error) {
    logger.error(
      { error, sessionId, userId: userMetadata.userId },
      'Failed to fetch chat session',
    );
    throw new Error('Failed to fetch chat session');
  }

  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: row.id as number,
    organization_id: row.organization_id as string,
    user_id: row.user_id as string,
    title: row.title as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapRowToMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as number,
    session_id: row.session_id as number,
    role: row.role as ChatMessageRole,
    content: row.content as string,
    metadata: row.metadata as ChatMessageMetadata | null,
    created_at: row.created_at as string,
  };
}

/**
 * Get messages for a specific chat session with optional pagination.
 * When pagination params are provided, returns a bounded page of results
 * plus the total count for UI pagination.
 */
export async function getChatMessages(
  sessionId: number,
  pagination?: PaginationParams,
): Promise<ChatMessagesResult> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata?.userId) {
    throw new Error('User not authenticated');
  }

  const supabase = await createClient();
  const isPaginated =
    pagination?.limit !== undefined || pagination?.offset !== undefined;

  let query = supabase
    .from('chat_messages' as never)
    .select(
      '*, chat_sessions!inner(user_id)',
      isPaginated ? { count: 'exact' } : {},
    )
    .eq('session_id', sessionId)
    .eq('chat_sessions.user_id', userMetadata.userId)
    .order('created_at', { ascending: true });

  if (pagination?.limit !== undefined) {
    const offset = pagination.offset ?? 0;
    query = query.range(offset, offset + pagination.limit - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error(
      { error, sessionId, userId: userMetadata.userId },
      'Failed to fetch chat messages',
    );
    throw new Error('Failed to fetch chat messages');
  }

  const messages = ((data as Record<string, unknown>[]) ?? []).map(
    mapRowToMessage,
  );

  return {
    messages,
    ...(isPaginated && count !== null ? { totalCount: count } : {}),
  };
}

/**
 * Create a new chat session
 */
export async function createChatSession(
  input?: CreateSessionInput,
): Promise<CreateSessionResult> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata?.userId || !userMetadata?.organizationId) {
    throw new Error('User not authenticated');
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('chat_sessions' as never)
    .insert({
      organization_id: userMetadata.organizationId,
      user_id: userMetadata.userId,
      title: input?.title ?? 'New Chat',
    } as never)
    .select()
    .single();

  if (error) {
    logger.error(
      { error, userId: userMetadata.userId },
      'Failed to create chat session',
    );
    throw new Error('Failed to create chat session');
  }

  const row = data as Record<string, unknown>;
  const session: ChatSession = {
    id: row.id as number,
    organization_id: row.organization_id as string,
    user_id: row.user_id as string,
    title: row.title as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };

  return { session };
}

/**
 * Save a message to a chat session
 */
export async function saveChatMessage(
  input: SaveMessageInput,
): Promise<SaveMessageResult> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata?.userId) {
    throw new Error('User not authenticated');
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('chat_messages' as never)
    .insert({
      session_id: input.sessionId,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? null,
    } as never)
    .select()
    .single();

  if (error) {
    logger.error(
      { error, sessionId: input.sessionId, userId: userMetadata.userId },
      'Failed to save chat message',
    );
    throw new Error('Failed to save chat message');
  }

  // Update session's updated_at timestamp
  await supabase
    .from('chat_sessions' as never)
    .update({ updated_at: new Date().toISOString() } as never)
    .eq('id', input.sessionId);

  const row = data as Record<string, unknown>;
  const message: ChatMessage = {
    id: row.id as number,
    session_id: row.session_id as number,
    role: row.role as ChatMessageRole,
    content: row.content as string,
    metadata: row.metadata as ChatMessageMetadata | null,
    created_at: row.created_at as string,
  };

  return { message };
}

export async function saveAssistantMessage(
  sessionId: number,
  message: UIMessage,
): Promise<void> {
  const content = getTextFromMessage(message);
  const toolParts = extractToolPartsFromMessage(message);
  if (!content && toolParts.length === 0) return;

  await saveChatMessage({
    sessionId,
    role: 'assistant',
    content,
    metadata: toolParts.length > 0 ? { toolParts } : undefined,
  });
}

/**
 * Update a chat session's title
 */
export async function updateChatSessionTitle(
  input: UpdateSessionTitleInput,
): Promise<ChatSession> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata?.userId) {
    throw new Error('User not authenticated');
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('chat_sessions' as never)
    .update({ title: input.title } as never)
    .eq('id', input.sessionId)
    .eq('user_id', userMetadata.userId)
    .select()
    .single();

  if (error) {
    logger.error(
      { error, sessionId: input.sessionId, userId: userMetadata.userId },
      'Failed to update chat session title',
    );
    throw new Error('Failed to update chat session title');
  }

  const row = data as Record<string, unknown>;
  return {
    id: row.id as number,
    organization_id: row.organization_id as string,
    user_id: row.user_id as string,
    title: row.title as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/**
 * Delete a chat session and all its messages
 */
export async function deleteChatSession(sessionId: number): Promise<void> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata?.userId) {
    throw new Error('User not authenticated');
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('chat_sessions' as never)
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userMetadata.userId);

  if (error) {
    logger.error(
      { error, sessionId, userId: userMetadata.userId },
      'Failed to delete chat session',
    );
    throw new Error('Failed to delete chat session');
  }
}
