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

const mockLogAlert = jest.fn();
jest.mock('@/utils/logging/alert', () => ({
  __esModule: true,
  logAlert: (...args: unknown[]) => mockLogAlert(...args),
}));

interface ProductRow {
  id: number;
  name: string;
  product_code: string | null;
  vendor_id?: number;
  created_at?: string;
}

let productRows: ProductRow[] = [];
let insertedRows: Record<string, unknown>[] = [];
/** Rows for the merge-lineage view; empty means the vendor has no merge family. */
let currentVendorRows: Record<string, unknown>[] = [];
/** Rows for corporate actions; empty means no acquisition partners. */
let corporateActionRows: Record<string, unknown>[] = [];

/**
 * Minimal chainable PostgREST stub, keyed by table so the real
 * `expandVendorLineageIds` path runs rather than being mocked out: it queries
 * `current_vendors` and `corporate_actions` before the product lookup, and
 * feeding it product rows for those tables would corrupt the family it derives.
 */
function makeBuilder(table: string) {
  const rowsFor = () => {
    if (table === 'vendor_products') {
      // Defaults let a test declare only what it cares about; the family-ordering
      // sort in searchVendorProducts needs both fields on every row.
      return productRows.map((row) => ({
        vendor_id: VENDOR_ID,
        created_at: '2024-01-01T00:00:00Z',
        ...row,
      }));
    }
    if (table === 'current_vendors') return currentVendorRows;
    if (table === 'corporate_actions') return corporateActionRows;
    return [];
  };

  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    or: () => builder,
    insert: (payload: Record<string, unknown>) => {
      insertedRows.push(payload);
      return builder;
    },
    single: () =>
      Promise.resolve({
        data: { id: 999, ...insertedRows[insertedRows.length - 1] },
        error: null,
      }),
    then: (fn: (v: unknown) => unknown) => fn({ data: rowsFor(), error: null }),
  };
  return builder;
}

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({ from: (table: string) => makeBuilder(table) }),
}));

import {
  searchVendorProducts,
  createVendorProduct,
} from '@/data/superuser/vendors';

const VENDOR_ID = 42;

beforeEach(() => {
  productRows = [];
  insertedRows = [];
  currentVendorRows = [];
  corporateActionRows = [];
  mockLogAlert.mockClear();
});

/**
 * Euronext product descriptions differ only by market and level, so the
 * name matcher's word-overlap tier readily conflates two distinct products.
 * The Exchange Agreement Product Code is unique per vendor, which is why it has
 * to win over every name tier.
 */
describe('searchVendorProducts with a product code', () => {
  it('matches on the code even when another product is the better name match', async () => {
    productRows = [
      {
        id: 1,
        name: 'ENX Continental Cash L2-ND Trading Platform Cat. A-Rest-Base',
        product_code: 'ECB10-TPLNDRUA',
      },
      {
        id: 2,
        name: 'ENX Milan AFF L2-ND Trading Platform Cat. A-Rest -Base',
        product_code: 'MAFFL2-TPLNDRUA',
      },
    ];

    // The requested name is an exact match for row 1, but the code says row 2.
    const match = await searchVendorProducts(
      VENDOR_ID,
      'ENX Continental Cash L2-ND Trading Platform Cat. A-Rest-Base',
      'MAFFL2-TPLNDRUA',
    );

    expect(match?.id).toBe(2);
  });

  it('falls back to the name when the code is not on file yet', async () => {
    productRows = [
      {
        id: 7,
        name: 'ENX Dublin Equities L2-NonDisplay Broking/Agents Basic',
        product_code: null,
      },
    ];

    const match = await searchVendorProducts(
      VENDOR_ID,
      'ENX Dublin Equities L2-NonDisplay Broking/Agents Basic',
      'DEQL2-BANDRU',
    );

    expect(match?.id).toBe(7);
    expect(mockLogAlert).not.toHaveBeenCalled();
  });

  /**
   * Euronext reissues its EMDA product codes — a transposition table takes effect
   * 1 October 2026 and only 127 of ~700 codes survive it. After a reissue the
   * stored product holds the old code while the document carries the new one, and
   * the name still matches exactly. Refusing that match would fork a duplicate
   * product for every reissued line, which is what this column exists to prevent.
   */
  it('links an exact name match whose code changed, reporting it as a reissue', async () => {
    productRows = [
      {
        id: 3,
        name: 'ENX Milan AFF L2 - NonDisplay Other Use - Restricted Basic',
        product_code: 'MAFFL2-OUNDRU',
      },
    ];

    const match = await searchVendorProducts(
      VENDOR_ID,
      'ENX Milan AFF L2 - NonDisplay Other Use - Restricted Basic',
      'MAFFL2-OUNDRUNEW',
    );

    expect(match?.id).toBe(3);
    expect(mockLogAlert).toHaveBeenCalledWith(
      'vendor-product-code-conflict',
      undefined,
      expect.objectContaining({
        requestedCode: 'MAFFL2-OUNDRUNEW',
        matchedCode: 'MAFFL2-OUNDRU',
        tier: 'exact',
        resolution: 'matched-as-reissue',
      }),
      expect.stringMatching(/reissue/i),
    );
  });

  // Below the exact tier the name is only a guess, so a code disagreement is
  // taken at face value: these are two different products, not one renamed.
  it('refuses a weaker name match that carries a different code', async () => {
    productRows = [
      {
        id: 4,
        name: 'ENX Milan AFF L2 NonDisplay Other Use Restricted Basic Extra Words Here',
        product_code: 'MAFFL2-OUNDRU',
      },
    ];

    const match = await searchVendorProducts(
      VENDOR_ID,
      'ENX Milan AFF L2 NonDisplay Other Use Restricted Basic Extra Words',
      'MAFFL2-BANDRU',
    );

    expect(match).toBeUndefined();
    expect(mockLogAlert).toHaveBeenCalledWith(
      'vendor-product-code-conflict',
      undefined,
      expect.objectContaining({
        resolution: 'treated-as-new-product',
      }),
      expect.any(String),
    );
  });

  it('refuses an ambiguous exact match that carries a different code', async () => {
    // Two products with the same name: the name carries no identifying power, so
    // the code disagreement must win.
    productRows = [
      { id: 5, name: 'ENX Milan AFF L2', product_code: 'MAFFL2-OUNDRU' },
      { id: 6, name: 'ENX Milan AFF L2', product_code: 'MAFFL2-BANDRU' },
    ];

    const match = await searchVendorProducts(
      VENDOR_ID,
      'ENX Milan AFF L2',
      'MAFFL2-TPLNDRUA',
    );

    expect(match).toBeUndefined();
  });

  it('accepts a name match whose code already agrees', async () => {
    productRows = [
      {
        id: 4,
        name: 'ENX Cash Continent L2 - NonDisplay Broking/Agents Basic',
        product_code: 'ECB10-BANDRU',
      },
    ];

    const match = await searchVendorProducts(
      VENDOR_ID,
      'ENX Cash Continent L2 - NonDisplay Broking/Agents Basic',
      'ECB10-BANDRU',
    );

    expect(match?.id).toBe(4);
    expect(mockLogAlert).not.toHaveBeenCalled();
  });

  it('returns undefined when neither code nor name matches', async () => {
    productRows = [
      { id: 5, name: 'Something else', product_code: 'AAAA-BBBB' },
    ];

    const match = await searchVendorProducts(
      VENDOR_ID,
      'ENX Oslo Børs Cash L2-ND Trading Platform',
      'OEQL2-TPLNDRUA',
    );

    expect(match).toBeUndefined();
  });
});

describe('searchVendorProducts without a product code', () => {
  it('behaves exactly as before for non-Exchange-Agreement documents', async () => {
    productRows = [
      { id: 8, name: 'Market Data Feed', product_code: null },
      { id: 9, name: 'Other Feed', product_code: null },
    ];

    const match = await searchVendorProducts(VENDOR_ID, 'Market Data Feed');

    expect(match?.id).toBe(8);
    expect(mockLogAlert).not.toHaveBeenCalled();
  });

  it('does not alert when an existing product has a code but none was extracted', async () => {
    productRows = [
      { id: 10, name: 'Market Data Feed', product_code: 'MDFD-BASE' },
    ];

    const match = await searchVendorProducts(VENDOR_ID, 'Market Data Feed');

    expect(match?.id).toBe(10);
    expect(mockLogAlert).not.toHaveBeenCalled();
  });
});

describe('createVendorProduct', () => {
  it('persists the product code alongside the name', async () => {
    await createVendorProduct(
      VENDOR_ID,
      'ENX Milan AFF L2-ND Trading Platform',
      'MAFFL2-TPLNDRUA',
    );

    expect(insertedRows[0]).toMatchObject({
      vendor_id: VENDOR_ID,
      product_code: 'MAFFL2-TPLNDRUA',
    });
  });

  it('stores null rather than an empty string when no code was extracted', async () => {
    await createVendorProduct(VENDOR_ID, 'Market Data Feed');
    expect(insertedRows[0].product_code).toBeNull();

    await createVendorProduct(VENDOR_ID, 'Market Data Feed', '   ');
    expect(insertedRows[1].product_code).toBeNull();
  });

  it('trims a padded code so the unique index cannot be bypassed', async () => {
    await createVendorProduct(
      VENDOR_ID,
      'ENX Cash Continent L2',
      '  ECB10-BANDRU  ',
    );
    expect(insertedRows[0].product_code).toBe('ECB10-BANDRU');
  });
});

/**
 * Products are vendor-scoped but contracts keep historical vendor ids, so
 * searchVendorProducts widens to the whole corporate-action family. When more
 * than one family member has a matching row, order decides the winner — these
 * cover that tie-break, which is what stops an invoice arriving under an acquirer
 * from forking a duplicate of the acquired vendor's product.
 */
describe('searchVendorProducts across a vendor merge family', () => {
  // One row carrying both columns satisfies the two current_vendors lookups in
  // mergeLineageIds, yielding the family {VENDOR_ID, 99, 7}.
  const withFamily = () => {
    currentVendorRows = [{ current_vendor_id: 99, original_vendor_id: 7 }];
  };

  it('finds a product held under a sibling vendor by code', async () => {
    withFamily();
    productRows = [
      {
        id: 20,
        name: 'ENX Milan AFF L2',
        product_code: 'MAFFL2-BANDRU',
        vendor_id: 7,
        created_at: '2023-01-01T00:00:00Z',
      },
    ];

    const match = await searchVendorProducts(
      VENDOR_ID,
      'Something else entirely',
      'MAFFL2-BANDRU',
    );

    expect(match?.id).toBe(20);
  });

  it("prefers the searched vendor's own row over a sibling's", async () => {
    withFamily();
    productRows = [
      {
        id: 30,
        name: 'ENX Milan AFF L2',
        product_code: null,
        vendor_id: 7,
        created_at: '2020-01-01T00:00:00Z',
      },
      {
        id: 31,
        name: 'ENX Milan AFF L2',
        product_code: null,
        vendor_id: VENDOR_ID,
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    const match = await searchVendorProducts(VENDOR_ID, 'ENX Milan AFF L2');

    // Own row wins even though the sibling's is older.
    expect(match?.id).toBe(31);
  });

  it('prefers the oldest sibling row, the one the others forked from', async () => {
    withFamily();
    productRows = [
      {
        id: 40,
        name: 'ENX Milan AFF L2',
        product_code: null,
        vendor_id: 99,
        created_at: '2025-06-01T00:00:00Z',
      },
      {
        id: 41,
        name: 'ENX Milan AFF L2',
        product_code: null,
        vendor_id: 7,
        created_at: '2021-03-01T00:00:00Z',
      },
    ];

    const match = await searchVendorProducts(VENDOR_ID, 'ENX Milan AFF L2');

    expect(match?.id).toBe(41);
  });

  it('still lets an exact code match beat the ordering preference', async () => {
    withFamily();
    productRows = [
      {
        id: 50,
        name: 'ENX Milan AFF L2',
        product_code: 'MAFFL2-OUNDRU',
        vendor_id: VENDOR_ID,
        created_at: '2020-01-01T00:00:00Z',
      },
      {
        id: 51,
        name: 'ENX Milan AFF L2',
        product_code: 'MAFFL2-BANDRU',
        vendor_id: 7,
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    const match = await searchVendorProducts(
      VENDOR_ID,
      'ENX Milan AFF L2',
      'MAFFL2-BANDRU',
    );

    expect(match?.id).toBe(51);
  });
});
