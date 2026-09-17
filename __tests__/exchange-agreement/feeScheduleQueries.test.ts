import {
  ALL_PRODUCT_LINES,
  getProductExplorerFromDataset,
  getProductIdsByVersion,
  getVersionComparisonFromDataset,
  scopeDatasetToProductLine,
  type FeeScheduleDataset,
} from '@/lib/exchange-agreement/feeScheduleQueries';

function buildDataset(): FeeScheduleDataset {
  return {
    exchange: { code: 'euronext', name: 'Euronext', currency: '€' },
    rawVersions: [
      {
        id: 1,
        version: '20.0',
        effective_date: '2026-07-01',
        invalidated_date: null,
        source_document_url: null,
      },
      {
        id: 2,
        version: '19.0',
        effective_date: '2026-04-01',
        invalidated_date: '2026-07-01',
        source_document_url: null,
      },
    ],
    versions: [
      {
        id: '1:Euronext Cash',
        exchangeCode: 'euronext',
        productLine: 'Euronext Cash',
        version: '20.0',
        label: 'V20.0 (Jul 2026)',
        effectiveDate: '2026-07-01',
        invalidatedDate: null,
        sourceDocumentUrl: null,
      },
      {
        id: '1:Euronext Derivatives',
        exchangeCode: 'euronext',
        productLine: 'Euronext Derivatives',
        version: '20.0',
        label: 'V20.0 (Jul 2026)',
        effectiveDate: '2026-07-01',
        invalidatedDate: null,
        sourceDocumentUrl: null,
      },
      {
        id: '2:Euronext Cash',
        exchangeCode: 'euronext',
        productLine: 'Euronext Cash',
        version: '19.0',
        label: 'V19.0 (Apr 2026)',
        effectiveDate: '2026-04-01',
        invalidatedDate: '2026-07-01',
        sourceDocumentUrl: null,
      },
    ],
    lineItems: [
      {
        id: '1',
        versionId: '1:Euronext Cash',
        productId: 'p-cash-1',
        title: 'Cash product',
        assetClass: 'Cash Equities',
        useType: 'Display Use',
        level: 'L2',
        fee: 10,
        currency: '€',
        productCode: null,
        page: null,
      },
      {
        id: '2',
        versionId: '1:Euronext Derivatives',
        productId: 'p-deriv-1',
        title: 'Derivatives product',
        assetClass: 'Derivatives',
        useType: 'Display Use',
        level: 'L1',
        fee: 20,
        currency: '€',
        productCode: null,
        page: null,
      },
      {
        id: '3',
        versionId: '2:Euronext Cash',
        productId: 'p-cash-1',
        title: 'Cash product',
        assetClass: 'Cash Equities',
        useType: 'Display Use',
        level: 'L2',
        fee: 9,
        currency: '€',
        productCode: null,
        page: null,
      },
    ],
  };
}

describe('scopeDatasetToProductLine', () => {
  it('returns the dataset unchanged for ALL_PRODUCT_LINES', () => {
    const dataset = buildDataset();
    expect(scopeDatasetToProductLine(dataset, ALL_PRODUCT_LINES)).toBe(dataset);
  });

  it('keeps only versions belonging to the requested product line', () => {
    const scoped = scopeDatasetToProductLine(buildDataset(), 'Euronext Cash');
    expect(scoped.versions.map((v) => v.id)).toEqual([
      '1:Euronext Cash',
      '2:Euronext Cash',
    ]);
  });

  it('keeps only line items whose versionId belongs to the requested product line', () => {
    const scoped = scopeDatasetToProductLine(buildDataset(), 'Euronext Cash');
    expect(scoped.lineItems.map((item) => item.id)).toEqual(['1', '3']);
  });

  it('drops every line item when the product line has no versions', () => {
    const scoped = scopeDatasetToProductLine(
      buildDataset(),
      'Nonexistent Line',
    );
    expect(scoped.versions).toEqual([]);
    expect(scoped.lineItems).toEqual([]);
  });

  it('leaves rawVersions and exchange untouched', () => {
    const dataset = buildDataset();
    const scoped = scopeDatasetToProductLine(dataset, 'Euronext Cash');
    expect(scoped.rawVersions).toBe(dataset.rawVersions);
    expect(scoped.exchange).toBe(dataset.exchange);
  });

  it('does not mutate the original dataset', () => {
    const dataset = buildDataset();
    const originalLineItemCount = dataset.lineItems.length;
    scopeDatasetToProductLine(dataset, 'Euronext Cash');
    expect(dataset.lineItems).toHaveLength(originalLineItemCount);
  });
});

describe('getProductExplorerFromDataset', () => {
  it('defaults to the latest version when no targetVersionId is given', () => {
    const dataset = buildDataset();
    const rows = getProductExplorerFromDataset(dataset, 'Euronext Cash');
    const row = rows.find((r) => r.productId === 'p-cash-1');
    expect(row).toMatchObject({ currentFee: 10, lastChange: 1 });
    expect(row?.trend).toEqual([9, 10]);
  });

  it('shows the snapshot as of an earlier version, ignoring later ones', () => {
    const dataset = buildDataset();
    const rows = getProductExplorerFromDataset(
      dataset,
      'Euronext Cash',
      '2:Euronext Cash', // V19.0, the older of the two versions
    );
    const row = rows.find((r) => r.productId === 'p-cash-1');
    expect(row).toMatchObject({ currentFee: 9, lastChange: null });
    expect(row?.trend).toEqual([9]);
  });
});

describe('getProductIdsByVersion', () => {
  it('maps each version of a specific product line to its own productIds', () => {
    const dataset = buildDataset();
    const map = getProductIdsByVersion(dataset, 'Euronext Cash');
    expect(map.get('1:Euronext Cash')).toEqual(new Set(['p-cash-1']));
    expect(map.get('2:Euronext Cash')).toEqual(new Set(['p-cash-1']));
    expect(map.has('1:Euronext Derivatives')).toBe(false);
  });

  it('aggregates productIds across every product line for ALL_PRODUCT_LINES', () => {
    const dataset = buildDataset();
    const map = getProductIdsByVersion(dataset, ALL_PRODUCT_LINES);
    // The logical "20.0" version spans both Euronext Cash and Euronext
    // Derivatives line items in the fixture.
    expect(map.get('1:All')).toEqual(new Set(['p-cash-1', 'p-deriv-1']));
    expect(map.get('2:All')).toEqual(new Set(['p-cash-1']));
  });
});

describe('getVersionComparisonFromDataset', () => {
  it('honors whichever version is passed as latest, regardless of chronological order', () => {
    const dataset = buildDataset();
    const chronological = getVersionComparisonFromDataset(
      dataset,
      'Euronext Cash',
      '2:Euronext Cash', // previous: V19.0, fee 9
      '1:Euronext Cash', // latest: V20.0, fee 10
    );
    expect(chronological?.previous.label).toBe('V19.0 (Apr 2026)');
    expect(chronological?.latest.label).toBe('V20.0 (Jul 2026)');
    expect(
      chronological?.rows.find((r) => r.productId === 'p-cash-1'),
    ).toMatchObject({
      status: 'changed',
      previousFee: 9,
      latestFee: 10,
      change: 1,
    });
  });

  it('reverses the diff when the caller puts the chronologically earlier version in the "latest" slot', () => {
    const dataset = buildDataset();
    const reversed = getVersionComparisonFromDataset(
      dataset,
      'Euronext Cash',
      '1:Euronext Cash', // previous slot: V20.0, fee 10
      '2:Euronext Cash', // latest slot: V19.0, fee 9
    );
    expect(reversed?.previous.label).toBe('V20.0 (Jul 2026)');
    expect(reversed?.latest.label).toBe('V19.0 (Apr 2026)');
    expect(
      reversed?.rows.find((r) => r.productId === 'p-cash-1'),
    ).toMatchObject({
      status: 'changed',
      previousFee: 10,
      latestFee: 9,
      change: -1,
    });
  });
});
