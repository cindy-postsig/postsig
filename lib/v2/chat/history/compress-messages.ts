/**
 * Conversation History Compression
 *
 * Compresses older tool-result parts in conversation history
 * by replacing full JSON outputs with deterministic summaries.
 * Recent messages are preserved intact for accurate follow-up.
 */

import type { ModelMessage } from 'ai';
import logger from '@/utils/pino';
import {
  summarizeToolResult,
  extractToolResultValue,
} from '@/lib/v2/chat/history/compress-tool-results';

const DEFAULT_RECENT_COUNT = 4;

/**
 * Compress tool-result parts in older messages, keeping recent messages intact.
 *
 * - Messages within the last `recentCount` are NOT compressed
 * - Older messages: tool-result parts are replaced with summary strings
 * - Message structure (role, ordering) is preserved
 */
export function compressHistoryMessages(
  messages: ModelMessage[],
  recentCount: number = DEFAULT_RECENT_COUNT,
): ModelMessage[] {
  if (messages.length <= recentCount) {
    return messages;
  }

  const splitIndex = messages.length - recentCount;
  const oldMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);

  let messagesCompressed = 0;
  let partsCompressed = 0;
  let originalChars = 0;
  let compressedChars = 0;

  const compressed = oldMessages.map((msg): ModelMessage => {
    if (msg.role === 'tool' && Array.isArray(msg.content)) {
      const prevParts = partsCompressed;
      const newContent = msg.content.map((part) => {
        if (part.type === 'tool-result' && part.output) {
          if (isAlreadySummarized(part.output)) {
            return part;
          }

          // Skip wrapped string outputs (e.g. JSON wrapper holding a pre-summarized
          // tool string after SDK message conversion/round-tripping).
          if (isWrappedStringOutput(part.output)) {
            return part;
          }

          // Skip raw string outputs — already compressed, wrapper
          // may have been stripped by SDK message conversion
          if (typeof part.output === 'string') {
            return part;
          }

          const outputStr = serializeOutput(part.output);
          originalChars += outputStr.length;

          const summary = summarizeToolResult(
            part.toolName,
            extractToolResultValue(part.output),
          );
          compressedChars += summary.length;
          partsCompressed++;

          return {
            ...part,
            output: { type: 'text' as const, value: summary },
          };
        }
        return part;
      });

      if (partsCompressed > prevParts) {
        messagesCompressed++;
      }

      return { ...msg, content: newContent };
    }

    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const prevParts = partsCompressed;
      const newContent = msg.content.map((part) => {
        if (
          'type' in part &&
          part.type === 'tool-result' &&
          'output' in part &&
          'toolName' in part
        ) {
          const toolPart = part as {
            type: 'tool-result';
            toolCallId: string;
            toolName: string;
            output: unknown;
          };
          if (isAlreadySummarized(toolPart.output)) {
            return part;
          }

          // Skip wrapped string outputs (e.g. JSON wrapper holding a pre-summarized
          // tool string after SDK message conversion/round-tripping).
          if (isWrappedStringOutput(toolPart.output)) {
            return part;
          }

          // Skip raw string outputs — already compressed, wrapper
          // may have been stripped by SDK message conversion
          if (typeof toolPart.output === 'string') {
            return part;
          }

          const outputStr = serializeOutput(toolPart.output);
          originalChars += outputStr.length;

          const summary = summarizeToolResult(
            toolPart.toolName,
            extractToolResultValue(toolPart.output),
          );
          compressedChars += summary.length;
          partsCompressed++;

          return {
            ...toolPart,
            output: { type: 'text' as const, value: summary },
          };
        }
        return part;
      });

      if (partsCompressed > prevParts) {
        messagesCompressed++;
      }

      return { ...msg, content: newContent };
    }

    return msg;
  });

  if (partsCompressed > 0) {
    logger.debug(
      {
        originalChars,
        compressedChars,
        messagesCompressed,
        partsCompressed,
        reductionPercent:
          originalChars > 0
            ? Math.round((1 - compressedChars / originalChars) * 100)
            : 0,
      },
      '[CHAT_COMPRESS] Compressed tool results in history',
    );
  }

  return [...compressed, ...recentMessages];
}

function isAlreadySummarized(output: unknown): boolean {
  return (
    typeof output === 'object' &&
    output !== null &&
    'type' in output &&
    (output as Record<string, unknown>)['type'] === 'text' &&
    'value' in output &&
    typeof (output as Record<string, unknown>)['value'] === 'string'
  );
}

function isWrappedStringOutput(output: unknown): boolean {
  return (
    typeof output === 'object' &&
    output !== null &&
    'value' in output &&
    typeof (output as Record<string, unknown>)['value'] === 'string'
  );
}

function serializeOutput(output: unknown): string {
  try {
    return JSON.stringify(output);
  } catch {
    return '';
  }
}
