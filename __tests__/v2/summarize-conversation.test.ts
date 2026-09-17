import { describe, expect, it } from '@jest/globals';
import type { ModelMessage } from 'ai';
import type { JSONValue } from '@ai-sdk/provider';
import { buildConversationSummary } from '@/lib/v2/chat/history/summarize-conversation';

jest.mock('@/utils/pino', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

function makeUserMessage(text: string): ModelMessage {
  return { role: 'user', content: text };
}

function makeAssistantMessage(text: string): ModelMessage {
  return { role: 'assistant', content: text };
}

function makeAssistantWithToolCall(
  toolName: string,
  toolCallId: string,
  input: Record<string, unknown>,
): ModelMessage {
  return {
    role: 'assistant',
    content: [
      {
        type: 'tool-call' as const,
        toolCallId,
        toolName,
        input,
      },
    ],
  };
}

function makeToolMessage(
  toolName: string,
  toolCallId: string,
  output: unknown,
): ModelMessage {
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result' as const,
        toolCallId,
        toolName,
        output: { type: 'json' as const, value: output as JSONValue },
      },
    ],
  };
}

describe('buildConversationSummary', () => {
  it('should return a user-role message', () => {
    const messages: ModelMessage[] = [
      makeUserMessage('What is the spend for Acme?'),
      makeAssistantMessage('Let me check.'),
    ];

    const result = buildConversationSummary(messages);
    expect(result.role).toBe('user');
    expect(typeof result.content).toBe('string');
  });

  it('should extract user questions', () => {
    const messages: ModelMessage[] = [
      makeUserMessage('What is the spend for Acme?'),
      makeAssistantMessage('Acme has $150K TCV'),
      makeUserMessage('Show me expiring contracts'),
      makeAssistantMessage('Here are the expiring contracts'),
    ];

    const result = buildConversationSummary(messages);
    const text = result.content as string;
    expect(text).toContain('What is the spend for Acme?');
    expect(text).toContain('Show me expiring contracts');
  });

  it('should truncate long user questions to 100 chars', () => {
    const longQuestion = 'A'.repeat(150);
    const messages: ModelMessage[] = [
      makeUserMessage(longQuestion),
      makeAssistantMessage('response'),
    ];

    const result = buildConversationSummary(messages);
    const text = result.content as string;
    expect(text).toContain('A'.repeat(100) + '...');
    expect(text).not.toContain('A'.repeat(101));
  });

  it('should extract tool calls with key params', () => {
    const messages: ModelMessage[] = [
      makeUserMessage('Check spend for Acme'),
      makeAssistantWithToolCall('calculate_spend', 'tc-1', {
        vendorName: 'Acme',
      }),
      makeToolMessage('calculate_spend', 'tc-1', {
        type: 'vendor_total',
        vendorName: 'Acme',
        contractCount: 3,
        totals: { totalContractValueUSD: 150000 },
        summary: 'Acme has 3 contracts',
      }),
      makeAssistantMessage('Acme has $150K TCV'),
    ];

    const result = buildConversationSummary(messages);
    const text = result.content as string;
    expect(text).toContain('calculate_spend(vendorName=Acme)');
  });

  it('should extract tool findings from tool results', () => {
    const messages: ModelMessage[] = [
      makeUserMessage('Search for contracts'),
      makeToolMessage('search_contracts', 'tc-1', [
        { id: 1, vendorName: 'Acme', currentSpend: 5000 },
        { id: 2, vendorName: 'Beta', currentSpend: 3000 },
      ]),
      makeAssistantMessage('Found 2 contracts'),
    ];

    const result = buildConversationSummary(messages);
    const text = result.content as string;
    expect(text).toContain('search_contracts');
    expect(text).toContain('2 contracts found');
  });

  it('should include turn count in summary', () => {
    const messages: ModelMessage[] = [
      makeUserMessage('q1'),
      makeAssistantMessage('a1'),
      makeUserMessage('q2'),
      makeAssistantMessage('a2'),
    ];

    const result = buildConversationSummary(messages);
    const text = result.content as string;
    expect(text).toContain('turns 1-4');
  });

  it('should handle empty messages', () => {
    const result = buildConversationSummary([]);
    const text = result.content as string;
    expect(text).toContain('turns 1-0');
    expect(text).toContain('various topics');
    expect(text).toContain('Tools used: none');
  });

  it('should deduplicate repeated tool calls', () => {
    const messages: ModelMessage[] = [
      makeAssistantWithToolCall('search_contracts', 'tc-1', {
        vendorName: 'Acme',
      }),
      makeToolMessage('search_contracts', 'tc-1', []),
      makeAssistantWithToolCall('search_contracts', 'tc-2', {
        vendorName: 'Acme',
      }),
      makeToolMessage('search_contracts', 'tc-2', []),
    ];

    const result = buildConversationSummary(messages);
    const text = result.content as string;
    // Should deduplicate identical tool call strings
    const matches = text.match(/search_contracts\(vendorName=Acme\)/g);
    expect(matches?.length).toBe(1);
  });

  it('should limit findings to 5', () => {
    const messages: ModelMessage[] = [];
    for (let i = 0; i < 10; i++) {
      messages.push(
        makeToolMessage('search_contracts', `tc-${i}`, [{ id: i }]),
      );
    }

    const result = buildConversationSummary(messages);
    const text = result.content as string;
    const findingsMatch = text.match(/\[Tool: search_contracts/g);
    expect(findingsMatch?.length).toBeLessThanOrEqual(5);
  });

  it('should exclude error findings', () => {
    const messages: ModelMessage[] = [
      makeToolMessage('search_contracts', 'tc-1', {
        error: 'No contracts found',
        noResults: true,
      }),
    ];

    const result = buildConversationSummary(messages);
    const text = result.content as string;
    expect(text).toContain('Key findings: none');
  });

  it('should handle user messages with array content', () => {
    const msg: ModelMessage = {
      role: 'user',
      content: [{ type: 'text' as const, text: 'Hello there' }],
    };

    const result = buildConversationSummary([msg]);
    const text = result.content as string;
    expect(text).toContain('Hello there');
  });
});
