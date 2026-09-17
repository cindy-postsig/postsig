import { describe, expect, it } from '@jest/globals';
import type { UIMessage } from '@ai-sdk/react';

import {
  extractExcerptsFromMessages,
  generateSessionTitle,
} from '@/components/chatbot/postsig-assistant-utils';

function makeAssistantMessage(parts: UIMessage['parts']): UIMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    parts,
  };
}

function asPart(part: unknown): UIMessage['parts'][number] {
  return part as UIMessage['parts'][number];
}

describe('postsig assistant utils', () => {
  it('extracts excerpts from the latest assistant query tool output', () => {
    const excerpts = [
      {
        title: 'Termination',
        contractId: 123,
        vendor: 'Acme',
        content: 'Termination for convenience.',
      },
    ];

    const messages: UIMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'show terms' }],
      },
      makeAssistantMessage([
        asPart({
          type: 'tool-query_clause',
          state: 'output-available',
          output: {
            excerpts: [
              {
                title: 'Old excerpt',
                contractId: 1,
                vendor: 'Old Vendor',
                content: 'old excerpt',
              },
            ],
          },
        }),
      ]),
      makeAssistantMessage([
        asPart({
          type: 'tool-query_clause',
          state: 'output-available',
          output: { excerpts },
        }),
      ]),
    ];

    expect(extractExcerptsFromMessages(messages)).toEqual(excerpts);
  });

  it('returns empty excerpts when query tool output has no excerpts', () => {
    const messages: UIMessage[] = [
      makeAssistantMessage([
        asPart({
          type: 'tool-query_clause',
          state: 'output-available',
          output: { count: 3 },
        }),
      ]),
    ];

    expect(extractExcerptsFromMessages(messages)).toEqual([]);
  });

  it('truncates long session titles and keeps short titles as-is', () => {
    const longPrompt =
      'List every auto-renewal contract and summarize renewal exposure by vendor right now';

    expect(generateSessionTitle('  short title  ')).toBe('short title');
    expect(generateSessionTitle(longPrompt)).toBe(
      'List every auto-renewal contract and summarize ren...',
    );
  });
});
