/**
 * Chat Tools - Utility Tools
 *
 * Simple utility tools for the chat system.
 */

import logger from '@/utils/pino';
import { ModelMessage, tool } from 'ai';
import { z } from 'zod';
import { DefaultChatTransport } from 'ai';

/**
 * Create the get_current_date tool
 * Returns the current date in ISO format
 */
export function createGetCurrentDateTool() {
  return tool({
    description: 'Get the current date',
    inputSchema: z.object({}),
    execute: async () => {
      return new Date().toISOString();
    },
  });
}

/**
 * Estimate token count for a string (roughly 4 chars per token for English)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for a single content part (text, tool-call, or tool-result)
 */
function estimatePartTokens(part: Record<string, unknown>): number {
  if ('text' in part && typeof part.text === 'string') {
    return estimateTokens(part.text);
  }

  if (part.type === 'tool-result' && 'output' in part) {
    try {
      return estimateTokens(JSON.stringify(part.output));
    } catch (err) {
      logger.debug(
        {
          type: part.type,
          id: (part as Record<string, unknown>).id,
          error: err,
        },
        '[TOKEN_ESTIMATE] Failed to serialize tool-result output',
      );
      return 0;
    }
  }

  if (part.type === 'tool-call' && 'input' in part) {
    try {
      return estimateTokens(JSON.stringify(part.input));
    } catch (err) {
      logger.debug(
        {
          type: part.type,
          name: (part as Record<string, unknown>).toolName,
          error: err,
        },
        '[TOKEN_ESTIMATE] Failed to serialize tool-call input',
      );
      return 0;
    }
  }

  return 0;
}

/**
 * Estimate tokens for a single message
 */
export function estimateSingleMessageTokens(msg: ModelMessage): number {
  if (typeof msg.content === 'string') {
    return estimateTokens(msg.content);
  }

  if (Array.isArray(msg.content)) {
    let tokens = 0;
    for (const part of msg.content) {
      tokens += estimatePartTokens(part as Record<string, unknown>);
    }
    return tokens;
  }

  return 0;
}

/**
 * Estimate total tokens in model messages
 */
export function estimateMessageTokens(messages: ModelMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateSingleMessageTokens(msg);
  }
  return total;
}

/**
 * Truncate messages to fit within token limit, keeping most recent messages
 */
export function truncateMessagesToTokenLimit(
  messages: ModelMessage[],
  systemPromptTokens: number,
  maxTokens: number,
): ModelMessage[] {
  const availableTokens = maxTokens - systemPromptTokens;

  if (availableTokens <= 0) {
    logger.warn(
      { systemPromptTokens, maxTokens },
      '[CHAT_TOKEN_LIMIT] System prompt exceeds token limit',
    );
    return messages.slice(-5);
  }

  let currentTokens = 0;
  const result: ModelMessage[] = [];

  // Iterate from most recent to oldest, keeping messages until we hit the limit
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgTokens = estimateSingleMessageTokens(msg);

    if (currentTokens + msgTokens > availableTokens) {
      logger.info(
        {
          originalCount: messages.length,
          truncatedCount: result.length,
          estimatedTokens: currentTokens,
          droppedMessages: messages.length - result.length,
        },
        '[CHAT_TOKEN_LIMIT] Truncated messages to fit token limit',
      );
      break;
    }

    currentTokens += msgTokens;
    result.unshift(msg);
  }

  return result;
}

export function createChatTransport(
  options: ConstructorParameters<typeof DefaultChatTransport>[0],
) {
  return new DefaultChatTransport({
    ...options,
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers);
      headers.delete('User-Agent');
      return fetch(url, { ...init, headers });
    },
  });
}
