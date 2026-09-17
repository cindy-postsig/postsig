import { describe, expect, it, jest } from '@jest/globals';
import type { ModelMessage } from 'ai';
import type { JSONValue } from '@ai-sdk/provider';
import { compressToolResults } from '@/lib/v2/chat/history-compression';

jest.mock('@/utils/pino', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUserMsg(text: string): ModelMessage {
  return { role: 'user', content: text };
}

function makeAssistantMsg(text: string): ModelMessage {
  return { role: 'assistant', content: text };
}

function makeToolMsg(
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

/** 9-message conversation: old tool call + 6 recent filler messages. */
function buildConversation(
  toolName: string,
  toolOutput: unknown,
): ModelMessage[] {
  return [
    makeUserMsg('old question'),
    makeToolMsg(toolName, 'tc-old', toolOutput),
    makeAssistantMsg('old answer'),
    makeUserMsg('q2'),
    makeAssistantMsg('a2'),
    makeUserMsg('q3'),
    makeAssistantMsg('a3'),
    makeUserMsg('q4'),
    makeAssistantMsg('a4'),
  ];
}

/** Extract the compressed summary string from the tool message at index 1. */
function extractCompressedValue(messages: ModelMessage[]): string {
  const toolMsg = messages[1];
  if (toolMsg.role !== 'tool' || !Array.isArray(toolMsg.content)) {
    throw new Error('Expected tool message at index 1');
  }
  const part = toolMsg.content[0];
  if (part.type !== 'tool-result') {
    throw new Error('Expected tool-result part');
  }
  const output = part.output as { type: string; value: string };
  return output.value;
}

// ---------------------------------------------------------------------------
// Fixtures — kept outside tests to avoid deep nesting
// ---------------------------------------------------------------------------

const spendTotals = {
  totalContractValueUSD: 2400000,
  currentBudgetUSD: 800000,
  projectedBudgetUSD: 850000,
};

const vendorSpendOutput = {
  type: 'vendor_total' as const,
  vendorName: 'MSCI',
  contractCount: 3,
  totals: spendTotals,
  contracts: [],
  summary: 'MSCI has 3 contract(s): Total TCV $2,400,000',
};

const searchOutput = [
  {
    id: 1,
    vendorName: 'Bloomberg',
    productName: 'Terminal',
    currentSpend: 50000,
    summary: 's',
    termStartDate: '2025-01-01',
    termEndDate: '2026-01-01',
    contractType: 'SaaS',
  },
  {
    id: 2,
    vendorName: 'Bloomberg',
    productName: 'Data',
    currentSpend: 30000,
    summary: 's',
    termStartDate: '2025-03-01',
    termEndDate: '2026-03-01',
    contractType: 'SaaS',
  },
];

const dataQueryOutput = {
  type: 'data_query' as const,
  contracts: [
    { id: 1, vendor: 'Acme', clauseContent: 'clause', contractType: 'SaaS' },
  ],
  excerpts: [
    { title: 'Derived Data', contractId: 1, vendor: 'Acme', content: 'text' },
  ],
};

const paymentOutput = {
  type: 'payment_terms_summary' as const,
  vendorName: 'Acme Corp',
  contractCount: 4,
  lineageGroups: 2,
  contracts: [],
  summary: 'Acme Corp: 4 contracts across 2 lineage groups',
};

const orgGroupsOutput = {
  type: 'org_groups' as const,
  groups: [
    { id: 1, name: 'Sales', memberCount: 5, contractCount: 10 },
    { id: 2, name: 'Engineering', memberCount: 8, contractCount: 15 },
  ],
};

const orgTagsOutput = {
  type: 'org_tags' as const,
  tags: [
    { id: 1, name: 'Critical', contractCount: 5 },
    { id: 2, name: 'Compliance', contractCount: 3 },
  ],
  totalContracts: 50,
};

const contractsArrayOutput = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  vendorName: `Vendor ${i}`,
  data: 'x'.repeat(500),
}));

const largeContractDetail = (i: number) => ({
  contractId: i + 1,
  vendorName: 'MSCI',
  contractType: 'SaaS',
  currency: 'USD',
  totalContractValueUSD: 500000,
  currentBudgetUSD: 150000,
  projectedBudgetUSD: 160000,
  termStartDate: '2025-01-01',
  termEndDate: '2026-12-31',
  products: [{ product_id: 1, name: `Product ${i}`, fees: 50000, year: 2025 }],
});

const largeSpendOutput = {
  type: 'vendor_total' as const,
  vendorName: 'MSCI',
  contractCount: 10,
  totals: {
    totalContractValueUSD: 5000000,
    currentBudgetUSD: 1500000,
    projectedBudgetUSD: 1600000,
  },
  contracts: Array.from({ length: 10 }, (_, i) => largeContractDetail(i)),
  summary: 'MSCI has 10 contracts: Total TCV $5,000,000',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('compressToolResults', () => {
  it('should return messages unchanged when count is 4 or fewer', () => {
    const messages: ModelMessage[] = [
      makeUserMsg('hello'),
      makeAssistantMsg('hi'),
      makeUserMsg('question'),
      makeAssistantMsg('answer'),
    ];
    expect(compressToolResults(messages)).toEqual(messages);
  });

  it('should return empty array for empty input', () => {
    expect(compressToolResults([])).toEqual([]);
  });

  it('should preserve the last 6 messages uncompressed', () => {
    const large = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      vendorName: 'Acme',
      data: 'x'.repeat(200),
    }));
    const messages = buildConversation('search_contracts', large);
    const result = compressToolResults(messages);
    expect(result.slice(-6)).toEqual(messages.slice(-6));
  });

  it('should preserve total message count and role ordering', () => {
    const messages: ModelMessage[] = [
      makeUserMsg('q1'),
      makeToolMsg('search_contracts', 'tc-1', [{ id: 1 }]),
      makeAssistantMsg('a1'),
      makeUserMsg('q2'),
      makeToolMsg('search_contracts', 'tc-2', [{ id: 2 }]),
      makeAssistantMsg('a2'),
      makeUserMsg('q3'),
      makeAssistantMsg('a3'),
    ];
    const result = compressToolResults(messages);
    expect(result.length).toBe(messages.length);
    expect(result.map((m) => m.role)).toEqual([
      'user',
      'tool',
      'assistant',
      'user',
      'tool',
      'assistant',
      'user',
      'assistant',
    ]);
  });

  it('should compress calculate_spend with vendor name', () => {
    const result = compressToolResults(
      buildConversation('calculate_spend', vendorSpendOutput),
    );
    const summary = extractCompressedValue(result);
    expect(summary).toContain('calculate_spend');
    expect(summary).toContain('MSCI');
  });

  it('should compress search_contracts results with count and vendor', () => {
    const result = compressToolResults(
      buildConversation('search_contracts', searchOutput),
    );
    const summary = extractCompressedValue(result);
    expect(summary).toContain('2 contracts found');
    expect(summary).toContain('Bloomberg');
  });

  it('should compress query_clause with count', () => {
    const result = compressToolResults(
      buildConversation('query_clause', dataQueryOutput),
    );
    const summary = extractCompressedValue(result);
    expect(summary).toContain('query_clause');
    expect(summary).toContain('1 contract');
  });

  it('should compress summarize_payment_terms with vendor', () => {
    const result = compressToolResults(
      buildConversation('summarize_payment_terms', paymentOutput),
    );
    const summary = extractCompressedValue(result);
    expect(summary).toContain('summarize_payment_terms');
    expect(summary).toContain('Acme Corp');
  });

  it('should compress get_groups with group count', () => {
    const result = compressToolResults(
      buildConversation('get_groups', orgGroupsOutput),
    );
    const summary = extractCompressedValue(result);
    expect(summary).toContain('get_groups');
    expect(summary).toContain('2 groups');
  });

  it('should compress query_tags with tag count', () => {
    const result = compressToolResults(
      buildConversation('query_tags', orgTagsOutput),
    );
    const summary = extractCompressedValue(result);
    expect(summary).toContain('query_tags');
    expect(summary).toContain('2 tags');
  });

  it('should compress list_contracts results with contract count', () => {
    const result = compressToolResults(
      buildConversation('list_contracts', {
        type: 'list_contracts',
        contracts: contractsArrayOutput,
      }),
    );
    const summary = extractCompressedValue(result);
    expect(summary).toContain('list_contracts');
    expect(summary).toContain('10 contracts returned');
  });

  it('should not compress get_current_date (already small string)', () => {
    const messages = buildConversation(
      'get_current_date',
      '2026-02-26T12:00:00.000Z',
    );
    const result = compressToolResults(messages);
    expect(result[1]).toEqual(messages[1]);
  });

  it('should significantly reduce size of large tool outputs', () => {
    const originalSize = JSON.stringify(largeSpendOutput).length;
    const result = compressToolResults(
      buildConversation('calculate_spend', largeSpendOutput),
    );
    const compressedSize = JSON.stringify(result[1]).length;
    expect(compressedSize).toBeLessThan(originalSize * 0.5);
  });

  it('should compress multiple old tool calls while keeping recent ones', () => {
    const spendFixture = {
      type: 'vendor_total' as const,
      vendorName: 'MSCI',
      contractCount: 1,
      totals: {
        totalContractValueUSD: 100000,
        currentBudgetUSD: 50000,
        projectedBudgetUSD: 55000,
      },
      contracts: [],
      summary: 'MSCI: TCV $100,000',
    };
    const messages: ModelMessage[] = [
      makeUserMsg('tell me about MSCI'),
      makeToolMsg('search_contracts', 'tc-1', [{ id: 1, vendorName: 'MSCI' }]),
      makeToolMsg('calculate_spend', 'tc-2', spendFixture),
      makeAssistantMsg('MSCI has 1 contract worth $100K'),
      makeUserMsg('what about tags?'),
      makeToolMsg('query_tags', 'tc-3', orgTagsOutput),
      makeAssistantMsg('Found 2 tags'),
      makeUserMsg('thanks'),
    ];

    const result = compressToolResults(messages);

    // Old tool messages (indices 1, 2) compressed
    const summary1 = extractCompressedValue(result);
    expect(summary1).toContain('search_contracts');

    // Recent tool message (index 5) unchanged
    expect(result[5]).toEqual(messages[5]);
  });
});
