/**
 * Types for chat persistence layer
 */

// `system` is the operator channel and tool results are minted server-side,
// so neither is ever stored as a chat row.
export type ChatMessageRole = 'user' | 'assistant';

export interface ChatSession {
  id: number;
  organization_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: number;
  session_id: number;
  role: ChatMessageRole;
  content: string;
  metadata: ChatMessageMetadata | null;
  created_at: string;
}

export interface SerializedToolPart {
  type: string;
  state: string;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  output?: unknown;
}

export interface ChatMessageMetadata {
  clientMessageId?: string;
  toolCalls?: ToolCallMetadata[];
  toolResults?: ToolResultMetadata[];
  toolParts?: SerializedToolPart[];
}

export interface ToolCallMetadata {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
}

export interface ToolResultMetadata {
  toolCallId: string;
  result: unknown;
}

export interface CreateSessionInput {
  title?: string;
}

export interface SaveMessageInput {
  sessionId: number;
  role: ChatMessageRole;
  content: string;
  metadata?: ChatMessageMetadata;
}

export interface UpdateSessionTitleInput {
  sessionId: number;
  title: string;
}

export interface ChatSessionsResult {
  sessions: ChatSession[];
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface ChatMessagesResult {
  messages: ChatMessage[];
  totalCount?: number;
}

export interface CreateSessionResult {
  session: ChatSession;
}

export interface SaveMessageResult {
  message: ChatMessage;
}
