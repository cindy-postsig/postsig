import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/app/lib/mcp/guards', () => ({
  __esModule: true,
  assertSameOrg: <T>(rows: T[]) => rows,
}));

jest.mock('@/app/lib/mcp/update-contract', () => ({
  __esModule: true,
  updateContractFromMcp: jest.fn(),
}));

jest.mock('@/app/lib/mcp/context', () => ({
  __esModule: true,
  requireMcpContext: () => ({
    userMetadata: { organizationId: 'org-1', baseCurrency: 'USD' },
  }),
}));

// get_vendor loads per-vendor ICT settings; an empty result set suffices.
const emptySettingsQuery = {
  in: async () => ({ data: [], error: null }),
};
const emptySettingsSelect = { eq: () => emptySettingsQuery };
jest.mock('@/utils/supabase/service_server', () => ({
  __esModule: true,
  createClient: () => ({
    from: () => ({ select: () => emptySettingsSelect }),
  }),
}));

const mockGetContractsList = jest.fn<() => Promise<{ contracts: unknown[] }>>();
const mockFetchVendorDetails = jest.fn<(id: number) => Promise<unknown>>();
jest.mock('@/lib/v2', () => ({
  __esModule: true,
  getContractsList: () => mockGetContractsList(),
  getArchivedContracts: async () => ({ contracts: [] }),
  getContract: jest.fn(),
  fetchVendorDetails: (id: number) => mockFetchVendorDetails(id),
  getVendorSidProducts: async () => [],
  getVendorContractsWithMetrics: (
    vendorId: number,
    contracts: Array<{ vendor_id: number }>,
  ) => ({
    contracts: contracts.filter((c) => c.vendor_id === vendorId),
    metrics: {
      contractCount: 1,
      activeContractCount: 1,
      totalContractValueUSD: 0,
      currentAnnualSpendUSD: 0,
    },
  }),
  filterForAggregation: (rows: unknown[]) => rows,
}));

import { contractsTools } from '@/app/lib/mcp/tools/cpm/contracts';
import { vendorsTools } from '@/app/lib/mcp/tools/cpm/vendors';

/**
 * Product name lists on query_contracts / get_vendor identify what each
 * contract licenses TODAY, so both halves of the struck set must drop out:
 * superseded products (amendment re-pricing) and products cancelled by a
 * confirmed lineage event (PSK-1830). The regression: cancelled products
 * survived the filter and the assistant presented them as licensed.
 */

function makeEnriched(id: number) {
  return {
    id,
    vendor_id: 7,
    vendor_name: 'Acme',
    vendor_domain: null,
    products: [
      { product_id: 1, name: 'Live Product', isSuperseded: false },
      { product_id: 2, name: 'Superseded Product', isSuperseded: true },
      {
        product_id: 3,
        name: 'Cancelled Product',
        isSuperseded: false,
        isCancelled: true,
      },
    ],
    isFullySuperseded: false,
    isLinkedChildInvoice: false,
    priceHistory: null,
    contract: {
      id,
      organization_id: 'org-1',
      status: 'active',
      vendor_id: 7,
      metadata: {},
    },
  };
}

beforeEach(() => {
  mockGetContractsList.mockResolvedValue({ contracts: [makeEnriched(1)] });
  mockFetchVendorDetails.mockResolvedValue({ id: 7, name: 'Acme' });
});

async function runTool(tools: typeof contractsTools, name: string, input: {}) {
  const tool = tools.find((t) => t.name === name)!;
  const parsed = (tool.inputSchema as { parse: (v: unknown) => unknown }).parse(
    input,
  );
  return (await tool.handler(parsed as never, {} as never)) as any;
}

describe('struck products are dropped from MCP product name lists', () => {
  it('query_contracts keeps only live product names', async () => {
    const result = await runTool(contractsTools, 'query_contracts', {});
    expect(result.contracts[0].products).toEqual(['Live Product']);
  });

  it('get_vendor keeps only live product names', async () => {
    const result = await runTool(vendorsTools, 'get_vendor', { id: 7 });
    expect(result.contracts[0].products).toEqual(['Live Product']);
  });
});
