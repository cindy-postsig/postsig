import { aggregateTopVendors } from '@/lib/v2/vendors/transforms';
import type { ContractWithPricing } from '@/lib/v2/core/types';

function ec(spec: {
  id: number;
  vendorId?: number | null;
  vendorName?: string;
  typeId?: number;
  engineCurrent?: number;
  engineProjected?: number;
  legacyCurrent?: number;
  tcvUSD?: number;
}): ContractWithPricing {
  return {
    id: spec.id,
    vendor_id: spec.vendorId === undefined ? 10 : spec.vendorId,
    vendor_name: spec.vendorName ?? 'Vendor',
    vendor_domain: 'vendor.example',
    contract: { id: spec.id, type_id: spec.typeId ?? 2 },
    products: [],
    isLinkedChildInvoice: false,
    priceHistory: {
      totalContractValueUSD: spec.tcvUSD ?? 0,
      ...(spec.legacyCurrent !== undefined
        ? {
            periods: [
              {
                fees: spec.legacyCurrent,
                feesUSD: spec.legacyCurrent,
                productFees: [],
                isActivePeriod: true,
                isCurrentTerm: true,
                isCurrentFiscalYear: true,
                status: 'active',
              },
            ],
            vendorProductDetails: [],
          }
        : {}),
    },
    ...(spec.engineCurrent !== undefined
      ? {
          engineSpend: {
            currentBase: spec.engineCurrent,
            projectedBase: spec.engineProjected ?? 0,
            currentNative: spec.engineCurrent,
            projectedNative: spec.engineProjected ?? 0,
          },
        }
      : {}),
  } as unknown as ContractWithPricing;
}

describe('aggregateTopVendors — engine-stamped values', () => {
  it('reads engine stamps over the legacy price history', () => {
    // The whole point of the port (product 2026-08-05): stamps carry the
    // invoice fixes — no renewal projection, single-month no-end-date
    // booking — while the legacy history still auto-renews invoices.
    const [vendor] = aggregateTopVendors([
      ec({
        id: 1,
        engineCurrent: 100,
        engineProjected: 40,
        legacyCurrent: 999,
      }),
    ]);
    expect(vendor.currentBudget).toBe(100);
    expect(vendor.projectedBudget).toBe(40);
  });

  it('sums per vendor and sorts by current spend descending', () => {
    const vendors = aggregateTopVendors([
      ec({ id: 1, vendorId: 1, vendorName: 'Small', engineCurrent: 10 }),
      ec({ id: 2, vendorId: 2, vendorName: 'Big', engineCurrent: 60 }),
      ec({ id: 3, vendorId: 2, vendorName: 'Big', engineCurrent: 40 }),
    ]);
    expect(vendors.map((v) => v.name)).toEqual(['Big', 'Small']);
    expect(vendors[0].currentBudget).toBe(100);
  });

  it('limits to the requested count', () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      ec({ id: i + 1, vendorId: i + 1, engineCurrent: i }),
    );
    expect(aggregateTopVendors(many)).toHaveLength(12);
    expect(aggregateTopVendors(many, 3)).toHaveLength(3);
  });

  it('keeps TCV on the legacy scalar', () => {
    const [vendor] = aggregateTopVendors([
      ec({ id: 1, engineCurrent: 100, tcvUSD: 5000 }),
    ]);
    expect(vendor.totalContractValue).toBe(5000);
  });
});

describe('aggregateTopVendors — contract vs invoice counts', () => {
  it('counts invoices separately from contracts (Berenberg subtext)', () => {
    const [vendor] = aggregateTopVendors([
      ec({ id: 1, typeId: 2, engineCurrent: 10 }),
      ec({ id: 2, typeId: 1, engineCurrent: 10 }),
      ec({ id: 3, typeId: 6, engineCurrent: 10 }),
      // Exchange Agreement invoices count as invoices too (psk-1890)
      ec({ id: 4, typeId: 13, engineCurrent: 10 }),
    ]);
    expect(vendor.contractCount).toBe(2);
    expect(vendor.invoiceCount).toBe(2);
  });

  it('falls back to the vendor name as key when vendor_id is missing', () => {
    const vendors = aggregateTopVendors([
      ec({
        id: 1,
        vendorId: null,
        vendorName: 'Nameless Inc',
        engineCurrent: 5,
      }),
      ec({
        id: 2,
        vendorId: null,
        vendorName: 'Nameless Inc',
        engineCurrent: 5,
      }),
    ]);
    expect(vendors).toHaveLength(1);
    expect(vendors[0].currentBudget).toBe(10);
  });
});

describe('aggregateTopVendors — Bloomberg seats', () => {
  const seatSpend = {
    byVendorId: new Map([[469, { current: 8000, projected: 8520 }]]),
    labels: new Map([[469, { name: 'Bloomberg', domain: 'bloomberg.com' }]]),
    seatCounts: new Map([[469, 351]]),
    vendorIds: new Set([469]),
  };

  it('ranks a vendor with seats and no agreements by its seat figure', () => {
    const vendors = aggregateTopVendors(
      [ec({ id: 1, vendorId: 10, engineCurrent: 5000, engineProjected: 5000 })],
      12,
      seatSpend,
    );

    expect(
      vendors.map((v) => [v.id, v.currentBudget, v.projectedBudget]),
    ).toEqual([
      [469, 8000, 8520],
      [10, 5000, 5000],
    ]);
    expect(vendors[0]).toMatchObject({
      name: 'Bloomberg',
      domain: 'bloomberg.com',
      totalContractValue: 0,
      contractCount: 0,
      invoiceCount: 0,
    });
  });

  it("adds the seat figure to the vendor's own agreements and leaves TCV to the contracts", () => {
    const [vendor] = aggregateTopVendors(
      [
        ec({
          id: 1,
          vendorId: 469,
          vendorName: 'Bloomberg Finance L.P.',
          engineCurrent: 100,
          engineProjected: 100,
          tcvUSD: 300,
        }),
      ],
      12,
      seatSpend,
    );

    expect(vendor).toMatchObject({
      id: 469,
      name: 'Bloomberg Finance L.P.',
      currentBudget: 8100,
      projectedBudget: 8620,
      totalContractValue: 300,
      contractCount: 1,
    });
  });

  it('changes nothing for an org without seats', () => {
    const contracts = [ec({ id: 1, engineCurrent: 5000 })];
    expect(
      aggregateTopVendors(contracts, 12, {
        byVendorId: new Map(),
        labels: new Map(),
        seatCounts: new Map(),
        vendorIds: new Set(),
      }),
    ).toEqual(aggregateTopVendors(contracts));
  });
});
