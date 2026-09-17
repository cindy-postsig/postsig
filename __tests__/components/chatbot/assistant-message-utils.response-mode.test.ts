import { describe, expect, it } from '@jest/globals';
import type { UIMessage } from '@ai-sdk/react';

import {
  getAssistantResponseMode,
  hasSynthesisText,
} from '@/components/chatbot/assistant-message-utils';

interface ResponseModeFixture {
  question: string;
  expectedMode: 'tool_only' | 'synthesis';
  parts: UIMessage['parts'];
}

function asPart(part: unknown): UIMessage['parts'][number] {
  return part as UIMessage['parts'][number];
}

const FIXTURES: ResponseModeFixture[] = [
  {
    question: 'List expiring contracts in the next 30 days',
    expectedMode: 'tool_only',
    parts: [
      asPart({
        type: 'tool-query_expiring_contracts',
        state: 'output-available',
        output: { count: 3 },
      }),
    ],
  },
  {
    question: 'Compare vendor risk and recommend next steps',
    expectedMode: 'synthesis',
    parts: [
      asPart({
        type: 'tool-query_expiring_contracts',
        state: 'output-available',
        output: { count: 3 },
      }),
      {
        type: 'text',
        text: 'Based on the contracts, prioritize Vendor A for renegotiation.',
      },
    ],
  },
];

describe('assistant response mode contract', () => {
  it.each(FIXTURES)(
    'classifies "$question" as $expectedMode',
    ({ parts, expectedMode }) => {
      expect(getAssistantResponseMode(parts)).toBe(expectedMode);
    },
  );

  it('treats whitespace-only text as tool_only', () => {
    const parts: UIMessage['parts'] = [
      { type: 'text', text: '   ' },
      asPart({
        type: 'tool-query_expiring_contracts',
        state: 'output-available',
        output: { count: 1 },
      }),
    ];

    expect(hasSynthesisText(parts)).toBe(false);
    expect(getAssistantResponseMode(parts)).toBe('tool_only');
  });
});
