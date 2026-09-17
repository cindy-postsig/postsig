import { describe, expect, it } from '@jest/globals';
import type { ModelMessage } from 'ai';
import type { JSONValue } from '@ai-sdk/provider';
import { compressHistoryMessages } from '@/lib/v2/chat/history/compress-messages';

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

describe('compressHistoryMessages', () => {
  it('should return messages unchanged when count <= recentCount', () => {
    const messages: ModelMessage[] = [
      makeUserMessage('hello'),
      makeAssistantMessage('hi'),
    ];
    const result = compressHistoryMessages(messages, 4);
    expect(result).toEqual(messages);
  });

  it('should not compress recent messages', () => {
    const toolOutput = [
      { id: 1, vendorName: 'Acme', data: 'x'.repeat(1000) },
      { id: 2, vendorName: 'Beta', data: 'y'.repeat(1000) },
    ];

    const messages: ModelMessage[] = [
      makeUserMessage('old question'),
      makeToolMessage('search_contracts', 'tc-1', toolOutput),
      makeAssistantMessage('old answer'),
      makeUserMessage('recent question'),
      makeToolMessage('search_contracts', 'tc-2', toolOutput),
      makeAssistantMessage('recent answer'),
    ];

    const result = compressHistoryMessages(messages, 4);

    // Last 4 messages should be unchanged
    expect(result.slice(-4)).toEqual(messages.slice(-4));
  });

  it('should compress tool results in older messages', () => {
    const largeOutput = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      vendorName: 'Vendor',
      productName: 'Product',
      currentSpend: 5000,
      summary: 'Contract summary',
      termStartDate: '2025-01-01',
      termEndDate: '2026-01-01',
      contractType: 'SaaS',
    }));

    const messages: ModelMessage[] = [
      makeUserMessage('search for vendor'),
      makeToolMessage('search_contracts', 'tc-old', largeOutput),
      makeAssistantMessage('found 50 contracts'),
      makeUserMessage('question 2'),
      makeAssistantMessage('answer 2'),
      makeUserMessage('question 3'),
      makeAssistantMessage('answer 3'),
    ];

    const result = compressHistoryMessages(messages, 4);

    // The old tool message should be compressed
    const oldToolMsg = result[1];
    expect(oldToolMsg.role).toBe('tool');
    if (oldToolMsg.role === 'tool' && Array.isArray(oldToolMsg.content)) {
      const part = oldToolMsg.content[0];
      if (part.type === 'tool-result') {
        const output = part.output as { type: string; value: string };
        expect(output.type).toBe('text');
        expect(output.value).toContain('search_contracts');
        expect(output.value).toContain('50 contracts found');
        expect(output.value.length).toBeLessThan(
          JSON.stringify(largeOutput).length,
        );
      }
    }

    // Recent messages remain unchanged
    expect(result.length).toBe(messages.length);
  });

  it('should preserve message structure and ordering', () => {
    const messages: ModelMessage[] = [
      makeUserMessage('q1'),
      makeToolMessage('get_current_date', 'tc-1', '2026-01-01'),
      makeAssistantMessage('a1'),
      makeUserMessage('q2'),
      makeAssistantMessage('a2'),
      makeUserMessage('q3'),
      makeAssistantMessage('a3'),
    ];

    const result = compressHistoryMessages(messages, 4);

    expect(result.length).toBe(messages.length);
    expect(result[0].role).toBe('user');
    expect(result[1].role).toBe('tool');
    expect(result[2].role).toBe('assistant');
    expect(result[3].role).toBe('user');
  });

  it('should handle empty messages array', () => {
    const result = compressHistoryMessages([], 4);
    expect(result).toEqual([]);
  });

  it('should use default recentCount of 4', () => {
    const messages: ModelMessage[] = [
      makeUserMessage('old'),
      makeToolMessage('search_contracts', 'tc-1', [{ id: 1 }, { id: 2 }]),
      makeAssistantMessage('old answer'),
      makeUserMessage('q1'),
      makeAssistantMessage('a1'),
      makeUserMessage('q2'),
      makeAssistantMessage('a2'),
    ];

    const result = compressHistoryMessages(messages);

    // Last 4 should be untouched (default recentCount = 4)
    expect(result.slice(-4)).toEqual(messages.slice(-4));

    // Old tool message should be compressed
    const oldToolMsg = result[1];
    if (
      oldToolMsg.role === 'tool' &&
      Array.isArray(oldToolMsg.content) &&
      oldToolMsg.content[0].type === 'tool-result'
    ) {
      const output = oldToolMsg.content[0].output as {
        type: string;
        value: string;
      };
      expect(output.type).toBe('text');
      expect(output.value).toContain('search_contracts');
    }
  });

  it('should handle messages with no tool results', () => {
    const messages: ModelMessage[] = [
      makeUserMessage('q1'),
      makeAssistantMessage('a1'),
      makeUserMessage('q2'),
      makeAssistantMessage('a2'),
      makeUserMessage('q3'),
      makeAssistantMessage('a3'),
    ];

    const result = compressHistoryMessages(messages, 2);
    expect(result).toEqual(messages);
  });

  it('should handle spend tool with summary field', () => {
    const spendOutput = {
      type: 'vendor_total',
      vendorName: 'Acme Corp',
      contractCount: 3,
      totals: {
        totalContractValueUSD: 150000,
        currentBudgetUSD: 50000,
        projectedBudgetUSD: 55000,
      },
      contracts: Array.from({ length: 3 }, (_, i) => ({
        contractId: i + 1,
        vendorName: 'Acme Corp',
        contractType: 'SaaS',
        currency: 'USD',
        totalContractValueUSD: 50000,
        currentBudgetUSD: 16000,
        projectedBudgetUSD: 18000,
        termStartDate: '2025-01-01',
        termEndDate: '2026-01-01',
        products: [],
      })),
      summary: 'Acme Corp has 3 contract(s): Total TCV $150,000',
    };

    const messages: ModelMessage[] = [
      makeUserMessage('what is acme spend?'),
      makeToolMessage('calculate_spend', 'tc-spend', spendOutput),
      makeAssistantMessage('Acme Corp has $150K TCV'),
      makeUserMessage('recent q'),
      makeAssistantMessage('recent a'),
      makeUserMessage('another q'),
      makeAssistantMessage('another a'),
    ];

    const result = compressHistoryMessages(messages, 4);
    const toolMsg = result[1];
    if (
      toolMsg.role === 'tool' &&
      Array.isArray(toolMsg.content) &&
      toolMsg.content[0].type === 'tool-result'
    ) {
      const output = toolMsg.content[0].output as {
        type: string;
        value: string;
      };
      expect(output.value).toContain('calculate_spend');
      expect(output.value).toContain('Acme Corp');
    }
  });

  it('should not re-summarize wrapped string tool outputs', () => {
    const wrappedSummary = {
      type: 'json' as const,
      value: '[Tool: query_clause -> 0 contracts, 0 excerpts]',
    };

    const messages: ModelMessage[] = [
      makeUserMessage("what's my auto renewal exposure?"),
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result' as const,
            toolCallId: 'tc-query',
            toolName: 'query_clause',
            output: wrappedSummary,
          },
        ],
      },
      makeAssistantMessage('No auto-renew contracts found'),
      makeUserMessage('recent q1'),
      makeAssistantMessage('recent a1'),
      makeUserMessage('recent q2'),
      makeAssistantMessage('recent a2'),
    ];

    const result = compressHistoryMessages(messages, 4);

    expect(result[1]).toEqual(messages[1]);
  });
});
