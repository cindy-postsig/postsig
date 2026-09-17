/**
 * @jest-environment jsdom
 */
import { describe, expect, it, beforeEach } from '@jest/globals';
import { render } from '@testing-library/react';
import React from 'react';
import type { UIMessage } from '@ai-sdk/react';

import { AssistantMessage } from '@/components/chatbot/AssistantMessage';
import { getAssistantResponseMode } from '@/components/chatbot/assistant-message-utils';

const mockRenderToolFromRegistry = jest.fn();

jest.mock('@/components/chatbot/tool-renderers', () => ({
  TOOL_REGISTRY: {
    'tool-query_expiring_contracts': {
      loading: () => null,
      renderSummary: () => null,
      errorLabel: 'Error querying contracts',
    },
  },
  renderToolFromRegistry: (...args: unknown[]) =>
    mockRenderToolFromRegistry(...args),
}));

jest.mock('@/components/chatbot/LazyMarkdown', () => ({
  LazyMarkdown: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="markdown">{children}</div>
  ),
}));

jest.mock('@/components/chatbot/ContractLink', () => ({
  ContractLink: ({ children }: { children: React.ReactNode }) => (
    <a href="/contracts/mock">{children}</a>
  ),
}));

jest.mock('@/components/chatbot/VendorLink', () => ({
  VendorLink: ({ children }: { children: React.ReactNode }) => (
    <a href="/vendors/mock">{children}</a>
  ),
}));

jest.mock('@/components/chatbot/MarkdownDataTable', () => ({
  MarkdownDataTable: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

type Fixture = {
  question: string;
  expectedMode: 'tool_only' | 'synthesis';
  expectedToolSummary: boolean;
  expectedText: string | null;
  message: UIMessage;
};

function asPart(part: unknown): UIMessage['parts'][number] {
  return part as UIMessage['parts'][number];
}

const TOOL_OUTPUT_PART = asPart({
  type: 'tool-query_expiring_contracts',
  state: 'output-available',
  output: { count: 2 },
});

const FIXTURES: Fixture[] = [
  {
    question: 'Show expiring contracts',
    expectedMode: 'tool_only',
    expectedToolSummary: true,
    expectedText: null,
    message: {
      id: 'tool-only-message',
      role: 'assistant',
      parts: [TOOL_OUTPUT_PART],
    },
  },
  {
    question: 'Compare risk and recommend actions',
    expectedMode: 'synthesis',
    expectedToolSummary: false,
    expectedText: 'Prioritize Vendor A based on renewal and liability risk.',
    message: {
      id: 'synthesis-message',
      role: 'assistant',
      parts: [
        TOOL_OUTPUT_PART,
        {
          type: 'text',
          text: 'Prioritize Vendor A based on renewal and liability risk.',
        },
      ],
    },
  },
];

describe('AssistantMessage response mode rendering', () => {
  beforeEach(() => {
    mockRenderToolFromRegistry.mockReset();
    mockRenderToolFromRegistry.mockImplementation(
      (_config, toolPart: { state: string }, key: string) => {
        if (toolPart.state !== 'output-available') return null;
        return (
          <div key={key} data-testid="tool-summary">
            Tool summary card
          </div>
        );
      },
    );
  });

  it.each(FIXTURES)(
    'renders expected UI for "$question" ($expectedMode)',
    ({ message, expectedMode, expectedToolSummary, expectedText }) => {
      expect(getAssistantResponseMode(message.parts)).toBe(expectedMode);

      const { container } = render(
        <AssistantMessage message={message} isActivelyStreaming={false} />,
      );

      const toolSummary = container.querySelector(
        '[data-testid="tool-summary"]',
      );
      if (expectedToolSummary) {
        expect(toolSummary).not.toBeNull();
      } else {
        expect(toolSummary).toBeNull();
      }

      if (expectedText) {
        expect(container.textContent).toContain(expectedText);
      }
    },
  );

  it('does not invoke tool renderer when synthesis text is present', () => {
    const synthesisMessage: UIMessage = {
      id: 'synthesis-only',
      role: 'assistant',
      parts: [
        TOOL_OUTPUT_PART,
        { type: 'text', text: 'Synthesis response takes precedence.' },
      ],
    };

    render(
      <AssistantMessage
        message={synthesisMessage}
        isActivelyStreaming={false}
      />,
    );

    expect(mockRenderToolFromRegistry).toHaveBeenCalledTimes(0);
  });

  it('renders neutral empty state for noResults ToolError, not red label', () => {
    const noResultsErrorPart = asPart({
      type: 'tool-query_expiring_contracts',
      state: 'output-available',
      output: { error: '_NO_RESULTS_', noResults: true },
    });

    const message: UIMessage = {
      id: 'no-results-message',
      role: 'assistant',
      parts: [noResultsErrorPart],
    };

    mockRenderToolFromRegistry.mockImplementation(
      (
        _config: unknown,
        toolPart: { state: string; output?: unknown },
        key: string,
      ) => {
        if (toolPart.state !== 'output-available') return null;
        const output = toolPart.output as Record<string, unknown> | undefined;
        if (output && 'error' in output && output.noResults) {
          return (
            <div key={key} data-testid="neutral-empty-state">
              No matching contracts found.
            </div>
          );
        }
        return null;
      },
    );

    const { container } = render(
      <AssistantMessage message={message} isActivelyStreaming={false} />,
    );

    const neutralState = container.querySelector(
      '[data-testid="neutral-empty-state"]',
    );
    expect(neutralState).not.toBeNull();

    const redLabel = container.querySelector('.text-red-500, .text-red-600');
    expect(redLabel).toBeNull();
  });

  it('renders red label for output-error state', () => {
    const errorPart = asPart({
      type: 'tool-query_expiring_contracts',
      state: 'output-error',
    });

    const message: UIMessage = {
      id: 'error-message',
      role: 'assistant',
      parts: [errorPart],
    };

    mockRenderToolFromRegistry.mockImplementation(
      (_config: unknown, toolPart: { state: string }, key: string) => {
        if (toolPart.state === 'output-error') {
          return (
            <div key={key} className="text-sm text-red-500">
              Error querying contracts
            </div>
          );
        }
        return null;
      },
    );

    const { container } = render(
      <AssistantMessage message={message} isActivelyStreaming={false} />,
    );

    const redLabel = container.querySelector('.text-red-500');
    expect(redLabel).not.toBeNull();
    expect(redLabel?.textContent).toContain('Error querying contracts');
  });
});
