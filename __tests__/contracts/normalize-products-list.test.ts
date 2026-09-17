import { describe, expect, it, jest } from '@jest/globals';

// contract-processing reaches a `server-only` email module, and its openai
// module instantiates a client at import time. normalizeProductsList is pure.
jest.mock('@/app/lib/emails/contract-lineage', () => ({
  __esModule: true,
  sendContractLineageEmail: jest.fn(),
}));
jest.mock('@/app/lib/actions/openai', () => ({
  __esModule: true,
  getContractSpecifics: jest.fn(),
  getContractBasics: jest.fn(),
  getAdditionalData: jest.fn(),
  getVendorId: jest.fn(),
  saveContractColumns: jest.fn(),
  saveAiExtractionStatus: jest.fn(),
  saveToDb: jest.fn(),
  updateAiExtractionJson: jest.fn(),
}));

import { normalizeProductsList } from '@/app/lib/actions/contract-processing';

/**
 * normalizeProductsList rebuilds each product from a fixed set of keys, so any
 * field it does not name is dropped before reaching the database. That is
 * invisible in the UI — the products simply have no code — which makes it the
 * single most likely way Exchange Agreement extraction breaks.
 */
describe('normalizeProductsList', () => {
  const product = (overrides: Record<string, unknown> = {}) => ({
    year: '1',
    product_name: 'ENX Milan AFF L2-ND Trading Platform',
    cost: '24246',
    n_users: '10',
    ...overrides,
  });

  it('preserves product_code', () => {
    const normalized = normalizeProductsList([
      product({ product_code: 'MAFFL2-TPLNDRUA' }),
    ]);
    expect(normalized).toEqual([
      {
        year: 1,
        fees: 24246,
        name: 'ENX Milan AFF L2-ND Trading Platform',
        product_code: 'MAFFL2-TPLNDRUA',
        n_users: 10,
        account_number: null,
        quantity: null,
        change_activity: null,
        rate: null,
        period_start: null,
        period_end: null,
      },
    ]);
  });

  it('preserves a distinct code per product', () => {
    const normalized = normalizeProductsList([
      product({ product_code: 'MAFFL2-TPLNDRUA' }),
      product({ product_code: 'ECB10-BANDRU', cost: '32069' }),
      product({ product_code: 'DEQLP-OCW1', cost: '334' }),
    ]);
    expect(normalized?.map((p) => p.product_code)).toEqual([
      'MAFFL2-TPLNDRUA',
      'ECB10-BANDRU',
      'DEQLP-OCW1',
    ]);
  });

  it('carries invoice line detail through', () => {
    const normalized = normalizeProductsList([
      product({
        account_number: '30041555',
        quantity: '14',
        change_activity: 'Added',
        rate: '79.00',
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      }),
    ]);
    expect(normalized?.[0]).toMatchObject({
      account_number: '30041555',
      quantity: 14,
      change_activity: 'Added',
      rate: 79,
      period_start: '2026-01-01',
      period_end: '2026-01-31',
    });
  });

  it('nulls line detail the document does not state', () => {
    const normalized = normalizeProductsList([product()]);
    expect(normalized?.[0]).toMatchObject({
      account_number: null,
      quantity: null,
      change_activity: null,
      rate: null,
      period_start: null,
      period_end: null,
    });
  });

  // These land in a `date` column, so a value the model did not return as
  // YYYY-MM-DD is dropped rather than handed to Postgres to interpret.
  it('drops a period boundary that is not an ISO date', () => {
    const normalized = normalizeProductsList([
      product({ period_start: '01/01/26', period_end: 'January 2026' }),
    ]);
    expect(normalized?.[0].period_start).toBeNull();
    expect(normalized?.[0].period_end).toBeNull();
  });

  it.each(['2026-02-30', '2026-13-01', '2026-04-31', '2026-00-10'])(
    'drops the impossible date %s',
    (date) => {
      const normalized = normalizeProductsList([
        product({ period_start: date }),
      ]);
      expect(normalized?.[0].period_start).toBeNull();
    },
  );

  it.each(['2026-02-28', '2024-02-29', '2026-12-31'])(
    'keeps the real date %s',
    (date) => {
      const normalized = normalizeProductsList([
        product({ period_start: date }),
      ]);
      expect(normalized?.[0].period_start).toBe(date);
    },
  );

  // The prompts no longer round the cost, so a fee arrives with its cents and
  // has to survive the string-cleaning step and parseFloat intact.
  it('keeps the cents of a decimal cost', () => {
    const normalized = normalizeProductsList([product({ cost: '2681.80' })]);
    expect(normalized?.[0].fees).toBe(2681.8);
  });

  it('keeps the cents of a currency-prefixed cost', () => {
    const normalized = normalizeProductsList([product({ cost: '€2,681.80' })]);
    expect(normalized?.[0].fees).toBe(2681.8);
  });

  // European documents write "€2.681,80"; the model may also pass the comma
  // through after stripping the thousands separator. Dropping that comma with
  // the currency symbol would read the cents as euros.
  it.each(['€2.681,80', '2681,80'])(
    'keeps the cents of the comma-decimal cost %s',
    (cost) => {
      const normalized = normalizeProductsList([product({ cost })]);
      expect(normalized?.[0].fees).toBe(2681.8);
    },
  );

  it('still treats a comma before three digits as a thousands separator', () => {
    const normalized = normalizeProductsList([product({ cost: '€1,000' })]);
    expect(normalized?.[0].fees).toBe(1000);
  });

  it('keeps two lines for the same product', () => {
    const normalized = normalizeProductsList([
      product({ cost: '1106', account_number: '30041555' }),
      product({ cost: '595', account_number: '30041556' }),
    ]);
    expect(normalized).toHaveLength(2);
    expect(normalized?.map((p) => p.fees)).toEqual([1106, 595]);
    expect(normalized?.map((p) => p.account_number)).toEqual([
      '30041555',
      '30041556',
    ]);
  });

  it('yields a null code for products from non-Exchange-Agreement documents', () => {
    const normalized = normalizeProductsList([product()]);
    expect(normalized?.[0].product_code).toBeNull();
  });

  it('normalises an explicit null code to null rather than undefined', () => {
    const normalized = normalizeProductsList([product({ product_code: null })]);
    expect(normalized?.[0].product_code).toBeNull();
  });

  it('keeps the code attached to its product after the year re-indexing', () => {
    // Years are re-based to 1..N and rows sorted by year, so a code must travel
    // with its own row rather than with its original position.
    const normalized = normalizeProductsList([
      product({ year: '2025', product_code: 'ECB10-BANDRU', cost: '2' }),
      product({ year: '2024', product_code: 'MAFFL2-TPLNDRUA', cost: '1' }),
    ]);
    expect(normalized).toEqual([
      {
        year: 1,
        fees: 1,
        name: 'ENX Milan AFF L2-ND Trading Platform',
        product_code: 'MAFFL2-TPLNDRUA',
        n_users: 10,
        account_number: null,
        quantity: null,
        change_activity: null,
        rate: null,
        period_start: null,
        period_end: null,
      },
      {
        year: 2,
        fees: 2,
        name: 'ENX Milan AFF L2-ND Trading Platform',
        product_code: 'ECB10-BANDRU',
        n_users: 10,
        account_number: null,
        quantity: null,
        change_activity: null,
        rate: null,
        period_start: null,
        period_end: null,
      },
    ]);
  });

  it('accepts the legacy JSON-string form and still carries the code', () => {
    const normalized = normalizeProductsList(
      '[{"year":"1","product_name":"BØRS","cost":"4247","n_users":"1","product_code":"OEQL2-TPLNDRUA"}]',
    );
    expect(normalized?.[0]).toMatchObject({
      name: 'BØRS',
      product_code: 'OEQL2-TPLNDRUA',
    });
  });

  it('preserves an unstated user count as null rather than NaN', () => {
    for (const n_users of [null, undefined, '']) {
      const normalized = normalizeProductsList([product({ n_users })]);
      expect(normalized?.[0].n_users).toBeNull();
    }
  });

  it('still parses a stated user count', () => {
    expect(
      normalizeProductsList([product({ n_users: '25' })])?.[0].n_users,
    ).toBe(25);
  });

  it('returns undefined for an unparseable list', () => {
    expect(normalizeProductsList('[{"year":"1"')).toBeUndefined();
    expect(normalizeProductsList([])).toBeUndefined();
  });
});
