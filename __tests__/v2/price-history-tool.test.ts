/**
 * Unit coverage for the get_price_history MCP tool's branching, name
 * resolution, and projection. The vendor rollup (buildVendorPriceSummaries)
 * and the scoped data access are exercised elsewhere, so they're mocked here.
 */
import type { VendorPriceSummary } from '@/lib/v2/reports/price-history/summary';
import { NotFoundToolError, ValidationToolError } from '@/app/lib/mcp/errors';

const mockBuild = jest.fn();
const mockScoped = jest.fn();
const mockResolve = jest.fn();
const mockLoadContext = jest.fn();
const mockGetContracts = jest.fn();

jest.mock('@/lib/v2', () => ({
  getActiveAndArchivedContracts: () => mockGetContracts(),
}));
jest.mock('@/lib/v2/contracts/priceHistoryScope', () => ({
  getScopedPriceHistoryContracts: (...args: unknown[]) => mockScoped(...args),
  resolvePriceHistoryName: (...args: unknown[]) => mockResolve(...args),
  loadPriceHistoryContext: () => mockLoadContext(),
}));
jest.mock('@/lib/v2/reports/price-history/summary', () => ({
  buildVendorPriceSummaries: (...args: unknown[]) => mockBuild(...args),
}));
jest.mock('@/app/lib/mcp/context', () => ({
  requireMcpContext: () => ({
    userMetadata: { organizationFY: 1, organizationId: 'org1' },
  }),
}));
jest.mock('@/app/lib/mcp/guards', () => ({
  assertSameOrg: <T>(rows: T) => rows,
}));

import { priceHistoryTools } from '@/app/lib/mcp/tools/cpm/price-history';

const handler = priceHistoryTools[0].handler;
const run = (input: Record<string, unknown>) => handler(input, {});

const PRODUCT_ID = 11;

const vendorWithChain = (): VendorPriceSummary => ({
  vendorId: 1,
  vendorName: 'Acme',
  vendorDomain: 'acme.com',
  contractCount: 2,
  currency: 'USD',
  currentACV: 1000,
  renewalPercent: 12.345,
  periods: [
    { label: '2023', fees: 800, status: 'historical' },
    { label: '2024', fees: 1000.555, status: 'current' },
  ],
  products: [
    {
      productId: PRODUCT_ID,
      productName: 'P1',
      renewalPercent: 12.345,
      periods: [
        { label: '2023', fees: 800 },
        { label: '2024', fees: 1000.555 },
      ],
      contracts: [
        {
          contractId: 100,
          contractType: 'MSA',
          isArchived: true,
          renewalPercent: null,
          periods: [{ label: '2023', fees: 800 }],
        },
        {
          contractId: 101,
          contractType: 'Amendment',
          isArchived: false,
          renewalPercent: 25,
          amendsContractId: 100,
          amendsContractType: 'MSA',
          periods: [{ label: '2024', fees: 1000.555 }],
        },
      ],
    },
  ],
});

const secondVendor = (): VendorPriceSummary => ({
  vendorId: 2,
  vendorName: 'Globex',
  contractCount: 1,
  currency: 'USD',
  currentACV: 500,
  renewalPercent: null,
  periods: [{ label: '2024', fees: 500, status: 'current' }],
  products: [],
});

beforeEach(() => {
  mockGetContracts.mockReset().mockResolvedValue({ contracts: [] });
  mockScoped.mockReset().mockResolvedValue([]);
  mockResolve.mockReset().mockResolvedValue({ products: [], vendors: [] });
  mockLoadContext
    .mockReset()
    .mockResolvedValue({ raw: [], relationships: [], fiscalYearStartMonth: 1 });
  mockBuild.mockReset().mockReturnValue({
    vendors: [vendorWithChain(), secondVendor()],
    periodLabels: ['2023', '2024'],
  });
});

describe('get_price_history — list mode', () => {
  it('uses the full fetch and paginates with rounded fees', async () => {
    const res = (await run({})) as any;
    expect(mockGetContracts).toHaveBeenCalled();
    expect(mockScoped).not.toHaveBeenCalled();
    expect(res.mode).toBe('vendors');
    expect(res.count).toBe(2);
    expect(res.vendors[0].periods[1]).toEqual({
      year: '2024',
      fees: 1000.56,
      status: 'current',
    });
    expect(res.vendors[0].renewalPercent).toBe(12.3);
  });
});

describe('get_price_history — selector validation', () => {
  it('rejects more than one selector', async () => {
    await expect(
      run({ product_id: PRODUCT_ID, vendor_id: 1 }),
    ).rejects.toBeInstanceOf(ValidationToolError);
  });
});

describe('get_price_history — vendor mode', () => {
  it('scope-fetches the vendor and returns its rollup', async () => {
    const res = (await run({ vendor_id: 1 })) as any;
    // The preloaded context rides along so the engine rollup gets the same
    // relationships the scoped fetch used.
    expect(mockScoped).toHaveBeenCalledWith(
      { vendorId: 1 },
      expect.objectContaining({ relationships: expect.any(Array) }),
    );
    expect(res.mode).toBe('vendor');
    expect(res.vendor.vendorId).toBe(1);
  });

  it('throws NotFoundToolError for an unknown vendor', async () => {
    await expect(run({ vendor_id: 999 })).rejects.toBeInstanceOf(
      NotFoundToolError,
    );
  });
});

describe('get_price_history — product drill-down', () => {
  it('scope-fetches the product and returns its trajectory', async () => {
    const res = (await run({ product_id: PRODUCT_ID })) as any;
    expect(mockScoped).toHaveBeenCalledWith(
      { productId: PRODUCT_ID },
      expect.objectContaining({ relationships: expect.any(Array) }),
    );
    expect(res.mode).toBe('product');
    expect(res.productId).toBe(PRODUCT_ID);
    expect(res.product.contracts).toHaveLength(2);
    expect(res.product.contracts[1].amendsContractId).toBe(100);
  });

  it('throws NotFoundToolError when the product is absent', async () => {
    await expect(run({ product_id: 999 })).rejects.toBeInstanceOf(
      NotFoundToolError,
    );
  });
});

describe('get_price_history — name resolution (query)', () => {
  it('resolves a single product name and scope-fetches it (one context load)', async () => {
    mockResolve.mockResolvedValueOnce({
      products: [
        {
          productId: PRODUCT_ID,
          productName: 'P1',
          vendorId: 1,
          vendorName: 'Acme',
        },
      ],
      vendors: [],
    });
    const res = (await run({ query: 'P1' })) as any;
    // Raw context is loaded once and threaded into both resolve + scope.
    expect(mockLoadContext).toHaveBeenCalledTimes(1);
    expect(mockResolve).toHaveBeenCalledWith('P1', expect.anything());
    expect(mockScoped).toHaveBeenCalledWith(
      { productId: PRODUCT_ID },
      expect.anything(),
    );
    expect(res.mode).toBe('product');
    expect(res.productId).toBe(PRODUCT_ID);
  });

  it('returns a disambiguation list when multiple products match', async () => {
    mockResolve.mockResolvedValueOnce({
      products: [
        {
          productId: PRODUCT_ID,
          productName: 'P1',
          vendorId: 1,
          vendorName: 'Acme',
        },
        {
          productId: 12,
          productName: 'P1 Add-on',
          vendorId: 1,
          vendorName: 'Acme',
        },
      ],
      vendors: [],
    });
    const res = (await run({ query: 'P1' })) as any;
    expect(res.mode).toBe('matches');
    expect(res.matches).toHaveLength(2);
    expect(res.matches[0].type).toBe('product');
    expect(mockScoped).not.toHaveBeenCalled();
  });

  it('falls back to a vendor name match', async () => {
    mockResolve.mockResolvedValueOnce({
      products: [],
      vendors: [{ vendorId: 2, vendorName: 'Globex' }],
    });
    const res = (await run({ query: 'Globex' })) as any;
    expect(mockScoped).toHaveBeenCalledWith({ vendorId: 2 }, expect.anything());
    expect(res.mode).toBe('vendor');
    expect(res.vendor.vendorId).toBe(2);
  });

  it('throws NotFoundToolError when nothing matches', async () => {
    await expect(run({ query: 'zzz' })).rejects.toBeInstanceOf(
      NotFoundToolError,
    );
  });
});
