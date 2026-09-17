import { describe, expect, it } from '@jest/globals';
import {
  isProductRow,
  isReportRow,
  isVendorRow,
} from '@/components/contracts/rowTypeGuards';

const rowWith = (original: {
  id?: string | number | null;
  vendor_products?: unknown;
}) => ({ original });

describe('isVendorRow', () => {
  it('identifies vendor group rows by their vendor- id prefix', () => {
    expect(isVendorRow(rowWith({ id: 'vendor-123' }))).toBe(true);
  });

  it('returns false for normal contract, product, and report rows', () => {
    expect(isVendorRow(rowWith({ id: '456' }))).toBe(false);
    expect(isVendorRow(rowWith({ id: 'report-789-product-1' }))).toBe(false);
  });

  it('still identifies vendor rows when vendor_products is present', () => {
    expect(isVendorRow(rowWith({ id: 'vendor-1', vendor_products: [] }))).toBe(
      true,
    );
  });

  it('returns false when id is missing', () => {
    expect(isVendorRow(rowWith({}))).toBe(false);
    expect(isVendorRow(rowWith({ id: null }))).toBe(false);
  });

  it('coerces numeric ids without matching the vendor prefix', () => {
    expect(isVendorRow(rowWith({ id: 42 }))).toBe(false);
  });
});

describe('isProductRow', () => {
  it('identifies product subrows by the vendor_products key', () => {
    expect(isProductRow(rowWith({ id: '1', vendor_products: [] }))).toBe(true);
  });

  it('returns false for vendor group rows and plain contract rows', () => {
    expect(isProductRow(rowWith({ id: 'vendor-1' }))).toBe(false);
    expect(isProductRow(rowWith({ id: '1' }))).toBe(false);
  });
});

describe('isReportRow', () => {
  it('identifies report rows by their report- id prefix', () => {
    expect(isReportRow(rowWith({ id: 'report-1-product-2' }))).toBe(true);
  });

  it('returns false for vendor group rows and plain contract rows', () => {
    expect(isReportRow(rowWith({ id: 'vendor-1' }))).toBe(false);
    expect(isReportRow(rowWith({ id: '1' }))).toBe(false);
  });
});
