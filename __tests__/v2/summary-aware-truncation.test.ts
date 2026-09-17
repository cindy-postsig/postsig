import { describe, expect, it } from '@jest/globals';
import type { ModelMessage } from 'ai';
import { buildConversationSummary } from '@/lib/v2/chat/history/summarize-conversation';

jest.mock('@/utils/pino', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

/**
 * Tests for summary-aware truncation logic as implemented in stream.ts.
 * Tests the pattern: if count > threshold, summarize old + keep recent.
 */

const MESSAGE_COUNT_THRESHOLD = 20;
const RECENT_MESSAGES_KEEP = 16;

function makeMessages(count: number): ModelMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `message-${i}`,
  }));
}

function applySummaryAwareTruncation(messages: ModelMessage[]): ModelMessage[] {
  if (messages.length > MESSAGE_COUNT_THRESHOLD) {
    const oldMessages = messages.slice(0, -RECENT_MESSAGES_KEEP);
    const kept = messages.slice(-RECENT_MESSAGES_KEEP);
    const summary = buildConversationSummary(oldMessages);
    return [summary, ...kept];
  }
  return messages;
}

describe('summary-aware truncation', () => {
  it('should pass through messages when count <= threshold', () => {
    const messages = makeMessages(15);
    const result = applySummaryAwareTruncation(messages);
    expect(result).toEqual(messages);
    expect(result.length).toBe(15);
  });

  it('should pass through messages when count equals threshold', () => {
    const messages = makeMessages(20);
    const result = applySummaryAwareTruncation(messages);
    expect(result).toEqual(messages);
    expect(result.length).toBe(20);
  });

  it('should apply summary when count exceeds threshold', () => {
    const messages = makeMessages(25);
    const result = applySummaryAwareTruncation(messages);

    // Should be: 1 summary + 16 recent = 17 messages
    expect(result.length).toBe(RECENT_MESSAGES_KEEP + 1);

    // First message should be the summary
    expect(result[0].role).toBe('user');
    expect(result[0].content as string).toContain('Conversation summary');

    // Last 16 messages should match the original last 16
    const originalLast16 = messages.slice(-RECENT_MESSAGES_KEEP);
    expect(result.slice(1)).toEqual(originalLast16);
  });

  it('should summarize the correct old messages', () => {
    const messages = makeMessages(30);
    const result = applySummaryAwareTruncation(messages);

    // Summary should cover turns 1-14 (30 - 16 = 14 old messages)
    const summaryText = result[0].content as string;
    expect(summaryText).toContain('turns 1-14');
  });

  it('should preserve all recent messages intact', () => {
    const messages = makeMessages(22);
    const result = applySummaryAwareTruncation(messages);

    const recentOriginal = messages.slice(-RECENT_MESSAGES_KEEP);
    const recentResult = result.slice(1);

    expect(recentResult.length).toBe(RECENT_MESSAGES_KEEP);
    for (let i = 0; i < RECENT_MESSAGES_KEEP; i++) {
      expect(recentResult[i].content).toBe(recentOriginal[i].content);
      expect(recentResult[i].role).toBe(recentOriginal[i].role);
    }
  });

  it('should handle large conversations efficiently', () => {
    const messages = makeMessages(100);
    const result = applySummaryAwareTruncation(messages);

    expect(result.length).toBe(RECENT_MESSAGES_KEEP + 1);
    expect(result[0].content as string).toContain('turns 1-84');
  });
});
