import { format } from 'date-fns';
import { contractTypes } from '@/app/lib/constants';
import {
  buildVendorListRows,
  calculateVendorMetrics,
  type VendorProductSpend,
  type VendorSpendIndex,
} from '@/lib/v2/vendors/transforms';
import type { ContractWithPricing } from '@/lib/v2/core/types';

const NO_SPEND: VendorSpendIndex = {
  byVendorId: new Map(),
  labels: new Map(),
  products: [],
};

const spendOf = (
  amounts: Record<number, number | { current: number; projected: number }>,
  labels: Record<number, { name: string; domain?: string }> = {},
  products: VendorProductSpend[] = [],
): VendorSpendIndex => ({
  byVendorId: new Map(
    Object.entries(amounts).map(([id, amount]) => [
      Number(id),
      typeof amount === 'number' ? { current: amount, projected: 0 } : amount,
    ]),
  ),
  labels: new Map(
    Object.entries(labels).map(([id, label]) => [Number(id), label]),
  ),
  products,
});

const product = (
  spec: Partial<VendorProductSpend> & { vendorId: number; contractId: number },
): VendorProductSpend => ({
  productId: 1,
  name: 'Product',
  current: 0,
  projected: 0,
  ...spec,
});

const build = (
  contracts: ContractWithPricing[],
  spend: VendorSpendIndex = NO_SPEND,
) => buildVendorListRows(contracts, spend);

const termDates = (dates: string | string[] | undefined) =>
  dates === undefined
    ? []
    : (Array.isArray(dates) ? dates : [dates]).map((date) => ({ date }));

function ec(spec: {
  id: number;
  vendorId?: number | null;
  vendorName?: string;
  typeId?: number;
  tcvUSD?: number;
  termStart?: string | string[];
  termEnd?: string | string[];
  cancelBy?: string;
  assetClasses?: string[];
  isFullySuperseded?: boolean;
}): ContractWithPricing {
  return {
    id: spec.id,
    vendor_id: spec.vendorId === undefined ? 10 : spec.vendorId,
    vendor_name: spec.vendorName ?? 'Vendor',
    vendor_domain: 'vendor.example',
    contract: {
      id: spec.id,
      type_id: spec.typeId ?? 2,
      term_start_date: termDates(spec.termStart),
      term_end_date: termDates(spec.termEnd),
      cancel_date: termDates(spec.cancelBy),
      contract_asset_classes: (spec.assetClasses ?? []).map((name, i) => ({
        asset_class_id: i + 1,
        asset_classes: { id: i + 1, name },
      })),
    },
    products: [],
    isLinkedChildInvoice: false,
    isFullySuperseded: spec.isFullySuperseded ?? false,
    priceHistory: { totalContractValueUSD: spec.tcvUSD ?? 0 },
  } as unknown as ContractWithPricing;
}

describe('buildVendorListRows', () => {
  it('groups contracts by vendor and sorts rows by name', () => {
    const rows = build([
      ec({ id: 1, vendorId: 2, vendorName: 'Zeta' }),
      ec({ id: 2, vendorId: 1, vendorName: 'Alpha' }),
      ec({ id: 3, vendorId: 2, vendorName: 'Zeta' }),
    ]);
    expect(rows.map((r) => [r.id, r.name])).toEqual([
      [1, 'Alpha'],
      [2, 'Zeta'],
    ]);
    expect(rows[1].domain).toBe('vendor.example');
  });

  it('leaves out contracts with no vendor id', () => {
    const rows = build([
      ec({ id: 1, vendorId: null, vendorName: 'Nameless' }),
      ec({ id: 2, vendorId: 5, vendorName: 'Known' }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Known']);
  });

  it('reads each vendor current and projected spend from the engine index', () => {
    const rows = build(
      [
        ec({ id: 1, vendorId: 1, vendorName: 'Alpha', tcvUSD: 1000 }),
        ec({ id: 2, vendorId: 2, vendorName: 'Beta', tcvUSD: 250 }),
      ],
      spendOf({ 1: { current: 480.5, projected: 512 } }),
    );
    expect(rows.map((r) => [r.name, r.currentSpend, r.projectedSpend])).toEqual(
      [
        ['Alpha', 480.5, 512],
        ['Beta', 0, 0],
      ],
    );
  });

  it('adds a row for a vendor the engine spent on without any contract', () => {
    const rows = build(
      [ec({ id: 1, vendorId: 1, vendorName: 'Alpha' })],
      spendOf(
        { 1: 100, 9: 900 },
        { 9: { name: 'Bloomberg', domain: 'bloomberg.com' } },
      ),
    );
    expect(rows.map((r) => r.name)).toEqual(['Alpha', 'Bloomberg']);
    expect(rows[1]).toMatchObject({
      kind: 'vendor',
      id: 9,
      domain: 'bloomberg.com',
      currentSpend: 900,
      projectedSpend: 0,
      spendShare: 0.9,
      relationshipStartDate: null,
      activeAgreements: 0,
      assetClasses: [],
      subRows: [],
    });
  });

  it('names a spend-only vendor by id when the engine returned no label', () => {
    const [row] = build([], spendOf({ 9: 1 }));
    expect(row.name).toBe('#9');
  });

  it('counts master service agreements, service orders and amendments', () => {
    const [row] = build([
      ec({ id: 1, typeId: contractTypes.MSA }),
      ec({ id: 2, typeId: contractTypes.SO }),
      ec({ id: 3, typeId: contractTypes.EASO }),
      ec({ id: 4, typeId: contractTypes.Addendum }),
    ]);
    expect(row.activeAgreements).toBe(4);
  });

  it('leaves invoices, boilerplate, trials and fee schedules out of the agreement count', () => {
    const [row] = build([
      ec({ id: 1, typeId: contractTypes.SO }),
      ec({ id: 2, typeId: contractTypes.Invoice }),
      ec({ id: 3, typeId: contractTypes.EAINV }),
      ec({ id: 4, typeId: contractTypes.NDA }),
      ec({ id: 5, typeId: contractTypes.TOS }),
      ec({ id: 6, typeId: contractTypes.Trial }),
      ec({ id: 7, typeId: contractTypes.EAFeeSchedule }),
      ec({ id: 8, typeId: contractTypes.Other }),
    ]);
    expect(row.activeAgreements).toBe(1);
  });

  it('collects asset classes across contracts, deduplicated and sorted', () => {
    const [row] = build([
      ec({ id: 1, assetClasses: ['Fixed Income', 'Equities'] }),
      ec({ id: 2, assetClasses: ['Equities', 'FX'] }),
      ec({ id: 3 }),
    ]);
    expect(row.assetClasses).toEqual(['Equities', 'Fixed Income', 'FX']);
  });

  it('gives each vendor its share of the listed current FY spend', () => {
    const rows = build(
      [
        ec({ id: 1, vendorId: 1, vendorName: 'Alpha' }),
        ec({ id: 2, vendorId: 2, vendorName: 'Beta' }),
      ],
      spendOf({ 1: 750, 2: 250 }),
    );
    expect(rows.map((r) => r.spendShare)).toEqual([0.75, 0.25]);
  });

  it('reports a zero share when no vendor has spend', () => {
    const [row] = build([ec({ id: 1 })]);
    expect(row.spendShare).toBe(0);
  });

  it('takes the earliest term start as the relationship start', () => {
    const [row] = build([
      ec({ id: 1, termStart: '2030-01-01' }),
      ec({ id: 2, termStart: '2021-06-15' }),
    ]);
    expect(row.relationshipStartDate).toBe('2021-06-15');
  });

  it("uses the earliest of a renewed contract's own term starts", () => {
    const [row] = build([
      ec({ id: 1, termStart: ['2025-01-01', '2023-01-01', '2024-01-01'] }),
    ]);
    expect(row.relationshipStartDate).toBe('2023-01-01');
  });

  it('has no relationship start without term dates', () => {
    const [row] = build([ec({ id: 1 })]);
    expect(row.relationshipStartDate).toBeNull();
  });

  it('recovers a hand-typed US-format term start instead of crashing', () => {
    const [row] = build([
      ec({ id: 1, termStart: '01/31/2022' }),
      ec({ id: 2, termStart: '2023-01-01' }),
    ]);
    expect(row.relationshipStartDate).toBe('2022-01-31');
  });

  it('drops a term start it cannot read at all', () => {
    const [row] = build([ec({ id: 1, termStart: 'not a date' })]);
    expect(row.relationshipStartDate).toBeNull();
  });
});

describe('buildVendorListRows product rows', () => {
  it('lists each product bucket under its vendor, dated from its contract', () => {
    const [row] = build(
      [
        ec({
          id: 1,
          vendorId: 1,
          termEnd: '2027-03-31',
          cancelBy: '2027-01-31',
        }),
      ],
      spendOf({ 1: 1000 }, {}, [
        product({
          vendorId: 1,
          contractId: 1,
          productId: 7,
          name: 'Terminal',
          current: 600,
          projected: 640,
        }),
        product({
          vendorId: 1,
          contractId: 1,
          productId: 8,
          name: 'Data Feed',
          current: 400,
          projected: 400,
        }),
      ]),
    );
    expect(row.subRows).toEqual([
      {
        kind: 'product',
        id: '1:product:8',
        name: 'Data Feed',
        cancelByDate: '2027-01-31',
        termEndDate: '2027-03-31',
        currentSpend: 400,
        projectedSpend: 400,
      },
      {
        kind: 'product',
        id: '1:product:7',
        name: 'Terminal',
        cancelByDate: '2027-01-31',
        termEndDate: '2027-03-31',
        currentSpend: 600,
        projectedSpend: 640,
      },
    ]);
  });

  it('rolls a product on two contracts into one row dated by the later one', () => {
    const [row] = build(
      [
        ec({
          id: 1,
          vendorId: 1,
          termEnd: '2026-06-30',
          cancelBy: '2026-05-31',
        }),
        ec({
          id: 2,
          vendorId: 1,
          termEnd: '2027-06-30',
          cancelBy: '2027-05-31',
        }),
      ],
      spendOf({ 1: 1000 }, {}, [
        product({ vendorId: 1, contractId: 2, productId: 7, current: 0.105 }),
        product({ vendorId: 1, contractId: 1, productId: 7, current: 0.105 }),
      ]),
    );
    expect(row.subRows).toEqual([
      expect.objectContaining({
        id: '1:product:7',
        cancelByDate: '2027-05-31',
        termEndDate: '2027-06-30',
        currentSpend: 0.21,
      }),
    ]);
  });

  it('keeps a Bloomberg seat product apart from a same-numbered catalog product, undated', () => {
    const [row] = build(
      [ec({ id: 1, vendorId: 1, termEnd: '2027-03-31' })],
      spendOf({ 1: 1000 }, {}, [
        product({ vendorId: 1, contractId: 1, productId: 28, name: 'Catalog' }),
        product({
          vendorId: 1,
          contractId: -30041555,
          productId: 28,
          name: 'Bloomberg Anywhere',
          current: 900,
        }),
      ]),
    );
    expect(row.subRows).toEqual([
      expect.objectContaining({
        id: '1:seat:28',
        name: 'Bloomberg Anywhere',
        cancelByDate: null,
        termEndDate: null,
        currentSpend: 900,
      }),
      expect.objectContaining({
        id: '1:product:28',
        name: 'Catalog',
        termEndDate: '2027-03-31',
      }),
    ]);
  });

  it('gives a spend-only vendor its product rows too', () => {
    const [row] = build(
      [],
      spendOf({ 9: 900 }, { 9: { name: 'Bloomberg' } }, [
        product({ vendorId: 9, contractId: -1, productId: 28, current: 900 }),
      ]),
    );
    expect(row.subRows.map((p) => p.id)).toEqual(['9:seat:28']);
  });

  it('has no product rows for a vendor without product spend', () => {
    const [row] = build([ec({ id: 1 })]);
    expect(row.subRows).toEqual([]);
  });
});

describe('calculateVendorMetrics seat terms', () => {
  const iso = (date: Date | null) => (date ? format(date, 'yyyy-MM-dd') : null);
  const seatTerms = { start: '2000-01-17', end: '2028-04-29' };

  it("widens the contract bounds to the seats' first contract and last renewal", () => {
    const metrics = calculateVendorMetrics(
      [ec({ id: 1, termStart: '2026-04-01', termEnd: '2026-06-30' })],
      seatTerms,
    );
    expect(iso(metrics.relationshipStartDate)).toBe('2000-01-17');
    expect(iso(metrics.projectedEndDate)).toBe('2028-04-29');
  });

  it('keeps a contract bound that lies outside the seat terms', () => {
    const metrics = calculateVendorMetrics(
      [ec({ id: 1, termStart: '1998-05-01', termEnd: '2030-01-01' })],
      seatTerms,
    );
    expect(iso(metrics.relationshipStartDate)).toBe('1998-05-01');
    expect(iso(metrics.projectedEndDate)).toBe('2030-01-01');
  });

  it('reads the seat terms alone when the contracts carry no dates', () => {
    const metrics = calculateVendorMetrics([ec({ id: 1 })], seatTerms);
    expect(iso(metrics.relationshipStartDate)).toBe('2000-01-17');
    expect(iso(metrics.projectedEndDate)).toBe('2028-04-29');
  });
});

describe('calculateVendorMetrics projected end', () => {
  const iso = (date: Date | null) => (date ? format(date, 'yyyy-MM-dd') : null);

  it('takes the latest term end across contracts and within a contract', () => {
    const { projectedEndDate } = calculateVendorMetrics([
      ec({ id: 1, termEnd: ['2026-12-31', '2024-12-31'] }),
      ec({ id: 2, termEnd: '2025-06-30' }),
    ]);
    expect(iso(projectedEndDate)).toBe('2026-12-31');
  });

  it('is null without term ends', () => {
    expect(calculateVendorMetrics([ec({ id: 1 })]).projectedEndDate).toBeNull();
  });

  it('recovers a US-format term end and drops an unreadable one', () => {
    const { projectedEndDate } = calculateVendorMetrics([
      ec({ id: 1, termEnd: ['09/28/2023', 'garbage'] }),
    ]);
    expect(iso(projectedEndDate)).toBe('2023-09-28');
    expect(
      calculateVendorMetrics([ec({ id: 2, termEnd: 'garbage' })])
        .projectedEndDate,
    ).toBeNull();
  });
});
