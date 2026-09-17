import { describe, expect, it, jest } from '@jest/globals';
import { contractMatchesQuery } from '@/app/lib/contracts/filtering';
import { normalizeOrderNumber } from '@/lib/v2/contracts/orderNumber';

const contract = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  title: 'Master Services Agreement',
  summary: 'Annual licensing renewal',
  vendors: { name: 'Acme Corp' },
  vendor_products_details: [
    { vendor_products: { name: 'Acme Analytics' } },
    { product_name: 'Legacy Dashboards' },
  ],
  contract_types: { name: 'Service Order' },
  contract_tags: [{ tag_id: 7, user_tags: { name: 'Legal Hold' } }],
  contract_asset_classes: [
    { asset_class_id: 3, asset_classes: { name: 'Software' } },
  ],
  metadata: { lineage: { order_number: '202.205-23' } },
  ...overrides,
});

describe('contractMatchesQuery', () => {
  it.each([
    ['title', 'master services'],
    ['summary', 'licensing'],
    ['vendor name', 'acme corp'],
    ['product name', 'analytics'],
    ['product_name fallback', 'legacy dashboards'],
    ['type name', 'service order'],
    ['tag name', 'legal hold'],
    ['asset class name', 'software'],
  ])('matches on %s', (_field, query) => {
    expect(contractMatchesQuery(contract(), query)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(contractMatchesQuery(contract(), 'ACME')).toBe(true);
  });

  it('matches multi-word queries as substrings', () => {
    expect(contractMatchesQuery(contract(), 'Acme Corp')).toBe(true);
  });

  it('rejects a query matching no field', () => {
    expect(contractMatchesQuery(contract(), 'globex')).toBe(false);
  });

  it('tolerates a sparse row', () => {
    expect(contractMatchesQuery({}, 'anything')).toBe(false);
  });

  describe('order numbers', () => {
    it('matches the stored punctuation exactly', () => {
      expect(contractMatchesQuery(contract(), '202.205-23')).toBe(true);
    });

    it('matches when the query drops the punctuation', () => {
      expect(contractMatchesQuery(contract(), '20220523')).toBe(true);
    });

    it('matches when the row dropped the punctuation instead', () => {
      const row = contract({
        metadata: { lineage: { order_number: '20220523' } },
      });
      expect(contractMatchesQuery(row, '202.205-23')).toBe(true);
    });

    it('ignores a non-string order number', () => {
      const row = contract({ metadata: { lineage: { order_number: 42 } } });
      expect(contractMatchesQuery(row, '4')).toBe(false);
    });

    it('never order-matches a query that normalizes to nothing', () => {
      expect(contractMatchesQuery(contract(), '---')).toBe(false);
    });
  });
});

describe('normalizeOrderNumber', () => {
  it('strips non-alphanumerics and lowercases', () => {
    expect(normalizeOrderNumber('202.205-23')).toBe('20220523');
    expect(normalizeOrderNumber('PO #99/A')).toBe('po99a');
  });
});

describe('searchContracts', () => {
  const getContractsList = jest.fn<() => Promise<unknown>>();

  jest.isolateModules(() => undefined);

  it('filters the cached list in memory and shapes table rows', async () => {
    jest.resetModules();
    jest.doMock('@/lib/v2/contracts/service', () => ({ getContractsList }));

    const enriched = (raw: Record<string, unknown>) => ({
      id: raw.id,
      vendor_id: 10,
      vendor_name: (raw.vendors as { name?: string } | undefined)?.name,
      contract: raw,
      products: [],
      priceHistory: null,
    });
    getContractsList.mockResolvedValue({
      contracts: [
        enriched(contract({ id: 1 })),
        enriched(
          contract({
            id: 2,
            title: 'Globex NDA',
            summary: null,
            vendors: { name: 'Globex' },
            vendor_products_details: [],
            contract_types: { name: 'NDA' },
            contract_tags: [],
            contract_asset_classes: [],
            metadata: null,
          }),
        ),
      ],
      count: 2,
    });

    const { searchContracts } =
      await import('@/app/lib/contracts/search-actions');

    const rows = await searchContracts('acme');
    expect(rows).toHaveLength(1);
    expect(rows[0].vendor).toBe('Acme Corp');
    expect(rows[0].orderNumber).toBe('202.205-23');
    expect(getContractsList).toHaveBeenCalledWith({ excludeInvoices: true });

    const globex = await searchContracts('globex');
    expect(globex).toHaveLength(1);
    expect(String(globex[0].contract_id)).toBe('2');

    expect(await searchContracts('   ')).toEqual([]);
  });
});
