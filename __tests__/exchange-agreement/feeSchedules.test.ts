import {
  buildDataset,
  computeProductFingerprint,
  disambiguateFingerprints,
  type RawLineItem,
} from '@/lib/exchange-agreement/feeSchedules';
import type { FeeScheduleLineItem } from '@/lib/exchange-agreement/types';

function rawLineItem(overrides: Partial<RawLineItem> = {}): RawLineItem {
  return {
    id: 1,
    version_id: 1,
    product_id: 'p-1',
    title: 'Some product',
    section_family: 'Cash',
    asset_class: 'Equities',
    use_type: 'Display Use',
    level: 'L2',
    fee: 10,
    currency: '€',
    product_code: null,
    product_code_root: null,
    customer_tier: null,
    user_class: null,
    distribution_channel: null,
    data_timeliness: null,
    display_medium: null,
    granularity: null,
    user_count_tier: null,
    consolidated_pack: null,
    market: null,
    venues: null,
    counterparty_role: null,
    row_label: null,
    column_labels: null,
    page: null,
    ...overrides,
  };
}

describe('computeProductFingerprint', () => {
  it('is deterministic for the same row', () => {
    const row = rawLineItem();
    expect(computeProductFingerprint(row)).toBe(computeProductFingerprint(row));
  });

  it('ignores title so a reworded title does not change identity', () => {
    const a = computeProductFingerprint(rawLineItem({ title: 'Original' }));
    const b = computeProductFingerprint(rawLineItem({ title: 'Reworded' }));
    expect(a).toBe(b);
  });

  it('is sensitive to row_label, the only signal for many untagged rows', () => {
    const a = computeProductFingerprint(rawLineItem({ row_label: ['Tier 1'] }));
    const b = computeProductFingerprint(rawLineItem({ row_label: ['Tier 2'] }));
    expect(a).not.toBe(b);
  });

  it('is sensitive to column_labels', () => {
    const a = computeProductFingerprint(
      rawLineItem({ column_labels: ['Monthly'] }),
    );
    const b = computeProductFingerprint(
      rawLineItem({ column_labels: ['Annual'] }),
    );
    expect(a).not.toBe(b);
  });

  it('treats two rows with identical classificatory fields as the same product', () => {
    const a = computeProductFingerprint(
      rawLineItem({ id: 1, fee: 10, title: 'A' }),
    );
    const b = computeProductFingerprint(
      rawLineItem({ id: 2, fee: 20, title: 'B' }),
    );
    expect(a).toBe(b);
  });
});

describe('disambiguateFingerprints', () => {
  function lineItem(
    overrides: Partial<FeeScheduleLineItem> = {},
  ): FeeScheduleLineItem {
    return {
      id: '1',
      versionId: '1:Cash',
      productId: 'fp-1',
      title: 'Product',
      assetClass: null,
      useType: '',
      level: null,
      fee: 10,
      currency: '€',
      productCode: null,
      page: null,
      ...overrides,
    };
  }

  it('leaves productId untouched when there is no collision', () => {
    const items = [
      lineItem({ id: '1', productId: 'fp-1' }),
      lineItem({ id: '2', productId: 'fp-2' }),
    ];
    expect(disambiguateFingerprints(items).map((i) => i.productId)).toEqual([
      'fp-1',
      'fp-2',
    ]);
  });

  it('suffixes the 2nd+ occurrence of a collided productId within a version', () => {
    const items = [
      lineItem({ id: '1', productId: 'fp-1' }),
      lineItem({ id: '2', productId: 'fp-1' }),
      lineItem({ id: '3', productId: 'fp-1' }),
    ];
    expect(disambiguateFingerprints(items).map((i) => i.productId)).toEqual([
      'fp-1',
      'fp-1-2',
      'fp-1-3',
    ]);
  });

  it('does not suffix the same productId when it belongs to different versions', () => {
    const items = [
      lineItem({ id: '1', versionId: '1:Cash', productId: 'fp-1' }),
      lineItem({ id: '2', versionId: '2:Cash', productId: 'fp-1' }),
    ];
    expect(disambiguateFingerprints(items).map((i) => i.productId)).toEqual([
      'fp-1',
      'fp-1',
    ]);
  });

  it('does not mutate the input items', () => {
    const original = lineItem({ id: '1', productId: 'fp-1' });
    const items = [original, lineItem({ id: '2', productId: 'fp-1' })];
    disambiguateFingerprints(items);
    expect(original.productId).toBe('fp-1');
  });
});

describe('buildDataset', () => {
  const exchange = { code: 'euronext', name: 'Euronext', currency: '€' };

  it('falls back untagged rows to the "Other" product line', () => {
    const rawVersions = [
      {
        id: 1,
        version: '20.0',
        effective_date: '2026-07-01',
        invalidated_date: null,
        source_document_url: null,
      },
    ];
    const rawLineItems = [
      rawLineItem({ id: 1, version_id: 1, section_family: null }),
    ];

    const dataset = buildDataset(exchange, rawVersions, rawLineItems);

    expect(dataset.versions.map((v) => v.productLine)).toEqual(['Other']);
    expect(dataset.lineItems[0].versionId).toBe(
      dataset.versions.find((v) => v.productLine === 'Other')?.id,
    );
  });

  it('groups line items into one FeeScheduleVersion per product line present in a raw version', () => {
    const rawVersions = [
      {
        id: 1,
        version: '20.0',
        effective_date: '2026-07-01',
        invalidated_date: null,
        source_document_url: null,
      },
    ];
    const rawLineItems = [
      rawLineItem({ id: 1, version_id: 1, section_family: 'Cash' }),
      rawLineItem({ id: 2, version_id: 1, section_family: 'Derivatives' }),
    ];

    const dataset = buildDataset(exchange, rawVersions, rawLineItems);

    expect(dataset.versions.map((v) => v.productLine).sort()).toEqual([
      'Cash',
      'Derivatives',
    ]);
  });

  it('runs disambiguation on the assembled line items', () => {
    const rawVersions = [
      {
        id: 1,
        version: '20.0',
        effective_date: '2026-07-01',
        invalidated_date: null,
        source_document_url: null,
      },
    ];
    const rawLineItems = [
      rawLineItem({ id: 1, version_id: 1, row_label: ['A'] }),
      rawLineItem({ id: 2, version_id: 1, row_label: ['A'] }),
    ];

    const dataset = buildDataset(exchange, rawVersions, rawLineItems);

    expect(dataset.lineItems[0].productId).not.toBe(
      dataset.lineItems[1].productId,
    );
  });
});
