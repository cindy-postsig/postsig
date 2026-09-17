import { describe, expect, it } from '@jest/globals';
import { summarizeToolResult } from '@/lib/v2/chat/history/compress-tool-results';
import type {
  VendorTotalSpend,
  SingleContractSpend,
  ContractSearchResult,
  PaymentTermsSummaryResult,
  GroupResult,
  OrgGroupsResult,
  VendorGroupsResult,
  TagsByContractResult,
  OrgTagsResult,
  ContractsByTagResult,
  UntaggedContractsResult,
  DataQueryResult,
  ExpiringContractsResult,
  RenewalsResult,
  PriceIncreaseResult,
  RecentUploadsResult,
} from '@/lib/v2/chat/types';

const MAX_SUMMARY_LENGTH = 200;

function makeIdList(count: number): Array<{ id: number }> {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1 }));
}

function makeVendorTotalSpend(
  overrides: Partial<VendorTotalSpend> = {},
): VendorTotalSpend {
  const defaultTotals = {
    totalContractValueUSD: 150000,
    currentBudgetUSD: 50000,
    projectedBudgetUSD: 55000,
  };
  return {
    type: 'vendor_total',
    vendorName: 'Acme Corp',
    contractCount: 3,
    totals: defaultTotals,
    contracts: [],
    summary:
      'Acme Corp has 3 contract(s): Total TCV $150,000, Current Annual Spend $50,000, Projected Annual Spend $55,000',
    ...overrides,
  };
}

function makeLongVendorSpend(): VendorTotalSpend {
  const name = 'A'.repeat(300);
  const totals = {
    totalContractValueUSD: 9999999,
    currentBudgetUSD: 9999999,
    projectedBudgetUSD: 9999999,
  };
  return makeVendorTotalSpend({
    vendorName: name,
    contractCount: 999,
    totals,
    summary: name + ' has 999 contracts with TCV of $9,999,999',
  });
}

function makeSingleContractSpend(): SingleContractSpend {
  const contract = {
    contractId: 42,
    vendorName: 'Acme Corp',
    contractType: 'SaaS',
    currency: 'USD',
    totalContractValueUSD: 50000,
    currentBudgetUSD: 10000,
    projectedBudgetUSD: 12000,
    termStartDate: '2025-01-01',
    termEndDate: '2026-01-01',
    products: undefined,
  };
  return {
    type: 'single_contract',
    contract,
    summary:
      'Contract "42" with Acme Corp: TCV $50,000, Current Annual $10,000, Projected Annual $12,000',
  };
}

function makeSearchResult(
  overrides: Partial<ContractSearchResult> = {},
): ContractSearchResult {
  return {
    id: 1,
    vendorName: 'Acme',
    productName: 'Widget',
    currentSpend: 5000,
    summary: 'A contract',
    termStartDate: '2025-01-01',
    termEndDate: '2026-01-01',
    contractType: 'SaaS',
    ...overrides,
  };
}

function makeSearchResults(
  count: number,
  vendor = 'Vendor',
): ContractSearchResult[] {
  return Array.from({ length: count }, (_, i) =>
    makeSearchResult({
      id: i + 1,
      vendorName: vendor,
      productName: undefined,
      currentSpend: undefined,
      summary: undefined,
      termStartDate: undefined,
      termEndDate: undefined,
      contractType: undefined,
    }),
  );
}

function makeLongSearchResults(): ContractSearchResult[] {
  return Array.from({ length: 100 }, (_, i) =>
    makeSearchResult({
      id: i + 1000,
      vendorName: 'Very Long Vendor Name Corp International',
      productName: undefined,
      currentSpend: undefined,
      summary: undefined,
      termStartDate: undefined,
      termEndDate: undefined,
      contractType: undefined,
    }),
  );
}

function makeDataQueryResult(): DataQueryResult {
  const contracts = [
    { id: 1, vendor: 'Acme', clauseContent: 'clause...', contractType: 'SaaS' },
  ];
  const excerpts = [
    { title: 'Test', contractId: 1, vendor: 'Acme', content: 'content...' },
  ];
  return { type: 'data_query', contracts, excerpts };
}

function makeExpiringResult(): ExpiringContractsResult {
  return { count: 5, totalTCV: 200000, contracts: [] };
}

function makeRenewalsResult(): RenewalsResult {
  return { count: 3, totalRenewalExposure: 80000, contracts: [] };
}

function makePriceIncreaseResult(): PriceIncreaseResult {
  return {
    type: 'price_increase',
    count: 4,
    totalIncreaseUSD: 25000,
    contracts: [],
  };
}

function makeRecentUploadsResult(): RecentUploadsResult {
  return { count: 2, contracts: [] };
}

function makePaymentTermsResult(
  overrides: Partial<PaymentTermsSummaryResult> = {},
): PaymentTermsSummaryResult {
  return {
    type: 'payment_terms_summary',
    vendorName: 'Acme Corp',
    contractCount: 4,
    lineageGroups: 2,
    contracts: [],
    summary: 'Acme Corp: 4 contracts across 2 lineage groups',
    ...overrides,
  };
}

function makeGroupResult(): GroupResult {
  return {
    type: 'group_contracts',
    groupId: 10,
    groupName: 'Engineering',
    memberCount: 5,
    contractCount: 12,
    contracts: [],
  };
}

function makeOrgGroupsResult(): OrgGroupsResult {
  const groups = [
    { id: 1, name: 'A', memberCount: 3, contractCount: 5 },
    { id: 2, name: 'B', memberCount: 2, contractCount: 8 },
  ];
  return { type: 'org_groups', groups };
}

function makeVendorGroupsResult(): VendorGroupsResult {
  const groups = [{ id: 1, name: 'G1', permission: 'read' as const }];
  return { type: 'vendor_groups', vendorName: 'Acme', groups };
}

function makeTagsByContractResult(): TagsByContractResult {
  const tag = { id: 1, name: 'important' };
  const contracts = [
    { contractId: 1, vendorName: 'V1', contractType: 'SaaS', tags: [tag] },
  ];
  return { type: 'contract_tags', contracts };
}

function makeOrgTagsResult(): OrgTagsResult {
  const tags = [{ id: 1, name: 'critical', contractCount: 5 }];
  return { type: 'org_tags', tags, totalContracts: 100 };
}

function makeContractsByTagResult(): ContractsByTagResult {
  const contracts = [
    { contractId: 1, vendorName: 'V1', contractType: 'SaaS', summary: 'test' },
  ];
  return { type: 'contracts_by_tag', tagName: 'critical', contracts };
}

function makeUntaggedContractsResult(): UntaggedContractsResult {
  return { type: 'untagged_contracts', count: 15, contracts: [] };
}

describe('summarizeToolResult', () => {
  it('handles null output', () => {
    expect(summarizeToolResult('any_tool', null)).toBe(
      '[Tool: any_tool -> no output]',
    );
  });

  it('handles undefined output', () => {
    expect(summarizeToolResult('any_tool', undefined)).toBe(
      '[Tool: any_tool -> no output]',
    );
  });

  it('summarizes tool errors', () => {
    const error = { error: 'No contracts found', noResults: true };
    const result = summarizeToolResult('search_contracts', error);
    expect(result).toContain('error: No contracts found');
    expect(result.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH);
  });

  it('handles spend errors', () => {
    const error = {
      error: 'No matching vendor',
      noResults: true,
      searchedBy: 'vendor' as const,
      searchTerm: 'Acme',
    };
    const result = summarizeToolResult('calculate_spend', error);
    expect(result).toContain('error: No matching vendor');
  });

  it('summarizes vendor total spend using summary', () => {
    const result = summarizeToolResult(
      'calculate_spend',
      makeVendorTotalSpend(),
    );
    expect(result).toContain('Acme Corp');
    expect(result).toContain('$150,000');
    expect(result.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH);
  });

  it('summarizes single contract spend', () => {
    const result = summarizeToolResult(
      'calculate_spend',
      makeSingleContractSpend(),
    );
    expect(result).toContain('Acme Corp');
    expect(result.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH);
  });

  it('falls back to type fields when no summary', () => {
    const output = makeVendorTotalSpend({ summary: undefined });
    const result = summarizeToolResult('calculate_spend', output);
    expect(result).toContain('Acme Corp');
    expect(result).toContain('150000');
  });

  it('summarizes search results with vendor and IDs', () => {
    const output = [
      makeSearchResult({ id: 1, vendorName: 'Acme' }),
      makeSearchResult({ id: 2, vendorName: 'Acme' }),
    ];
    const result = summarizeToolResult('search_contracts', output);
    expect(result).toContain('2 contracts found');
    expect(result).toContain("for 'Acme'");
    expect(result).toContain('IDs: 1,2');
    expect(result.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH);
  });

  it('handles empty array results', () => {
    const result = summarizeToolResult('search_contracts', []);
    expect(result).toBe('[Tool: search_contracts -> 0 results]');
  });

  it('summarizes list_contracts results', () => {
    const contracts = makeIdList(3);
    const output = { type: 'list_contracts', contracts };
    const result = summarizeToolResult('list_contracts', output);
    expect(result).toContain('3 contracts returned');
    expect(result.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH);
  });

  it('limits search IDs to first 5', () => {
    const result = summarizeToolResult(
      'search_contracts',
      makeSearchResults(8),
    );
    expect(result).toContain('8 contracts found');
    expect(result).toContain('IDs: 1,2,3,4,5...');
  });

  it('summarizes data_query results', () => {
    const result = summarizeToolResult('query_clause', makeDataQueryResult());
    expect(result).toContain('1 contract');
    expect(result).toContain('1 excerpt');
  });

  it('summarizes expiring results', () => {
    const result = summarizeToolResult(
      'query_expiring_contracts',
      makeExpiringResult(),
    );
    expect(result).toContain('5 results');
  });

  it('summarizes renewal results', () => {
    const result = summarizeToolResult('query_renewals', makeRenewalsResult());
    expect(result).toContain('3 results');
  });

  it('summarizes price_increase results', () => {
    const result = summarizeToolResult(
      'query_price_increase',
      makePriceIncreaseResult(),
    );
    expect(result).toContain('4 contracts');
  });

  it('summarizes generic array results', () => {
    const output = makeIdList(3);
    const result = summarizeToolResult('query_discounts', output);
    expect(result).toContain('3 results');
  });

  it('does not crash on pre-summarized text output', () => {
    const text = '[Tool: query_clause -> 0 contracts, 0 excerpts]';
    const result = summarizeToolResult('query_clause', text);
    expect(result).toContain('query_clause');
    expect(result.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH);
  });

  it('handles recent_uploads results', () => {
    const result = summarizeToolResult(
      'query_recent_uploads',
      makeRecentUploadsResult(),
    );
    expect(result).toContain('2 results');
  });

  it('uses existing payment terms summary', () => {
    const result = summarizeToolResult(
      'summarize_payment_terms',
      makePaymentTermsResult(),
    );
    expect(result).toContain('Acme Corp: 4 contracts');
    expect(result.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH);
  });

  it('falls back to structured payment terms summary', () => {
    const output = makePaymentTermsResult({ summary: undefined });
    const result = summarizeToolResult('summarize_payment_terms', output);
    expect(result).toContain('Acme Corp');
    expect(result).toContain('4 contracts');
    expect(result).toContain('2 groups');
  });

  it('summarizes group_contracts result', () => {
    const result = summarizeToolResult('get_groups', makeGroupResult());
    expect(result).toContain("'Engineering'");
    expect(result).toContain('12 contracts');
    expect(result).toContain('5 members');
  });

  it('summarizes org_groups result', () => {
    const result = summarizeToolResult('get_groups', makeOrgGroupsResult());
    expect(result).toContain('org_groups');
    expect(result).toContain('2 groups');
  });

  it('summarizes vendor_groups result', () => {
    const result = summarizeToolResult('get_groups', makeVendorGroupsResult());
    expect(result).toContain("vendor 'Acme'");
    expect(result).toContain('1 group');
  });

  it('summarizes contract_tags result', () => {
    const result = summarizeToolResult(
      'query_tags',
      makeTagsByContractResult(),
    );
    expect(result).toContain('contract_tags');
    expect(result).toContain('1 contract');
  });

  it('summarizes org_tags result', () => {
    const result = summarizeToolResult('query_tags', makeOrgTagsResult());
    expect(result).toContain('org_tags');
    expect(result).toContain('1 tag');
    expect(result).toContain('100 contracts');
  });

  it('summarizes contracts_by_tag result', () => {
    const result = summarizeToolResult(
      'query_tags',
      makeContractsByTagResult(),
    );
    expect(result).toContain("'critical'");
    expect(result).toContain('1 contract');
  });

  it('summarizes untagged_contracts result', () => {
    const result = summarizeToolResult(
      'query_tags',
      makeUntaggedContractsResult(),
    );
    expect(result).toContain('untagged_contracts');
    expect(result).toContain('15 contracts');
  });

  it('passes through date string unchanged', () => {
    const output = '2026-02-17T12:00:00.000Z';
    expect(summarizeToolResult('get_current_date', output)).toBe(output);
  });

  it('produces a fallback for unknown tools', () => {
    const output = { some: 'data', value: 123 };
    const result = summarizeToolResult('unknown_tool', output);
    expect(result).toContain('unknown_tool');
    expect(result).toContain('chars');
    expect(result.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH);
  });

  it('never exceeds 200 chars for long vendor spend', () => {
    const result = summarizeToolResult(
      'calculate_spend',
      makeLongVendorSpend(),
    );
    expect(result.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH);
  });

  it('never exceeds 200 chars for search with many IDs', () => {
    const result = summarizeToolResult(
      'search_contracts',
      makeLongSearchResults(),
    );
    expect(result.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH);
  });
});
