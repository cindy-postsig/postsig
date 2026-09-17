/**
 * @jest-environment jsdom
 */
import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react';

import type { ToolRendererConfig } from '@/components/chatbot/tool-renderers/types';
import {
  TOOL_REGISTRY,
  renderToolFromRegistry,
} from '@/components/chatbot/tool-renderers/render-registry';

jest.mock('@/components/chatbot/SpendSummary', () => ({
  SpendSummary: ({ data }: { data: unknown }) => (
    <div data-testid="spend-summary">{JSON.stringify(data)}</div>
  ),
  SpendSummaryLoading: () => <div data-testid="spend-loading">Loading...</div>,
}));

jest.mock('@/components/chatbot/PaymentTermsSummary', () => ({
  PaymentTermsSummary: ({ data }: { data: unknown }) => (
    <div data-testid="payment-terms-summary">{JSON.stringify(data)}</div>
  ),
  PaymentTermsSummaryLoading: () => (
    <div data-testid="payment-terms-loading">Loading...</div>
  ),
}));

jest.mock('@/components/chatbot/GroupsSummary', () => ({
  GroupsSummary: ({ data }: { data: unknown }) => (
    <div data-testid="groups-summary">{JSON.stringify(data)}</div>
  ),
  GroupsSummaryLoading: () => (
    <div data-testid="groups-loading">Loading...</div>
  ),
}));

jest.mock('@/components/chatbot/TagsSummary', () => ({
  TagsSummary: ({ data }: { data: unknown }) => (
    <div data-testid="tags-summary">{JSON.stringify(data)}</div>
  ),
  TagsSummaryLoading: () => <div data-testid="tags-loading">Loading...</div>,
}));

jest.mock('@/components/chatbot/QueryResultsSummary', () => ({
  QueryResultsSummary: ({ data }: { data: unknown }) => (
    <div data-testid="query-summary">{JSON.stringify(data)}</div>
  ),
  QueryResultsSummaryLoading: () => (
    <div data-testid="query-loading">Loading...</div>
  ),
}));

jest.mock('@/components/chatbot/SynthesisSummary', () => ({
  SynthesisSummary: ({ data }: { data: unknown }) => (
    <div data-testid="synthesis-summary">{JSON.stringify(data)}</div>
  ),
  SynthesisSummaryLoading: () => (
    <div data-testid="synthesis-loading">Loading...</div>
  ),
}));

const EXPECTED_TOOL_NAMES = [
  'tool-calculate_spend',
  'tool-summarize_payment_terms',
  'tool-get_groups',
  'tool-query_tags',
  'tool-synthesize_vendor_intelligence',
  'tool-query_clause',
  'tool-query_billing_frequency',
  'tool-query_usage_restrictions',
  'tool-query_expiring_contracts',
  'tool-query_renewals',
  'tool-query_discounts',
  'tool-query_dora_compliance',
  'tool-query_nda_risk',
  'tool-query_asset_class',
  'tool-query_recent_uploads',
  'tool-query_price_increase',
  'tool-query_unexecuted',
  'tool-query_vendor_statistics',
  'tool-query_seat_utilization',
  'tool-search_contracts',
  'tool-list_contracts',
  'tool-query_annual_increase',
] as const;

const LOADING_STATES = [
  'call',
  'partial-call',
  'input-streaming',
  'input-available',
] as const;

function createMockConfig(
  overrides?: Partial<ToolRendererConfig>,
): ToolRendererConfig {
  return {
    loading: () => <div data-testid="mock-loading">Loading...</div>,
    renderSummary: (data: unknown, key: string) => (
      <div data-testid="mock-summary" key={key}>
        {JSON.stringify(data)}
      </div>
    ),
    errorLabel: 'Something went wrong',
    ...overrides,
  };
}

describe('TOOL_REGISTRY', () => {
  it('should have entries for all expected tool types', () => {
    const registeredNames = Object.keys(TOOL_REGISTRY);

    expect(registeredNames).toHaveLength(EXPECTED_TOOL_NAMES.length);

    for (const name of EXPECTED_TOOL_NAMES) {
      expect(TOOL_REGISTRY).toHaveProperty(name);
    }
  });

  it.each(EXPECTED_TOOL_NAMES)(
    'should have a valid config for %s',
    (toolName) => {
      const config = TOOL_REGISTRY[toolName];

      expect(typeof config.loading).toBe('function');
      expect(typeof config.renderSummary).toBe('function');
      expect(typeof config.errorLabel).toBe('string');
      expect(config.errorLabel.length).toBeGreaterThan(0);
    },
  );
});

describe('renderToolFromRegistry', () => {
  describe.each(LOADING_STATES)('when state is "%s"', (state) => {
    it('should render the loading indicator while loading', () => {
      const config = createMockConfig();
      const result = renderToolFromRegistry(
        config,
        { state },
        'test-key',
        false,
      );

      const { container } = render(<>{result}</>);
      const loadingEl = container.querySelector('[data-testid="mock-loading"]');

      expect(loadingEl).not.toBeNull();
    });
  });

  describe('when state is "output-available"', () => {
    it('should render summary when output is present', () => {
      const outputData = { total: 42, currency: 'USD' };
      const config = createMockConfig();
      const result = renderToolFromRegistry(
        config,
        { state: 'output-available', output: outputData },
        'test-key',
        false,
      );

      const { container } = render(<>{result}</>);
      const summaryEl = container.querySelector('[data-testid="mock-summary"]');

      expect(summaryEl).not.toBeNull();
      expect(summaryEl?.textContent).toBe(JSON.stringify(outputData));
    });

    it('should return null when output contains an error while streaming', () => {
      const config = createMockConfig();
      const result = renderToolFromRegistry(
        config,
        { state: 'output-available', output: { error: 'timeout' } },
        'test-key',
        true,
      );

      expect(result).toBeNull();
    });

    it('should render summary with error output when not streaming', () => {
      const errorOutput = { error: 'timeout' };
      const config = createMockConfig();
      const result = renderToolFromRegistry(
        config,
        { state: 'output-available', output: errorOutput },
        'test-key',
        false,
      );

      const { container } = render(<>{result}</>);
      const summaryEl = container.querySelector('[data-testid="mock-summary"]');

      expect(summaryEl).not.toBeNull();
    });

    it('should return null when output is undefined', () => {
      const config = createMockConfig();
      const result = renderToolFromRegistry(
        config,
        { state: 'output-available' },
        'test-key',
        false,
      );

      expect(result).toBeNull();
    });
  });

  describe('when state is "output-error"', () => {
    it('should render error label when not streaming', () => {
      const config = createMockConfig({ errorLabel: 'Failed to load data' });
      const result = renderToolFromRegistry(
        config,
        { state: 'output-error' },
        'test-key',
        false,
      );

      const { container } = render(<>{result}</>);

      expect(container.textContent).toBe('Failed to load data');
    });

    it('should return null when streaming', () => {
      const config = createMockConfig();
      const result = renderToolFromRegistry(
        config,
        { state: 'output-error' },
        'test-key',
        true,
      );

      expect(result).toBeNull();
    });
  });

  describe('when state is unknown', () => {
    it('should return null for an unrecognized state', () => {
      const config = createMockConfig();
      const result = renderToolFromRegistry(
        config,
        { state: 'some-unknown-state' },
        'test-key',
        false,
      );

      expect(result).toBeNull();
    });
  });
});
