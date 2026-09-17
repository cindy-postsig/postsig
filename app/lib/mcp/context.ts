import { AsyncLocalStorage } from 'node:async_hooks';
import type { UserMetadata } from '@/constants/types';
import { AuthorizationError } from '@/lib/errors';
import type { ChatToolCache } from '@/lib/v2/chat/tools/cache';

export type McpScope = 'read' | 'write';
export type McpTokenSource = 'pat' | 'oauth' | 'chat';

export interface McpRequestContext {
  userMetadata: UserMetadata;
  scopes: McpScope[];
  tokenId: string;
  tokenSource: McpTokenSource;
  cache: ChatToolCache;
}

const storage = new AsyncLocalStorage<McpRequestContext>();

export function runWithMcpContext<T>(
  ctx: McpRequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(ctx, fn);
}

export function getMcpContext(): McpRequestContext | undefined {
  return storage.getStore();
}

export function requireMcpContext(): McpRequestContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new AuthorizationError('MCP context not initialized');
  }
  return ctx;
}

export function requireScope(scope: McpScope): void {
  const ctx = requireMcpContext();
  if (!ctx.scopes.includes(scope)) {
    throw new AuthorizationError(`Missing required scope: ${scope}`);
  }
}
