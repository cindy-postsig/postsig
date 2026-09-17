import { describe, expect, it } from '@jest/globals';
import type { UIMessage } from 'ai';

import {
  extractToolPartsFromMessage,
  getTextFromMessage,
  reconstructMessageParts,
  toUIMessage,
} from '@/lib/v2/chat/persistence/ui-messages';
import type { ChatMessage } from '@/lib/v2/chat/persistence';

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

describe('chat ui-message serialization', () => {
  it('extracts only completed tool outputs for persistence', () => {
    const message = makeAssistantMessage([
      { type: 'text', text: 'Here is the result' },
      asPart({
        type: 'tool-query_clause',
        state: 'call',
        toolCallId: 'call-1',
        toolName: 'query_clause',
        args: { clause: 'termination' },
      }),
      asPart({
        type: 'tool-query_clause',
        state: 'output-available',
        toolCallId: 'call-2',
        toolName: 'query_clause',
        args: { clause: 'liability' },
        output: { count: 2 },
      }),
    ]);

    expect(extractToolPartsFromMessage(message)).toEqual([
      {
        type: 'tool-query_clause',
        state: 'output-available',
        toolCallId: 'call-2',
        toolName: 'query_clause',
        args: { clause: 'liability' },
        output: { count: 2 },
      },
    ]);
  });

  it('reads AI SDK v6 tool inputs from `input` when `args` is absent', () => {
    const message = makeAssistantMessage([
      asPart({
        type: 'tool-get_spend',
        state: 'output-available',
        toolCallId: 'c1',
        toolName: 'get_spend',
        input: { vendor: 'AWS' },
        output: { total: 1 },
      }),
    ]);

    expect(extractToolPartsFromMessage(message)[0].args).toEqual({
      vendor: 'AWS',
    });
  });

  it('reconstructs message parts from text + stored tool metadata', () => {
    const parts = reconstructMessageParts('Synthesis answer', {
      toolParts: [
        {
          type: 'tool-synthesize_vendor_intelligence',
          state: 'output-available',
          toolCallId: 'synth-1',
          toolName: 'synthesize_vendor_intelligence',
          args: { vendorName: 'Acme' },
          output: { vendorName: 'Acme', executiveSummary: 'Strong leverage' },
        },
      ],
    });

    expect(parts).toEqual([
      { type: 'text', text: 'Synthesis answer' },
      {
        type: 'tool-synthesize_vendor_intelligence',
        state: 'output-available',
        toolCallId: 'synth-1',
        toolName: 'synthesize_vendor_intelligence',
        args: { vendorName: 'Acme' },
        output: { vendorName: 'Acme', executiveSummary: 'Strong leverage' },
      },
    ]);
  });

  it('returns an empty text part when both content and metadata are missing', () => {
    expect(reconstructMessageParts('', null)).toEqual([
      { type: 'text', text: '' },
    ]);
  });

  it('round-trips synthesis context while excluding unfinished tools', () => {
    const original = makeAssistantMessage([
      { type: 'text', text: 'Here is the synthesized answer.' },
      asPart({
        type: 'tool-query_clause',
        state: 'output-available',
        toolCallId: 'search-1',
        toolName: 'query_clause',
        args: { vendorName: 'Acme' },
        output: [{ id: 101, vendorName: 'Acme' }],
      }),
      asPart({
        type: 'tool-synthesize_vendor_intelligence',
        state: 'input-streaming',
      }),
    ]);

    const persistedToolParts = extractToolPartsFromMessage(original);
    const reconstructed = reconstructMessageParts(
      'Here is the synthesized answer.',
      { toolParts: persistedToolParts },
    );

    expect(persistedToolParts).toHaveLength(1);
    expect(reconstructed).toEqual([
      { type: 'text', text: 'Here is the synthesized answer.' },
      {
        type: 'tool-query_clause',
        state: 'output-available',
        toolCallId: 'search-1',
        toolName: 'query_clause',
        args: { vendorName: 'Acme' },
        output: [{ id: 101, vendorName: 'Acme' }],
      },
    ]);
  });

  it('maps a stored row to a UI message', () => {
    const row: ChatMessage = {
      id: 42,
      session_id: 7,
      role: 'assistant',
      content: 'Answer',
      metadata: {
        toolParts: [
          {
            type: 'tool-get_spend',
            state: 'output-available',
            toolCallId: 'c1',
            toolName: 'get_spend',
            args: { vendor: 'AWS' },
            output: { total: 1 },
          },
        ],
      },
      created_at: '2026-09-11T00:00:00Z',
    };

    expect(toUIMessage(row)).toEqual({
      id: '42',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Answer' },
        {
          type: 'tool-get_spend',
          state: 'output-available',
          toolCallId: 'c1',
          toolName: 'get_spend',
          args: { vendor: 'AWS' },
          output: { total: 1 },
        },
      ],
    });
  });

  it('joins the non-blank text parts of a message', () => {
    const message = makeAssistantMessage([
      { type: 'text', text: 'One' },
      { type: 'text', text: '   ' },
      asPart({ type: 'tool-get_spend', state: 'output-available' }),
      { type: 'text', text: 'Two' },
    ]);

    expect(getTextFromMessage(message)).toBe('One\n\nTwo');
  });
});
