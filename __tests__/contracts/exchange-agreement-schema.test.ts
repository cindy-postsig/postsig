import { describe, expect, it } from '@jest/globals';
import { SchemaType } from '@google/generative-ai';
import {
  exchangeAgreementProductSchema,
  exchangeAgreementProductsListSchema,
  exchangeAgreementProductsListQuery,
  sanitizeExchangeAgreementProduct,
} from '@/constants/prompts/exchangeAgreementSchemas';

const product = (overrides: Record<string, unknown> = {}) => ({
  year: '1',
  product_name: 'MAFFL2-TPLNDRUA ENX Milan AFF L2-ND Trading Platform',
  product_code: 'MAFFL2-TPLNDRUA',
  cost: '24246',
  n_users: '10',
  ...overrides,
});

describe('exchangeAgreementProductSchema', () => {
  // Real codes taken from an Exchange Agreement invoice, service order and fee
  // schedule. Spans 4-6 characters before the hyphen and 4-8 after, which is
  // wider than the 4-5 the ticket stated: MAFFL2 is six characters.
  it.each([
    'DEQL2-BANDRU',
    'DEQL2-OUNDRU',
    'DEQL2-TPLNDRUA',
    'DEQLP-OCW1',
    'ECB1-OUNDRU',
    'ECB10-BANDRU',
    'ECB10-TPLNDRUA',
    'MAFFL2-BANDRU',
    'MAFFL2-OUNDRU',
    'MAFFL2-TPLNDRU',
    'MAFFL2-TPLNDRUA',
    'MAMLP-OCW1',
    'OEQL2-TPLNDRUA',
  ])('accepts the real product code %s', (code) => {
    const parsed = exchangeAgreementProductSchema.parse(
      product({ product_code: code }),
    );
    expect(parsed.product_code).toBe(code);
  });

  it('accepts a line with no product code', () => {
    const parsed = exchangeAgreementProductSchema.parse(
      product({ product_code: null }),
    );
    expect(parsed.product_code).toBeNull();
  });

  it('accepts and preserves a decimal fee', () => {
    expect(
      exchangeAgreementProductSchema.parse(product({ cost: '24246.75' })).cost,
    ).toBe('24246.75');
    expect(
      exchangeAgreementProductSchema.parse(product({ cost: '2681.80' })).cost,
    ).toBe('2681.80');
  });

  it('accepts a line with no cost or user count', () => {
    const parsed = exchangeAgreementProductSchema.parse(
      product({ cost: null, n_users: null }),
    );
    expect(parsed.cost).toBeNull();
    expect(parsed.n_users).toBeNull();
  });

  it('rejects a line missing the product name', () => {
    expect(() =>
      exchangeAgreementProductSchema.parse(
        product({ product_name: undefined }),
      ),
    ).toThrow();
  });

  // Values arrive as digit strings so the extracted shape stays byte-compatible
  // with the legacy products_list prompt that normalizeProductsList parses.
  it('rejects numeric year and cost, keeping the legacy string shape', () => {
    expect(() =>
      exchangeAgreementProductSchema.parse(product({ year: 1 })),
    ).toThrow();
    expect(() =>
      exchangeAgreementProductSchema.parse(product({ cost: 24246 })),
    ).toThrow();
  });

  it('parses a multi-product list', () => {
    const parsed = exchangeAgreementProductsListSchema.parse([
      product(),
      product({ product_code: 'ECB10-BANDRU', cost: '32069' }),
    ]);
    expect(parsed).toHaveLength(2);
  });

  it('accepts an empty list', () => {
    expect(exchangeAgreementProductsListSchema.parse([])).toEqual([]);
  });

  it.each([
    'account_number',
    'quantity',
    'change_activity',
    'rate',
    'period_start',
    'period_end',
  ])('parses a line that omits %s entirely', (field) => {
    const parsed = exchangeAgreementProductSchema.parse(product());
    expect(parsed[field as keyof typeof parsed]).toBeUndefined();
  });

  it('keeps the invoice line detail when the model does return it', () => {
    const parsed = exchangeAgreementProductSchema.parse(
      product({
        account_number: '30041555',
        quantity: '14',
        change_activity: 'Added',
        rate: '79.00',
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      }),
    );
    expect(parsed.quantity).toBe('14');
    expect(parsed.period_end).toBe('2026-01-31');
  });
});

describe('exchangeAgreementProductsListQuery', () => {
  it('replaces the shared products_list field', () => {
    expect(exchangeAgreementProductsListQuery.dbName).toBe('products_list');
  });

  // A JSON array carried inside a STRING field truncates and parses to null,
  // silently dropping every product link. A real ARRAY schema cannot.
  it('declares a structured array schema', () => {
    expect(exchangeAgreementProductsListQuery.type).toBe(SchemaType.ARRAY);
    expect(exchangeAgreementProductsListQuery.items.type).toBe(
      SchemaType.OBJECT,
    );
  });

  it('derives one property per zod field, so prompts are written once', () => {
    const properties = exchangeAgreementProductsListQuery.items.properties;
    expect(Object.keys(properties).sort()).toEqual(
      Object.keys(exchangeAgreementProductSchema.shape).sort(),
    );
  });

  it('carries each zod description into the response schema', () => {
    const properties = exchangeAgreementProductsListQuery.items
      .properties as Record<string, { description?: string }>;
    for (const [field, property] of Object.entries(properties)) {
      expect(property.description).toBeTruthy();
      expect(property.description).toBe(
        exchangeAgreementProductSchema.shape[
          field as keyof typeof exchangeAgreementProductSchema.shape
        ].description,
      );
    }
  });

  it('marks optional fields nullable and required fields not', () => {
    const properties = exchangeAgreementProductsListQuery.items
      .properties as Record<string, { nullable?: boolean }>;
    expect(properties.product_code.nullable).toBe(true);
    expect(properties.cost.nullable).toBe(true);
    expect(properties.n_users.nullable).toBe(true);
    expect(properties.product_name.nullable).toBe(false);
    expect(properties.year.nullable).toBe(false);
  });

  it('tells the model that ENX is not part of the code', () => {
    const { description } = exchangeAgreementProductsListQuery.items.properties
      .product_code as { description: string };
    expect(description).toMatch(/ENX/);
    expect(description).toMatch(/not part of the code/i);
  });

  // The shape is a hint, not a constraint. Alex's ground-truth regex allows 3+
  // characters before the hyphen with no upper bound
  // (parsing-poc docparse/extraction/order_lines.py:49), and our own range came
  // from ~13 samples, so a hard range would silently drop valid codes.
  it('describes the code shape as guidance rather than a hard range', () => {
    const { description } = exchangeAgreementProductsListQuery.items.properties
      .product_code as { description: string };
    expect(description).toMatch(/typically 4 to 6/i);
    expect(description).toMatch(/4 to 8/);
    expect(description).toMatch(/guide, not a\s+rule/i);
    expect(description).toMatch(/never reject one for/i);
  });

  // Invoices and fee schedules lead with the code before an "ENX" marker; service
  // orders spell out "Euronext" and put the code in trailing parentheses. A prompt
  // describing only one layout silently extracts nothing from the other.
  it('describes the leading-code invoice layout with a real example', () => {
    const { description } = exchangeAgreementProductsListQuery.items.properties
      .product_code as { description: string };
    expect(description).toContain('DEQL2-BANDRU ENX Dublin Equities');
  });

  it('describes the trailing parenthesised service order layout', () => {
    const { description } = exchangeAgreementProductsListQuery.items.properties
      .product_code as { description: string };
    expect(description).toMatch(/parenthes/i);
    expect(description).toContain('(MAFFL2-BANDRU)');
  });

  // MAFFL2-TPLNDRU (service order) and MAFFL2-TPLNDRUA (fee schedule) differ only
  // by a trailing letter. If the model "corrects" one into the other, two distinct
  // products merge and their fees are compared against each other.
  it('warns against normalising a trailing letter away', () => {
    const { description } = exchangeAgreementProductsListQuery.items.properties
      .product_code as { description: string };
    expect(description).toContain('MAFFL2-TPLNDRU');
    expect(description).toContain('MAFFL2-TPLNDRUA');
    expect(description).toMatch(/must not be conflated/i);
  });
});

/**
 * These rules are ported from Alex's ORDER_LINES_SYS
 * (parsing-poc docparse/extraction/order_lines.py:30-46). Without them the model
 * will reach for the EMDA- agreement reference printed on these very documents,
 * or an account number, and report it as a product code.
 */
describe('exchangeAgreementProductsListQuery cost handling', () => {
  it('tells the model not to round the decimal part', () => {
    const { description } = exchangeAgreementProductsListQuery.items.properties
      .cost as { description: string };
    expect(description).toMatch(/never round it/i);
    expect(description).toContain('2681.80');
  });
});

describe('exchangeAgreementProductsListQuery required fields', () => {
  // Without these the model may omit the field entirely, which fails the parse
  // and loses every product on the contract.
  it('requires the two non-nullable fields', () => {
    expect(exchangeAgreementProductsListQuery.items.required).toEqual([
      'year',
      'product_name',
    ]);
  });
});

describe('exchangeAgreementProductsListQuery exclusion rules', () => {
  const query = () => exchangeAgreementProductsListQuery.query;

  it('excludes document-level identifiers by role', () => {
    expect(query()).toMatch(/not themselves a product/i);
    expect(query()).toMatch(/agreement or contract number/i);
    expect(query()).toMatch(/order-form or version id/i);
    expect(query()).toMatch(/section and clause references/i);
    expect(query()).toMatch(/account or subscriber numbers/i);
    expect(query()).toMatch(/page or table labels/i);
  });

  it('names the EMDA- reference specifically, since it appears on these documents', () => {
    expect(query()).toContain('EMDA-');
  });

  it('de-duplicates within a year but expects repeats across years', () => {
    expect(query()).toMatch(/do not repeat the same product code/i);
    expect(query()).toMatch(/across different years/i);
  });

  it('ignores boilerplate and signature blocks', () => {
    expect(query()).toMatch(/legal boilerplate/i);
    expect(query()).toMatch(/signature blocks/i);
    expect(query()).toMatch(/totals/i);
  });

  it('tells the model to null a missing code rather than guess', () => {
    expect(query()).toMatch(/rather than guessing/i);
  });
});

describe('sanitizeExchangeAgreementProduct', () => {
  const line = (overrides: Record<string, unknown> = {}) => ({
    year: '1',
    product_name: 'ENX Dublin Equities L2-NonDisplay Broking/Agents Basic',
    product_code: 'DEQL2-BANDRU',
    cost: '245',
    n_users: null,
    ...overrides,
  });

  it('keeps a real product code untouched', () => {
    expect(sanitizeExchangeAgreementProduct(line()).product_code).toBe(
      'DEQL2-BANDRU',
    );
  });

  // The agreement reference is not orderable, so it must not become a product
  // code — but the line is still a product and its fee must survive.
  it('nulls an EMDA- agreement reference while keeping the line', () => {
    const sanitized = sanitizeExchangeAgreementProduct(
      line({ product_code: 'EMDA-2024-001' }),
    );
    expect(sanitized.product_code).toBeNull();
    expect(sanitized.cost).toBe('245');
    expect(sanitized.product_name).toBe(
      'ENX Dublin Equities L2-NonDisplay Broking/Agents Basic',
    );
  });

  it('normalises an empty code to null', () => {
    expect(
      sanitizeExchangeAgreementProduct(line({ product_code: '   ' }))
        .product_code,
    ).toBeNull();
  });

  it('strips a leading code off an invoice name', () => {
    const sanitized = sanitizeExchangeAgreementProduct(
      line({
        product_name:
          'DEQL2-BANDRU ENX Dublin Equities L2-NonDisplay Broking/Agents Basic',
      }),
    );
    expect(sanitized.product_name).toBe(
      'ENX Dublin Equities L2-NonDisplay Broking/Agents Basic',
    );
  });

  it('strips a trailing parenthesised code off a service order name', () => {
    const sanitized = sanitizeExchangeAgreementProduct(
      line({
        product_name:
          'Euronext Milan AFF Level 2 - Non-Display Other Use - Restricted Basic (MAFFL2-OUNDRU)',
        product_code: 'MAFFL2-OUNDRU',
      }),
    );
    expect(sanitized.product_name).toBe(
      'Euronext Milan AFF Level 2 - Non-Display Other Use - Restricted Basic',
    );
  });
});
