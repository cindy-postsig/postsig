/**
 * Conversation Summary Generator
 *
 * Builds a deterministic summary of older messages in a conversation.
 * Extracts user questions, tool calls, and key findings to preserve
 * context when older messages are dropped from the history.
 */

import type { ModelMessage } from 'ai';
import logger from '@/utils/pino';
import {
  summarizeToolResult,
  extractToolResultValue,
} from '@/lib/v2/chat/history/compress-tool-results';

const MAX_QUESTION_LENGTH = 100;
const MAX_FINDINGS = 5;
const MAX_TOOL_CALLS = 10;
const MAX_SUMMARY_LENGTH = 2000;

/**
 * Build a deterministic summary of conversation messages.
 * Returns a single ModelMessage with role 'user' containing the summary.
 *
 * Uses 'user' role because some providers don't support 'system' messages
 * mid-conversation.
 */
export function buildConversationSummary(
  messages: ModelMessage[],
): ModelMessage {
  const userQuestions: string[] = [];
  const toolCalls: string[] = [];
  const findings: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      const text = extractTextContent(msg);
      if (text) {
        const truncated =
          text.length > MAX_QUESTION_LENGTH
            ? text.substring(0, MAX_QUESTION_LENGTH) + '...'
            : text;
        userQuestions.push(truncated);
      }
    }

    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if ('type' in part && part.type === 'tool-call' && 'toolName' in part) {
          const toolPart = part as {
            type: 'tool-call';
            toolName: string;
            input: unknown;
          };
          const params = extractKeyParams(toolPart.input);
          toolCalls.push(
            params ? `${toolPart.toolName}(${params})` : toolPart.toolName,
          );
        }
      }
    }

    if (msg.role === 'tool' && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (
          part.type === 'tool-result' &&
          'output' in part &&
          'toolName' in part
        ) {
          const value = extractToolResultValue(part.output);
          const summary = summarizeToolResult(part.toolName, value);
          if (
            summary &&
            !summary.includes('no output') &&
            !summary.includes('error:')
          ) {
            findings.push(summary);
          }
        }
      }
    }
  }

  const turnCount = messages.length;
  const topics =
    userQuestions.length > 0 ? userQuestions.join('; ') : 'various topics';
  const uniqueToolCalls = [...new Set(toolCalls)].slice(0, MAX_TOOL_CALLS);
  const toolList =
    uniqueToolCalls.length > 0 ? uniqueToolCalls.join(', ') : 'none';
  const findingsList =
    findings.length > 0 ? findings.slice(0, MAX_FINDINGS).join('; ') : 'none';

  let summaryText = `[Conversation summary (turns 1-${turnCount}): User asked about: ${topics}. Tools used: ${toolList}. Key findings: ${findingsList}.]`;

  if (summaryText.length > MAX_SUMMARY_LENGTH) {
    summaryText = summaryText.substring(0, MAX_SUMMARY_LENGTH - 4) + '...]';
  }

  logger.debug(
    {
      turnCount,
      userQuestions: userQuestions.length,
      toolCalls: toolCalls.length,
      findings: findings.length,
      summaryLength: summaryText.length,
    },
    '[CHAT_SUMMARY] Built conversation summary',
  );

  return {
    role: 'user',
    content: summaryText,
  };
}

export function extractTextContent(msg: ModelMessage): string | null {
  if (typeof msg.content === 'string') {
    return msg.content;
  }

  if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if ('type' in part && part.type === 'text' && 'text' in part) {
        return (part as { type: 'text'; text: string }).text;
      }
    }
  }

  return null;
}

function extractKeyParams(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;

  const obj = input as Record<string, unknown>;
  const keys = [
    'vendorName',
    'queryType',
    'contractId',
    'tagName',
    'searchTerm',
  ];
  const params: string[] = [];

  for (const key of keys) {
    if (key in obj && obj[key] !== undefined) {
      params.push(`${key}=${String(obj[key])}`);
    }
  }

  return params.length > 0 ? params.join(', ') : null;
}
