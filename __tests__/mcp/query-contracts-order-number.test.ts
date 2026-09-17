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

jest.mock('@/app/lib/mcp/context', () => ({
  __esModule: true,
  requireMcpContext: () => ({
    userMetadata: { organizationId: 'org-1', baseCurrency: 'EUR' },
  }),
}));

jest.mock('@/app/lib/mcp/update-contract', () => ({
  __esModule: true,
  updateContractFromMcp: jest.fn(),
}));

jest.mock('@/lib/v2/invoices/access', () => ({
  __esModule: true,
  hasInvoicesAccess: async () => true,
}));

const mockGetContractsList = jest.fn<() => Promise<{ contracts: unknown[] }>>();
const mockGetArchivedContracts =
  jest.fn<() => Promise<{ contracts: unknown[] }>>();
const mockGetContract = jest.fn<(id: unknown) => Promise<unknown>>();
jest.mock('@/lib/v2', () => ({
  __esModule: true,
  getContractsList: () => mockGetContractsList(),
  getArchivedContracts: () => mockGetArchivedContracts(),
  getContract: (id: unknown) => mockGetContract(id),
  filterForAggregation: (rows: unknown[]) => rows,
}));

import { contractsTools } from '@/app/lib/mcp/tools/cpm/contracts';

beforeEach(() => {
  mockGetArchivedContracts.mockResolvedValue({ contracts: [] });
});

const queryTool = contractsTools.find((t) => t.name === 'query_contracts')!;
const getTool = contractsTools.find((t) => t.name === 'get_contract')!;

function makeEnriched(id: number, orderNumber?: string | number) {
  return {
    id,
    vendor_id: 1,
    vendor_name: 'Acme',
    vendor_domain: null,
    products: [],
    isFullySuperseded: false,
    isLinkedChildInvoice: false,
    priceHistory: null,
    contract: {
      id,
      organization_id: 'org-1',
      status: 'active',
      metadata:
        orderNumber !== undefined
          ? { lineage: { order_number: orderNumber } }
          : {},
    },
  };
}

async function runQuery(input: Record<string, unknown>) {
  const parsed = (
    queryTool.inputSchema as { parse: (v: unknown) => unknown }
  ).parse(input);
  return (await queryTool.handler(parsed as never, {} as never)) as {
    count: number;
    contracts: Array<{ id: number; orderNumber: string | null }>;
  };
}

describe('query_contracts — order_number_contains', () => {
  beforeEach(() => {
    mockGetContractsList.mockResolvedValue({
      contracts: [
        makeEnriched(1, 'INV-2024-001'),
        makeEnriched(2, 768208),
        makeEnriched(3),
      ],
    });
  });

  it('matches case-insensitively on a substring of the extracted number', async () => {
    const result = await runQuery({ order_number_contains: 'inv-2024' });
    expect(result.contracts.map((c) => c.id)).toEqual([1]);
    expect(result.contracts[0].orderNumber).toBe('INV-2024-001');
  });

  it('matches inner segments and numeric metadata values', async () => {
    const result = await runQuery({ order_number_contains: '682' });
    expect(result.contracts.map((c) => c.id)).toEqual([2]);
    expect(result.contracts[0].orderNumber).toBe('768208');
  });

  it('excludes contracts without an extracted number', async () => {
    const result = await runQuery({ order_number_contains: 'anything' });
    expect(result.count).toBe(0);
  });

  it('always surfaces orderNumber on rows, null when absent', async () => {
    const result = await runQuery({});
    expect(result.contracts.map((c) => c.orderNumber)).toEqual([
      'INV-2024-001',
      '768208',
      null,
    ]);
  });

  it('ignores punctuation differences between query and stored value', async () => {
    mockGetContractsList.mockResolvedValue({
      contracts: [makeEnriched(4, '20220523')],
    });
    const result = await runQuery({ order_number_contains: '202.205-23' });
    expect(result.contracts.map((c) => c.id)).toEqual([4]);
  });

  it('rejects a punctuation-only filter instead of silently returning nothing', async () => {
    await expect(runQuery({ order_number_contains: '---' })).rejects.toThrow(
      'order_number_contains must contain letters or digits.',
    );
  });

  it("status 'all' merges archived rows; default stays published-only", async () => {
    mockGetArchivedContracts.mockResolvedValue({
      contracts: [makeEnriched(9, 'ARCH-9')],
    });

    const all = await runQuery({ status: 'all' });
    expect(all.contracts.map((c) => c.id)).toEqual([1, 2, 3, 9]);

    const active = await runQuery({});
    expect(active.contracts.map((c) => c.id)).toEqual([1, 2, 3]);
  });
});

async function runGet(input: Record<string, unknown>) {
  const parsed = (
    getTool.inputSchema as { parse: (v: unknown) => unknown }
  ).parse(input);
  return getTool.handler(parsed as never, {} as never);
}

describe('get_contract — lookup by order_number', () => {
  beforeEach(() => {
    mockGetContractsList.mockResolvedValue({
      contracts: [
        makeEnriched(4, '20220523'),
        makeEnriched(5, 'CT-2025-001'),
        makeEnriched(6, 'CT-2025-001'),
      ],
    });
  });

  it('resolves a punctuated number to the normalized stored value', async () => {
    mockGetContract.mockResolvedValue({
      id: 4,
      organization_id: 'org-1',
      status: 'active',
      metadata: { lineage: { order_number: '20220523' } },
    });

    const result = (await runGet({ order_number: '202.205-23' })) as {
      found: boolean;
      contract: { id: number; order_number: string | null };
    };

    expect(result.found).toBe(true);
    expect(mockGetContract).toHaveBeenCalledWith(4);
    expect(result.contract.id).toBe(4);
    expect(result.contract.order_number).toBe('20220523');
  });

  it('returns candidates when several contracts share the number', async () => {
    const result = (await runGet({ order_number: 'ct2025001' })) as {
      found: boolean;
      reason?: string;
      requestedOrderNumber?: string;
      note?: string;
      candidates?: Array<{ id: number; orderNumber: string | null }>;
    };

    expect(result.found).toBe(false);
    expect(result.reason).toBe('ambiguous_order_number');
    expect(result.requestedOrderNumber).toBe('ct2025001');
    expect(result.note).toContain('exactly as the user typed it');
    expect(result.candidates?.map((c) => c.id)).toEqual([5, 6]);
    expect(
      result.candidates?.every((c) => c.orderNumber === 'CT-2025-001'),
    ).toBe(true);
  });

  it('returns found:false when nothing matches', async () => {
    const result = (await runGet({ order_number: 'ZZZ-999' })) as {
      found: boolean;
    };
    expect(result.found).toBe(false);
  });

  it('rejects a call with neither id nor order_number', async () => {
    await expect(runGet({})).rejects.toThrow('Provide id or order_number.');
  });
});

describe('get_contract — order_number in identity', () => {
  it('returns the extracted number alongside id/vendor/status', async () => {
    mockGetContract.mockResolvedValue({
      id: 635,
      organization_id: 'org-1',
      status: 'active',
      metadata: { lineage: { order_number: '00768208' } },
    });

    const parsed = (
      getTool.inputSchema as { parse: (v: unknown) => unknown }
    ).parse({ id: 635 });
    const result = (await getTool.handler(parsed as never, {} as never)) as {
      found: boolean;
      contract: { order_number: string | null };
    };

    expect(result.found).toBe(true);
    expect(result.contract.order_number).toBe('00768208');
  });

  it('normalizes a numeric extracted value to a string', async () => {
    mockGetContract.mockResolvedValue({
      id: 636,
      organization_id: 'org-1',
      status: 'active',
      metadata: { lineage: { order_number: 768208 } },
    });

    const parsed = (
      getTool.inputSchema as { parse: (v: unknown) => unknown }
    ).parse({ id: 636 });
    const result = (await getTool.handler(parsed as never, {} as never)) as {
      contract: { order_number: string | null };
    };

    expect(result.contract.order_number).toBe('768208');
  });
});
