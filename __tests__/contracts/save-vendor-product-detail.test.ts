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

type Row = Record<string, unknown>;

let existingRow: { id: number } | null = null;
const inserted: Row[] = [];
const updated: { id: number; payload: Row }[] = [];

const detailsHandler = {
  select: () => ({
    eq: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: existingRow, error: null }),
        }),
      }),
    }),
  }),
  insert: (payload: Row) => {
    inserted.push(payload);
    return {
      select: () => ({
        single: () =>
          Promise.resolve({ data: { id: 99, ...payload }, error: null }),
      }),
    };
  },
  update: (payload: Row) => ({
    eq: (_column: string, id: number) => {
      updated.push({ id, payload });
      return {
        select: () => ({
          single: () =>
            Promise.resolve({ data: { id, ...payload }, error: null }),
        }),
      };
    },
  }),
};

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({ from: () => detailsHandler }),
}));

import { saveVendorProductDetail } from '@/data/superuser/vendors';

describe('saveVendorProductDetail', () => {
  const base = {
    contractId: 1,
    productId: 10,
    year: 1,
    fees: 100,
    userId: 'user-1',
  };

  beforeEach(() => {
    existingRow = null;
    inserted.length = 0;
    updated.length = 0;
  });

  it('updates the existing row rather than adding a second one', async () => {
    existingRow = { id: 42 };
    await saveVendorProductDetail(base);
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe(42);
    expect(inserted).toHaveLength(0);
  });

  it('inserts when the contract has no row for that product-year yet', async () => {
    await saveVendorProductDetail(base);
    expect(inserted).toHaveLength(1);
    expect(updated).toHaveLength(0);
  });

  // An invoice bills the same product on several lines, so a repeat is a new
  // line rather than a correction of the previous one.
  it('inserts a second row when duplicates are allowed', async () => {
    existingRow = { id: 42 };
    await saveVendorProductDetail({ ...base, allowDuplicates: true });
    expect(inserted).toHaveLength(1);
    expect(updated).toHaveLength(0);
  });

  it('writes the invoice line detail', async () => {
    await saveVendorProductDetail({
      ...base,
      account_number: '30041555',
      quantity: 14,
      change_activity: 'Added',
      rate: 79,
      period_start: '2026-01-01',
      period_end: '2026-01-31',
    });
    expect(inserted[0]).toMatchObject({
      account_number: '30041555',
      quantity: 14,
      change_activity: 'Added',
      rate: 79,
      period_start: '2026-01-01',
      period_end: '2026-01-31',
    });
  });

  it('nulls line detail the caller does not supply', async () => {
    await saveVendorProductDetail(base);
    expect(inserted[0]).toMatchObject({
      account_number: null,
      quantity: null,
      change_activity: null,
      rate: null,
      period_start: null,
      period_end: null,
    });
  });

  it('omits n_users when it is not a number', async () => {
    await saveVendorProductDetail({ ...base, n_users: null });
    expect(inserted[0]).not.toHaveProperty('n_users');
  });
});
