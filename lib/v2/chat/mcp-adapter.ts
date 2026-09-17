import { randomUUID } from 'node:crypto';
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import { cpmMcpTools } from '@/app/lib/mcp/tools';
import { runWithMcpContext, type McpScope } from '@/app/lib/mcp/context';
import { McpToolError } from '@/app/lib/mcp/errors';
import { AuthorizationError } from '@/lib/errors';
import { createChatToolCache } from '@/lib/v2/chat/tools/cache';
import logger from '@/utils/pino';
import type { UserMetadata } from '@/constants/types';

const CHAT_SCOPES: McpScope[] = ['read'];

function classifyError(err: unknown): { error: string; code: string } {
  if (err instanceof McpToolError)
    return { error: err.message, code: err.code };
  if (err instanceof AuthorizationError)
    return { error: err.message, code: 'forbidden' };
  if (err instanceof z.ZodError) {
    return {
      error: 'Invalid input: ' + err.issues.map((i) => i.message).join('; '),
      code: 'invalid_input',
    };
  }
  return { error: 'Tool execution failed', code: 'internal_error' };
}

export function buildChatTokenId(user: UserMetadata): string {
  return `chat:${user.userId}:${randomUUID()}`;
}

export function getMcpToolsForChat(
  user: UserMetadata,
  tokenId: string,
): Record<string, Tool> {
  const readOnly = cpmMcpTools.filter((t) => t.requiredScope !== 'write');
  const tools: Record<string, Tool> = {};
  // Shared across every tool invocation in this streamText call so repeated
  // service fetches (getContractsList, etc.) dedupe across multi-step
  // reasoning.
  const cache = createChatToolCache();

  for (const def of readOnly) {
    tools[def.name] = tool({
      description: def.description,
      inputSchema: def.inputSchema,
      execute: async (input) => {
        try {
          return await runWithMcpContext(
            {
              userMetadata: user,
              scopes: CHAT_SCOPES,
              tokenId,
              tokenSource: 'chat',
              cache,
            },
            async () => {
              const parsed = def.inputSchema.parse(input);
              return await def.handler(parsed, {});
            },
          );
        } catch (err) {
          const classified = classifyError(err);
          if (classified.code === 'internal_error') {
            logger.error({ err, tool: def.name }, 'mcp-adapter: tool threw');
          } else {
            logger.warn(
              {
                tool: def.name,
                code: classified.code,
                message: classified.error,
              },
              'mcp-adapter: tool returned error',
            );
          }
          return classified;
        }
      },
    });
  }

  return tools;
}
