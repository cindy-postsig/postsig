import { describe, expect, it } from '@jest/globals';
import { runSearchQuery } from '@/lib/v2/chat/tools/queries';
import type { ContractSearchResult, ToolError } from '@/lib/v2/chat/types';
import { SEARCH_RESULT_LIMIT } from '@/lib/v2/chat/constants';

jest.mock('@/utils/pino', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

type ContractMock = Parameters<typeof runSearchQuery>[0][number];

function makeContract(overrides: {
  id: number;
  vendorName?: string;
  typeId?: number;
  products?: string[];
  summary?: string;
}): ContractMock {
  const productDetails = (overrides.products ?? []).map((name) => ({
    vendor_products: { name },
  }));
  return {
    contract: {
      id: overrides.id,
      vendors: { name: overrides.vendorName ?? 'TestVendor' },
      type_id: overrides.typeId ?? 1,
      vendor_products_details: productDetails,
      summary: overrides.summary ?? null,
      term_start_date: [{ date: '2025-01-01' }],
      term_end_date: [{ date: '2026-01-01' }],
    } as ContractMock['contract'],
    products: [],
    priceHistory: null,
  } as unknown as ContractMock;
}

function isToolError(result: unknown): result is ToolError {
  return (
    typeof result === 'object' &&
    result !== null &&
    'error' in result &&
    typeof (result as ToolError).error === 'string'
  );
}

describe('runSearchQuery', () => {
  it('should return all contracts when no filters provided', () => {
    const contracts = [
      makeContract({ id: 1, vendorName: 'Acme' }),
      makeContract({ id: 2, vendorName: 'Beta' }),
    ];
    const result = runSearchQuery(contracts);
    expect(Array.isArray(result)).toBe(true);
    expect((result as ContractSearchResult[]).length).toBe(2);
  });

  it('should filter by contractType', () => {
    const contracts = [
      makeContract({ id: 1, typeId: 1 }),
      makeContract({ id: 2, typeId: 2 }),
      makeContract({ id: 3, typeId: 1 }),
    ];
    const result = runSearchQuery(contracts, 1);
    expect(Array.isArray(result)).toBe(true);
    const results = result as ContractSearchResult[];
    expect(results.length).toBe(2);
    expect(results.map((r) => r.id)).toEqual([1, 3]);
  });

  it('should filter by productName (case-insensitive substring)', () => {
    const contracts = [
      makeContract({ id: 1, products: ['Bloomberg Terminal'] }),
      makeContract({ id: 2, products: ['MSCI Barra'] }),
      makeContract({ id: 3, products: ['Bloomberg Data'] }),
    ];
    const result = runSearchQuery(contracts, undefined, 'bloomberg');
    expect(Array.isArray(result)).toBe(true);
    const results = result as ContractSearchResult[];
    expect(results.length).toBe(2);
    expect(results.map((r) => r.id)).toEqual([1, 3]);
  });

  it('should apply combined contractType and productName filters', () => {
    const contracts = [
      makeContract({ id: 1, typeId: 2, products: ['Terminal'] }),
      makeContract({ id: 2, typeId: 1, products: ['Terminal'] }),
      makeContract({ id: 3, typeId: 2, products: ['Data Feed'] }),
    ];
    const result = runSearchQuery(contracts, 2, 'Terminal');
    expect(Array.isArray(result)).toBe(true);
    const results = result as ContractSearchResult[];
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(1);
  });

  it('should return _NO_RESULTS_ error when no contracts match', () => {
    const contracts = [makeContract({ id: 1, typeId: 1 })];
    const result = runSearchQuery(contracts, 99);
    expect(isToolError(result)).toBe(true);
    expect((result as ToolError).error).toBe('_NO_RESULTS_');
    expect((result as ToolError).noResults).toBe(true);
  });

  it('should include product name in no-results suggestion', () => {
    const contracts = [makeContract({ id: 1 })];
    const result = runSearchQuery(contracts, undefined, 'NonExistent');
    expect(isToolError(result)).toBe(true);
    expect((result as ToolError).suggestion).toContain('NonExistent');
  });

  it('should limit results to SEARCH_RESULT_LIMIT', () => {
    const contracts = Array.from({ length: SEARCH_RESULT_LIMIT + 20 }, (_, i) =>
      makeContract({ id: i + 1 }),
    );
    const result = runSearchQuery(contracts);
    expect(Array.isArray(result)).toBe(true);
    expect((result as ContractSearchResult[]).length).toBe(SEARCH_RESULT_LIMIT);
  });

  it('should map contract fields correctly', () => {
    const contracts = [
      makeContract({
        id: 42,
        vendorName: 'Acme Corp',
        products: ['Widget Pro'],
        summary: 'A test contract',
      }),
    ];
    const result = runSearchQuery(contracts);
    expect(Array.isArray(result)).toBe(true);
    const item = (result as ContractSearchResult[])[0];
    expect(item.id).toBe(42);
    expect(item.vendorName).toBe('Acme Corp');
    expect(item.productName).toBe('Widget Pro');
    expect(item.termStartDate).toBe('2025-01-01');
    expect(item.termEndDate).toBe('2026-01-01');
  });
});

describe('runSearchQuery — cancelled products (PSK-1830)', () => {
  const withIds = (id: number, products: Array<[number, string]>) =>
    ({
      contract: {
        id,
        vendors: { name: 'Acme' },
        type_id: 1,
        vendor_products_details: products.map(([productId, name]) => ({
          product_id: productId,
          vendor_products: { id: productId, name },
        })),
        summary: null,
        term_start_date: [{ date: '2025-01-01' }],
        term_end_date: [{ date: '2026-01-01' }],
      },
      products: [],
      priceHistory: null,
    }) as unknown as ContractMock;

  it('mentions cancelled product names without omitting the contract', () => {
    const contracts = [
      withIds(1, [
        [10, 'Feed A'],
        [11, 'Feed B'],
      ]),
    ];
    const removed = new Map([[1, new Set([10])]]);

    const result = runSearchQuery(
      contracts,
      undefined,
      undefined,
      removed,
    ) as ContractSearchResult[];

    expect(result[0].productName).toBe('Feed A, Feed B');
    expect(result[0].cancelledProductNames).toBe('Feed A');
  });

  it('still returns a contract when searching FOR a cancelled product', () => {
    const contracts = [withIds(1, [[10, 'Feed A']])];
    const removed = new Map([[1, new Set([10])]]);

    const result = runSearchQuery(
      contracts,
      undefined,
      'feed a',
      removed,
    ) as ContractSearchResult[];

    expect(result).toHaveLength(1);
    expect(result[0].cancelledProductNames).toBe('Feed A');
  });

  it('leaves cancelledProductNames undefined with no removals', () => {
    const contracts = [withIds(1, [[10, 'Feed A']])];

    const result = runSearchQuery(contracts) as ContractSearchResult[];

    expect(result[0].cancelledProductNames).toBeUndefined();
  });
});
