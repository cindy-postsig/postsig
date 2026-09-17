import { describe, expect, it } from '@jest/globals';
import {
  JSON_COLUMN_BY_TABLE,
  getEditableField,
  isFieldEditable,
  isJsonEditableTable,
} from '@/lib/v2/contracts/edit/field-registry';
import { EDITABLE_TEXT_FIELDS } from '@/lib/v2/contracts/edit/utils';

describe('Contract No./Invoice No. editable field registration', () => {
  it.each([
    ['order_number', 'Contract No.'],
    ['invoice_number', 'Invoice No.'],
  ])('registers %s as an editable metadata text field', (key, title) => {
    expect(isFieldEditable('contracts_metadata', key)).toBe(true);

    const field = getEditableField('contracts_metadata', key)!;
    expect(field.title).toBe(title);
    expect(field.valueType).toBe('text');
    expect(field.jsonPath).toEqual({
      path: ['lineage', 'order_number'],
      valueKey: 'order_number',
    });
  });

  it('points both labels at the same lineage slot', () => {
    expect(
      getEditableField('contracts_metadata', 'order_number')!.jsonPath,
    ).toEqual(
      getEditableField('contracts_metadata', 'invoice_number')!.jsonPath,
    );
  });

  it('keeps them out of the contracts-column write path', () => {
    expect(EDITABLE_TEXT_FIELDS.has('order_number')).toBe(false);
    expect(EDITABLE_TEXT_FIELDS.has('invoice_number')).toBe(false);
    expect(isFieldEditable('contracts', 'order_number')).toBe(false);
    expect(isFieldEditable('contracts', 'invoice_number')).toBe(false);
  });
});

describe('json-backed pseudo tables', () => {
  it('maps each pseudo table to its contracts JSON column', () => {
    expect(JSON_COLUMN_BY_TABLE).toEqual({
      contracts_metadata: 'metadata',
      contracts_other_attributes: 'other_attributes',
    });
  });

  it('recognises only the json pseudo tables', () => {
    expect(isJsonEditableTable('contracts_metadata')).toBe(true);
    expect(isJsonEditableTable('contracts_other_attributes')).toBe(true);
    expect(isJsonEditableTable('contracts')).toBe(false);
    expect(isJsonEditableTable('vendor_products')).toBe(false);
  });
});
