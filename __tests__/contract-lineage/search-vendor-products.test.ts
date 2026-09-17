import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

interface CurrentVendorRow {
  original_vendor_id: number | null;
  current_vendor_id: number | null;
}

interface CorporateActionRow {
  primary_vendor_id: number | null;
  secondary_vendor_id: number | null;
}

interface VendorProductRow {
  id: number;
  name: string;
  vendor_id: number;
  created_at: string;
}

let mockViewRows: CurrentVendorRow[] = [];
let mockCorpRows: CorporateActionRow[] = [];
let mockProductRows: VendorProductRow[] = [];
let mockViewError: { message: string } | null = null;
const productFilters: { column: string; values: number[] }[] = [];

function viewResult(column: string, values: number[]) {
  if (mockViewError) {
    return Promise.resolve({ data: null, error: mockViewError });
  }
  const data = mockViewRows.filter((row) =>
    values.includes(row[column as keyof CurrentVendorRow] as number),
  );
  return Promise.resolve({ data, error: null });
}

function corpResult(expression: string) {
  const ids = (expression.match(/\(([^)]*)\)/)?.[1] ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number);
  const touches = (row: CorporateActionRow) =>
    (row.primary_vendor_id != null && ids.includes(row.primary_vendor_id)) ||
    (row.secondary_vendor_id != null && ids.includes(row.secondary_vendor_id));
  return Promise.resolve({ data: mockCorpRows.filter(touches), error: null });
}

function productResult(column: string, values: number[]) {
  productFilters.push({ column, values });
  const data = mockProductRows.filter((row) =>
    values.includes(row[column as keyof VendorProductRow] as number),
  );
  return Promise.resolve({ data, error: null });
}

const currentVendorsHandler = {
  select: () => ({
    eq: (column: string, value: number) => viewResult(column, [value]),
    in: (column: string, values: number[]) => viewResult(column, values),
  }),
};

const corporateActionsHandler = {
  select: () => ({ or: corpResult }),
};

const vendorProductsHandler = {
  select: () => ({
    in: (column: string, values: number[]) => productResult(column, values),
  }),
};

const tableHandlers: Record<string, unknown> = {
  current_vendors: currentVendorsHandler,
  corporate_actions: corporateActionsHandler,
  vendor_products: vendorProductsHandler,
};

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({
    from: (table: string) => tableHandlers[table],
  }),
}));

import { searchVendorProducts } from '@/data/superuser/vendors';

const lineage = (
  originalId: number,
  canonicalId: number,
): CurrentVendorRow => ({
  original_vendor_id: originalId,
  current_vendor_id: canonicalId,
});

const corpPair = (
  primaryId: number | null,
  secondaryId: number | null,
): CorporateActionRow => ({
  primary_vendor_id: primaryId,
  secondary_vendor_id: secondaryId,
});

const product = (
  id: number,
  vendorId: number,
  name: string,
  createdAt = '2025-01-01T00:00:00Z',
): VendorProductRow => ({
  id,
  name,
  vendor_id: vendorId,
  created_at: createdAt,
});

describe('searchVendorProducts', () => {
  beforeEach(() => {
    mockViewRows = [];
    mockCorpRows = [];
    mockProductRows = [];
    mockViewError = null;
    productFilters.length = 0;
  });

  it('finds a product under the vendor itself', async () => {
    mockViewRows = [lineage(1, 1)];
    mockProductRows = [product(10, 1, 'Sales Cloud')];

    const match = await searchVendorProducts(1, 'Sales Cloud');

    expect(match?.id).toBe(10);
  });

  it('finds a product under a merged sibling vendor', async () => {
    // Vendor 2 (acquired) merged into vendor 1; the product predates the merge.
    mockViewRows = [lineage(1, 1), lineage(2, 1)];
    mockProductRows = [product(20, 2, 'Sales Cloud')];

    const match = await searchVendorProducts(1, 'Sales Cloud');

    expect(match?.id).toBe(20);
  });

  it('finds a product under a corp-action partner vendor', async () => {
    // The original bug: invoice under acquirer 1, parent contract's product
    // under partner 5 — linked only by a corporate_actions row.
    mockViewRows = [lineage(1, 1), lineage(5, 5)];
    mockCorpRows = [corpPair(1, 5)];
    mockProductRows = [product(50, 5, 'Sales Cloud')];

    const match = await searchVendorProducts(1, 'Sales Cloud');

    expect(match?.id).toBe(50);
  });

  it("prefers the vendor's own row on a cross-family name collision", async () => {
    mockViewRows = [lineage(1, 1), lineage(2, 1)];
    mockProductRows = [
      product(20, 2, 'Sales Cloud', '2024-01-01T00:00:00Z'),
      product(10, 1, 'Sales Cloud', '2025-06-01T00:00:00Z'),
    ];

    const match = await searchVendorProducts(1, 'Sales Cloud');

    expect(match?.id).toBe(10);
  });

  it('prefers the oldest row among sibling vendors', async () => {
    // Neither row belongs to the searching vendor; the older one is the
    // original the other was forked from.
    mockViewRows = [lineage(1, 1), lineage(2, 1), lineage(3, 1)];
    mockProductRows = [
      product(30, 3, 'Sales Cloud', '2025-06-01T00:00:00Z'),
      product(20, 2, 'Sales Cloud', '2024-01-01T00:00:00Z'),
    ];

    const match = await searchVendorProducts(1, 'Sales Cloud');

    expect(match?.id).toBe(20);
  });

  it('queries products across the whole family id set', async () => {
    mockViewRows = [lineage(1, 1), lineage(2, 1)];
    mockCorpRows = [corpPair(1, 5)];
    mockViewRows.push(lineage(5, 5));

    await searchVendorProducts(1, 'Sales Cloud');

    expect(productFilters).toHaveLength(1);
    expect(productFilters[0].column).toBe('vendor_id');
    expect(productFilters[0].values).toEqual(expect.arrayContaining([1, 2, 5]));
  });

  it('returns undefined when no family product matches', async () => {
    mockViewRows = [lineage(1, 1)];
    mockProductRows = [product(10, 1, 'Marketing Cloud')];

    await expect(
      searchVendorProducts(1, 'Sales Cloud'),
    ).resolves.toBeUndefined();
  });

  it('propagates a family-expansion failure instead of degrading to one vendor', async () => {
    mockViewError = { message: 'connection reset' };

    await expect(searchVendorProducts(1, 'Sales Cloud')).rejects.toThrow(
      'Failed to expand vendor lineage',
    );
  });
});
