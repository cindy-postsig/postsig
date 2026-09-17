import { describe, expect, it } from '@jest/globals';
import {
  buildInventoryItem,
  groupInventoryByVendor,
} from '@/lib/v2/inventory/transforms';
import type { InventoryItem } from '@/lib/v2/inventory/types';
import type { EnrichedProduct } from '@/lib/v2/core/types';

/**
 * PSK-1796 display rule on inventory: a row is one product on one contract,
 * so it displays its fee unconverted (`costNative` + `currency`, stamped from
 * the fee-source contract); `cost` stays the org base figure, which is what
 * vendor rollups sum and the Cost column sorts on. A vendor group row takes
 * its items' shared currency when they agree and the org base when they mix.
 */

function item(over: Partial<InventoryItem> & { id: string }): InventoryItem {
  return {
    vendor: 'Acme',
    vendorId: 1,
    productName: ['Feed'],
    product_id: 100,
    licensesCount: 1,
    endUsers: '',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    cost: 0,
    costNative: 0,
    currency: 'USD',
    deliveryMethods: [],
    status: 'Active',
    activeUsers: [],
    businessSponsor: [],
    businessGroup: '',
    businessGroups: [],
    annualIncrease: null,
    ...over,
  } as InventoryItem;
}

describe('groupInventoryByVendor denomination (psk-1796)', () => {
  it('keeps a single-currency vendor in its own currency', () => {
    // Both items USD under a EUR org: the vendor never billed in anything
    // else, so translating its rollup would only add rate noise.
    const [group] = groupInventoryByVendor(
      [
        item({ id: '1', cost: 92, costNative: 100, currency: 'USD' }),
        item({ id: '2', cost: 184, costNative: 200, currency: 'USD' }),
      ],
      'EUR',
    );

    expect(group.isVendorGroup).toBe(true);
    expect(group.currency).toBe('USD');
    expect(group.costNative).toBe(300);
    // The base figure still sums for sorting and any base rollup.
    expect(group.cost).toBe(276);
  });

  it('falls back to the org base when the vendor bills in mixed currencies', () => {
    const [group] = groupInventoryByVendor(
      [
        item({ id: '1', cost: 92, costNative: 100, currency: 'USD' }),
        item({ id: '2', cost: 120, costNative: 105, currency: 'GBP' }),
      ],
      'EUR',
    );

    expect(group.currency).toBe('EUR');
    // A sum across denominations only means anything translated, so the
    // display amount is the base sum.
    expect(group.costNative).toBe(212);
    expect(group.cost).toBe(212);
  });

  it('passes a single-item vendor through untouched', () => {
    const [row] = groupInventoryByVendor(
      [item({ id: '1', cost: 92, costNative: 100, currency: 'USD' })],
      'EUR',
    );

    expect(row.isVendorGroup).toBeUndefined();
    expect(row.costNative).toBe(100);
    expect(row.currency).toBe('USD');
  });
});

describe('buildInventoryItem denomination (psk-1796)', () => {
  const sourceContract = {
    id: 1,
    status: 'active',
    currency: 'usd',
    term_start_date: [{ date: '2026-01-01' }],
    term_end_date: [{ date: '2026-12-31' }],
    vendor_products_details: [],
    contract_users: [],
    contract_acl_group: [],
    folder_contracts: [],
  } as never;

  const product = (over: Partial<EnrichedProduct>): EnrichedProduct =>
    ({
      product_id: 100,
      name: 'Feed',
      vendor_id: 1,
      vendor_name: 'Acme',
      contract_id: 1,
      sourceContractId: 1,
      isSuperseded: false,
      isSuperseding: false,
      currentFee: 100,
      currency: 'USD',
      currentFeeUSD: 92,
      effectiveFeeUSD: 92,
      ...over,
    }) as EnrichedProduct;

  const build = (p: EnrichedProduct) =>
    buildInventoryItem({
      product: p,
      sourceContract,
      fiscalYearStartMonth: 1,
      contractsMap: new Map(),
      enrichedSourceContract: {
        priceHistory: { periods: [] },
        products: [],
      } as never,
      baseCurrency: 'EUR',
      roster: {
        isActiveEmployee: () => true,
        matchActiveNames: () => () => true,
      },
    });

  it('displays the stamped native pair when present', () => {
    const item = build(
      product({ effectiveFee: 100, effectiveFeeCurrency: 'USD' }),
    );

    expect(item.cost).toBe(92);
    expect(item.costNative).toBe(100);
    expect(item.currency).toBe('USD');
  });

  it('falls back to the base amount AND the base currency together', () => {
    // With the stamps absent, the only amount in hand is the converted base
    // figure — labeling it USD under a EUR org would put the wrong symbol on
    // it (the exact bug class this ticket removes).
    const item = build(product({}));

    expect(item.costNative).toBe(92);
    expect(item.currency).toBe('EUR');
  });
});
