import {
  diffFeeScheduleVersions,
  summarizeDiffRows,
} from '@/lib/exchange-agreement/diff';
import type { FeeScheduleLineItem } from '@/lib/exchange-agreement/types';

function lineItem(
  overrides: Partial<FeeScheduleLineItem> & { productId: string; fee: number },
): FeeScheduleLineItem {
  return {
    id: `${overrides.productId}-item`,
    versionId: 'v-test',
    title: 'Test Product',
    assetClass: 'Cash Equities',
    useType: 'Non-Display Use',
    level: 'L2',
    currency: '€',
    productCode: null,
    page: null,
    ...overrides,
  };
}

describe('diffFeeScheduleVersions', () => {
  it('classifies unchanged, changed, added, and removed products', () => {
    const previous = [
      lineItem({ productId: 'unchanged', fee: 100 }),
      lineItem({ productId: 'changed', fee: 100 }),
      lineItem({ productId: 'removed', fee: 50 }),
    ];
    const latest = [
      lineItem({ productId: 'unchanged', fee: 100 }),
      lineItem({ productId: 'changed', fee: 150 }),
      lineItem({ productId: 'added', fee: 25 }),
    ];

    const { rows, summary } = diffFeeScheduleVersions(previous, latest);
    const byProduct = new Map(rows.map((row) => [row.productId, row]));

    expect(byProduct.get('unchanged')?.status).toBe('unchanged');
    expect(byProduct.get('changed')?.status).toBe('changed');
    expect(byProduct.get('removed')?.status).toBe('removed');
    expect(byProduct.get('added')?.status).toBe('added');

    expect(summary.productsWithPriceChange).toBe(1);
    expect(summary.priceIncreases).toBe(1);
    expect(summary.priceDecreases).toBe(0);
    expect(summary.productsAdded).toBe(1);
    expect(summary.productsRemoved).toBe(1);
  });

  it('computes change, change percent, and annualized impact', () => {
    const previous = [lineItem({ productId: 'a', fee: 100 })];
    const latest = [lineItem({ productId: 'a', fee: 125 })];

    const { rows, summary } = diffFeeScheduleVersions(previous, latest);

    expect(rows[0].change).toBe(25);
    expect(rows[0].changePercent).toBe(25);
    expect(rows[0].annualImpact).toBe(25 * 12);
    expect(summary.annualImpact).toBe(25 * 12);
  });

  it('leaves annualImpact null for added, removed, and unchanged rows', () => {
    const previous = [
      lineItem({ productId: 'unchanged', fee: 100 }),
      lineItem({ productId: 'removed', fee: 50 }),
    ];
    const latest = [
      lineItem({ productId: 'unchanged', fee: 100 }),
      lineItem({ productId: 'added', fee: 25 }),
    ];

    const { rows } = diffFeeScheduleVersions(previous, latest);
    const byProduct = new Map(rows.map((row) => [row.productId, row]));

    expect(byProduct.get('unchanged')?.annualImpact).toBeNull();
    expect(byProduct.get('removed')?.annualImpact).toBeNull();
    expect(byProduct.get('added')?.annualImpact).toBeNull();
  });

  it('classifies a product with a null fee on one side as changed without a fabricated dollar impact', () => {
    const previous = [lineItem({ productId: 'unpriced', fee: 100 })];
    const latest = [
      { ...lineItem({ productId: 'unpriced', fee: 100 }), fee: null },
    ];

    const { rows, summary } = diffFeeScheduleVersions(previous, latest);
    const row = rows[0];

    expect(row.status).toBe('changed');
    expect(row.change).toBeNull();
    expect(row.annualImpact).toBeNull();
    expect(summary.productsWithPriceChange).toBe(1);
    expect(summary.priceIncreases).toBe(0);
    expect(summary.priceDecreases).toBe(0);
    expect(summary.annualImpact).toBe(0);
  });

  it('sorts rows by absolute change, largest first', () => {
    const previous = [
      lineItem({ productId: 'small', fee: 100 }),
      lineItem({ productId: 'large', fee: 100 }),
    ];
    const latest = [
      lineItem({ productId: 'small', fee: 105 }),
      lineItem({ productId: 'large', fee: 500 }),
    ];

    const { rows } = diffFeeScheduleVersions(previous, latest);

    expect(rows[0].productId).toBe('large');
    expect(rows[1].productId).toBe('small');
  });

  it('returns no rows for two empty version snapshots', () => {
    const { rows, summary } = diffFeeScheduleVersions([], []);

    expect(rows).toHaveLength(0);
    expect(summary.productsWithPriceChange).toBe(0);
    expect(summary.annualImpact).toBe(0);
  });
});

describe('summarizeDiffRows', () => {
  it('recomputes stats from a filtered subset of rows, not the full diff', () => {
    const previous = [
      lineItem({ productId: 'a', fee: 100, level: 'L2' }),
      lineItem({ productId: 'b', fee: 100, level: 'L3' }),
    ];
    const latest = [
      lineItem({ productId: 'a', fee: 150, level: 'L2' }),
      lineItem({ productId: 'b', fee: 50, level: 'L3' }),
    ];

    const { rows, summary: fullSummary } = diffFeeScheduleVersions(
      previous,
      latest,
    );
    expect(fullSummary.priceIncreases).toBe(1);
    expect(fullSummary.priceDecreases).toBe(1);

    const l2Only = rows.filter((row) => row.level === 'L2');
    const filteredSummary = summarizeDiffRows(l2Only);

    expect(filteredSummary.productsWithPriceChange).toBe(1);
    expect(filteredSummary.priceIncreases).toBe(1);
    expect(filteredSummary.priceDecreases).toBe(0);
    expect(filteredSummary.annualImpact).toBe(50 * 12);
  });

  it('returns zeroed stats for an empty row set', () => {
    const summary = summarizeDiffRows([]);

    expect(summary).toEqual({
      productsWithPriceChange: 0,
      priceIncreases: 0,
      priceDecreases: 0,
      productsAdded: 0,
      productsRemoved: 0,
      annualImpact: 0,
    });
  });
});
