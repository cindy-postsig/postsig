import { describe, expect, it } from '@jest/globals';
import {
  applyJsonPathChange,
  coerceValueForJson,
  getValueAtJsonPath,
} from '@/lib/v2/contracts/edit/json-path';
import { getEditableField } from '@/lib/v2/contracts/edit/field-registry';

const orderNumberPath = getEditableField(
  'contracts_metadata',
  'order_number',
)!.jsonPath!;

const salesTaxPath = getEditableField(
  'contracts_other_attributes',
  'sales_tax',
)!.jsonPath!;

const CONTRACT_ID = 42;

describe('coerceValueForJson', () => {
  it('trims text and stores blank input as null', () => {
    expect(coerceValueForJson('  PO-123  ', 'text')).toBe('PO-123');
    expect(coerceValueForJson('', 'text')).toBeNull();
    expect(coerceValueForJson('   ', 'text')).toBeNull();
    expect(coerceValueForJson(null, 'text')).toBeNull();
  });

  it('keeps numeric coercion for number fields', () => {
    expect(coerceValueForJson('12.5', 'number')).toBe(12.5);
    expect(coerceValueForJson('not a number', 'number')).toBe(0);
    expect(coerceValueForJson(null, 'number')).toBeNull();
  });
});

describe('order number json path', () => {
  it('writes the number into metadata.lineage.order_number', () => {
    const metadata = { lineage: { order_number: 'OLD-1', parent: 'x' } };

    const next = applyJsonPathChange(
      metadata,
      orderNumberPath,
      'text',
      CONTRACT_ID,
      'PO-123',
    );

    expect(next).toEqual({ lineage: { order_number: 'PO-123', parent: 'x' } });
    expect(metadata.lineage.order_number).toBe('OLD-1');
  });

  it('creates the lineage object when metadata has no lineage yet', () => {
    expect(
      applyJsonPathChange({}, orderNumberPath, 'text', CONTRACT_ID, 'PO-9'),
    ).toEqual({ lineage: { order_number: 'PO-9' } });
  });

  it('clears the number when the input is emptied', () => {
    const next = applyJsonPathChange(
      { lineage: { order_number: 'PO-123' } },
      orderNumberPath,
      'text',
      CONTRACT_ID,
      '',
    );

    expect(next).toEqual({ lineage: { order_number: null } });
  });

  it('preserves sibling metadata keys', () => {
    const next = applyJsonPathChange(
      { source: 'extractor', lineage: { order_number: null } },
      orderNumberPath,
      'text',
      CONTRACT_ID,
      'PO-7',
    );

    expect(next.source).toBe('extractor');
  });

  it('reads the current value back', () => {
    expect(
      getValueAtJsonPath(
        { lineage: { order_number: 'PO-123' } },
        orderNumberPath,
        CONTRACT_ID,
      ),
    ).toBe('PO-123');

    expect(getValueAtJsonPath({}, orderNumberPath, CONTRACT_ID)).toBeNull();
  });
});

describe('array json path (sales tax) still behaves as before', () => {
  it('updates the entry matching the record id', () => {
    const other = {
      invoice_fields: {
        sales_tax_details: [
          { year: 2024, sales_tax: 10 },
          { year: 2025, sales_tax: 20 },
        ],
      },
    };

    const next = applyJsonPathChange(other, salesTaxPath, 'number', 2025, 30);

    expect(next).toEqual({
      invoice_fields: {
        sales_tax_details: [
          { year: 2024, sales_tax: 10 },
          { year: 2025, sales_tax: 30 },
        ],
      },
    });
  });

  it('appends an entry when the year is not present', () => {
    const next = applyJsonPathChange({}, salesTaxPath, 'number', 2026, 5);

    expect(next).toEqual({
      invoice_fields: { sales_tax_details: [{ year: 2026, sales_tax: 5 }] },
    });
  });

  it('reads the entry matching the record id', () => {
    const other = {
      invoice_fields: { sales_tax_details: [{ year: 2024, sales_tax: 10 }] },
    };

    expect(getValueAtJsonPath(other, salesTaxPath, 2024)).toBe(10);
    expect(getValueAtJsonPath(other, salesTaxPath, 2025)).toBeNull();
  });
});
