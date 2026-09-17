import { describe, expect, it } from '@jest/globals';
import type { ModelMessage } from 'ai';
import type { JSONValue } from '@ai-sdk/provider';
import {
  estimateTokens,
  estimateMessageTokens,
  estimateSingleMessageTokens,
  truncateMessagesToTokenLimit,
} from '@/lib/v2/chat/tools/utils';

jest.mock('@/utils/pino', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

describe('estimateTokens', () => {
  it('should estimate roughly 1 token per 4 characters', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('abc')).toBe(1); // ceil(3/4) = 1
  });

  it('should handle empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('estimateSingleMessageTokens', () => {
  it('should estimate tokens for string content', () => {
    const msg: ModelMessage = { role: 'user', content: 'Hello world!' }; // 12 chars -> 3 tokens
    expect(estimateSingleMessageTokens(msg)).toBe(3);
  });

  it('should estimate tokens for text parts in array content', () => {
    const msg: ModelMessage = {
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello world!' }], // 12 chars -> 3 tokens
    };
    expect(estimateSingleMessageTokens(msg)).toBe(3);
  });

  it('should estimate tokens for tool-result parts', () => {
    const largeOutput = {
      contracts: Array.from({ length: 10 }, (_, i) => ({
        id: i,
        name: `contract-${i}`,
      })),
    };
    const serializedLength = JSON.stringify({
      type: 'json',
      value: largeOutput,
    }).length;

    const msg: ModelMessage = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'tc-1',
          toolName: 'search_contracts',
          output: { type: 'json' as const, value: largeOutput as JSONValue },
        },
      ],
    };

    const tokens = estimateSingleMessageTokens(msg);
    expect(tokens).toBe(Math.ceil(serializedLength / 4));
    expect(tokens).toBeGreaterThan(0);
  });

  it('should estimate tokens for tool-call parts', () => {
    const msg: ModelMessage = {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'tc-1',
          toolName: 'search_contracts',
          input: { vendorName: 'Acme Corp' },
        },
      ],
    };

    const tokens = estimateSingleMessageTokens(msg);
    const expectedTokens = Math.ceil(
      JSON.stringify({ vendorName: 'Acme Corp' }).length / 4,
    );
    expect(tokens).toBe(expectedTokens);
  });

  it('should handle mixed content parts', () => {
    const msg: ModelMessage = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Here are the results:' }, // 21 chars -> 6 tokens
        {
          type: 'tool-call',
          toolCallId: 'tc-1',
          toolName: 'test',
          input: { q: 'test' },
        },
      ],
    };

    const tokens = estimateSingleMessageTokens(msg);
    const textTokens = Math.ceil(21 / 4);
    const callTokens = Math.ceil(JSON.stringify({ q: 'test' }).length / 4);
    expect(tokens).toBe(textTokens + callTokens);
  });

  it('should return 0 for non-string non-array content', () => {
    // System messages always have string content, so this edge case
    // tests defensive behavior
    const msg = { role: 'system', content: 123 } as unknown as ModelMessage;
    expect(estimateSingleMessageTokens(msg)).toBe(0);
  });
});

describe('estimateMessageTokens', () => {
  it('should sum tokens across all messages', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'abcd' }, // 1 token
      { role: 'assistant', content: 'abcdefgh' }, // 2 tokens
    ];
    expect(estimateMessageTokens(messages)).toBe(3);
  });

  it('should include tool-result tokens in the count', () => {
    const output = {
      type: 'vendor_total',
      vendorName: 'Acme',
      contracts: Array.from({ length: 5 }, () => ({
        id: 1,
        data: 'x'.repeat(100),
      })),
    };

    const messages: ModelMessage[] = [
      { role: 'user', content: 'what is the spend?' },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tc-1',
            toolName: 'calculate_spend',
            output: { type: 'json' as const, value: output as JSONValue },
          },
        ],
      },
      { role: 'assistant', content: 'Acme has...' },
    ];

    const tokens = estimateMessageTokens(messages);
    // Should be much more than just counting text parts
    const textOnlyTokens =
      Math.ceil('what is the spend?'.length / 4) +
      Math.ceil('Acme has...'.length / 4);

    expect(tokens).toBeGreaterThan(textOnlyTokens);
  });

  it('should handle empty messages array', () => {
    expect(estimateMessageTokens([])).toBe(0);
  });
});

describe('truncateMessagesToTokenLimit', () => {
  it('should keep all messages when within token limit', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ];
    const result = truncateMessagesToTokenLimit(messages, 100, 10000);
    expect(result.length).toBe(2);
  });

  it('should drop oldest messages when exceeding limit', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'a'.repeat(400) }, // 100 tokens
      { role: 'assistant', content: 'b'.repeat(400) }, // 100 tokens
      { role: 'user', content: 'c'.repeat(400) }, // 100 tokens
    ];
    // 250 available tokens (300 - 50 system) -> keeps last 2 messages (200 tokens)
    const result = truncateMessagesToTokenLimit(messages, 50, 300);
    expect(result.length).toBe(2);
    expect((result[0].content as string)[0]).toBe('b');
    expect((result[1].content as string)[0]).toBe('c');
  });

  it('should account for tool-result tokens when truncating', () => {
    const largeToolOutput = { data: 'x'.repeat(4000) }; // ~1000 tokens
    const messages: ModelMessage[] = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tc-1',
            toolName: 'test',
            output: {
              type: 'json' as const,
              value: largeToolOutput as JSONValue,
            },
          },
        ],
      },
      { role: 'user', content: 'short' }, // ~2 tokens
    ];

    // Available = 500 tokens. Tool message is ~1000 tokens, so only short message fits
    const result = truncateMessagesToTokenLimit(messages, 0, 500);
    expect(result.length).toBe(1);
    expect(result[0].role).toBe('user');
  });

  it('should return last 5 messages if system prompt exceeds limit', () => {
    const messages: ModelMessage[] = Array.from({ length: 10 }, (_, i) => ({
      role: 'user' as const,
      content: `msg-${i}`,
    }));
    const result = truncateMessagesToTokenLimit(messages, 999999, 100);
    expect(result.length).toBe(5);
  });
});
