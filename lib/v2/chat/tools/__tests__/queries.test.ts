import { describe, expect, it } from '@jest/globals';

import { runSearchQuery } from '@/lib/v2/chat/tools/queries/search';
import type { ToolError } from '@/lib/v2/chat/types';
import { isToolError } from '@/lib/v2/chat/types';

type ContractsListItem = Parameters<typeof runSearchQuery>[0][number];

function makeContract(
  overrides: Partial<Record<string, unknown>> = {},
): ContractsListItem {
  return {
    contract: {
      id: 1,
      type_id: 1,
      vendor_id: 1,
      vendors: { name: 'Test Vendor' },
      vendor_products_details: [],
      ...overrides,
    },
    products: [],
    priceHistory: null,
  } as unknown as ContractsListItem;
}

describe('runSearchQuery', () => {
  it('returns ToolError with noResults when no contracts match', () => {
    const result = runSearchQuery([], undefined, 'nonexistent');

    expect(isToolError(result)).toBe(true);
    const error = result as ToolError;
    expect(error.noResults).toBe(true);
    expect(error.suggestion).toBeDefined();
  });

  it('returns contract results when matches are found', () => {
    const contracts = [makeContract()];
    const result = runSearchQuery(contracts);

    expect(isToolError(result)).toBe(false);
    expect(Array.isArray(result)).toBe(true);
  });
});
