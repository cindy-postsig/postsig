import { describe, expect, it } from '@jest/globals';
import { buildCalendarEvents } from '@/lib/v2/calendar/transforms';
import type { ContractWithPricing } from '@/lib/v2/core/types';

const detail = (id: number, name: string) => ({
  product_id: id,
  vendor_products: { id, name },
});

function makeEvent(id: number): ContractWithPricing {
  const vendorProductsDetails = [detail(10, 'Feed A'), detail(11, 'Feed B')];
  const contract = {
    id,
    status: 'active',
    status_id: 4,
    renewal_type: 'Auto-Renew',
    term_start_date: [{ date: '2025-01-01' }],
    term_end_date: [{ date: '2025-12-31' }],
    cancel_date: [],
    vendor_products_details: vendorProductsDetails,
  };
  return {
    id,
    vendor_id: 1,
    vendor_name: 'Vendor',
    contract,
    products: [{ product_id: 10 }, { product_id: 11 }],
    priceHistory: null,
  } as unknown as ContractWithPricing;
}

describe('buildCalendarEvents — cancelled products (PSK-1830)', () => {
  it('excludes struck products but keeps the contract event', () => {
    const removed = new Map([[1, new Set([10])]]);

    const [event] = buildCalendarEvents([makeEvent(1)], removed);

    expect(event.vendor_products_details.map((d: any) => d.product_id)).toEqual(
      [11],
    );
    expect(event.products.map((p: any) => p.product_id)).toEqual([11]);
    expect(event.id).toBe(1);
  });

  it('keeps the event when every product is struck', () => {
    const removed = new Map([[1, new Set([10, 11])]]);

    const [event] = buildCalendarEvents([makeEvent(1)], removed);

    expect(event.vendor_products_details).toEqual([]);
    expect(event.term_end_date).toEqual([{ date: '2025-12-31' }]);
  });

  it('is unchanged without a removals map', () => {
    const plain = buildCalendarEvents([makeEvent(1)]);
    const withEmpty = buildCalendarEvents([makeEvent(1)], new Map());

    expect(withEmpty).toEqual(plain);
    expect(plain[0].vendor_products_details).toHaveLength(2);
  });
});
