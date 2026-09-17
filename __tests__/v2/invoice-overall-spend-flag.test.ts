import {
  filterForAggregation,
  filterToBudgetContracts,
} from '@/lib/v2/core/filters';
import { sumValuesInUSD } from '@/lib/v2/core/budget';
import { enrichWithLineage } from '@/lib/v2/core/lineage';
import { buildLineageMembers } from '@/lib/v2/spend';
import { contractTypes } from '@/app/lib/constants';

const PUBLISHED = 4;

const invoiceRow = (
  id: number,
  applyToOverallSpend: boolean,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  vendor_id: 1,
  type_id: contractTypes.Invoice,
  apply_to_overall_spend: applyToOverallSpend,
  vendors: { name: 'Bloomberg' },
  vendor_products_details: [
    { product_id: 10, fees: 100, year: 1, vendor_products: { name: 'Feed' } },
  ],
  term_start_date: [{ date: '2026-01-01' }],
  ...overrides,
});

describe('enrichWithLineage stamps excludedFromOverallSpend', () => {
  it('excludes a parent-less invoice by default', () => {
    const [enriched] = enrichWithLineage([invoiceRow(1, false)], []);
    expect(enriched.excludedFromOverallSpend).toBe(true);
  });

  it('includes an invoice once the flag is set', () => {
    const [enriched] = enrichWithLineage([invoiceRow(1, true)], []);
    expect(enriched.excludedFromOverallSpend).toBe(false);
  });

  // The flag is invoice-only: a service order must never be gated on a column
  // nobody sets for it.
  it('never excludes a non-invoice, whatever the column says', () => {
    const [enriched] = enrichWithLineage(
      [
        invoiceRow(1, false, {
          type_id: contractTypes.SO,
        }),
      ],
      [],
    );
    expect(enriched.excludedFromOverallSpend).toBe(false);
  });

  it('applies to Exchange Agreement Invoices too', () => {
    const [enriched] = enrichWithLineage(
      [invoiceRow(1, false, { type_id: contractTypes.EAINV })],
      [],
    );
    expect(enriched.excludedFromOverallSpend).toBe(true);
  });
});

describe('filterToBudgetContracts', () => {
  const budgetRow = (id: number, excluded: boolean) => ({
    id,
    excludedFromOverallSpend: excluded,
    contract: { status_id: PUBLISHED, vendor_id: 1, vendors: { name: 'v' } },
    priceHistory: { annualContractValueUSD: 1000 },
  });

  it('drops an invoice the reviewer has not opted in', () => {
    const result = filterToBudgetContracts([
      budgetRow(1, true),
      budgetRow(2, false),
    ]);
    expect(result.map((c) => c.id)).toEqual([2]);
  });
});

describe('filterForAggregation', () => {
  it('drops an invoice the reviewer has not opted in', () => {
    const result = filterForAggregation([
      { excludedFromOverallSpend: true },
      { excludedFromOverallSpend: false },
      {},
    ]);
    expect(result).toHaveLength(2);
  });
});

describe('sumValuesInUSD', () => {
  const rows = [
    { value: 100, excludedFromOverallSpend: true },
    { value: 30, excludedFromOverallSpend: false },
  ];

  it('skips invoices without the flag', () => {
    expect(sumValuesInUSD(rows, (r) => r.value)).toBe(30);
  });

  // The Invoices folder reports on the invoices themselves, not on overall
  // spend, so it still counts every one.
  it('counts them all when the caller opts in', () => {
    expect(
      sumValuesInUSD(rows, (r) => r.value, {
        includeLinkedChildInvoices: true,
      }),
    ).toBe(130);
  });
});

describe('buildLineageMembers', () => {
  const member = (id: number, excluded: boolean) => ({
    id,
    contract: { term_start_date: [{ date: '2026-01-01' }] },
    products: [{ product_id: 10, sourceContractId: id, isSuperseding: false }],
    isLinkedChildInvoice: false,
    excludedFromOverallSpend: excluded,
  });

  // An excluded invoice contributes nothing, so it must not form a singleton
  // family that could seed a cutoff either.
  it('skips an invoice that contributes nothing', () => {
    const members = buildLineageMembers([member(1, true), member(2, false)]);
    expect(members.map((m) => m.contractId)).toEqual([2]);
  });
});
