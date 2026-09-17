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

// A Euro org: every converted figure the tools return is EUR-denominated
// (engine stamps target the org base currency since PSK-1796), so the
// responses must say so instead of labeling values USD (PSK-1937).
jest.mock('@/app/lib/mcp/context', () => ({
  __esModule: true,
  requireMcpContext: () => ({
    userMetadata: { organizationId: 'org-1', baseCurrency: 'EUR' },
  }),
}));

const mockGetContractsList = jest.fn<() => Promise<{ contracts: unknown[] }>>();
jest.mock('@/lib/v2', () => ({
  __esModule: true,
  getContractsList: () => mockGetContractsList(),
  getArchivedContracts: async () => ({ contracts: [] }),
  getContract: jest.fn(),
  filterForAggregation: (rows: unknown[]) => rows,
}));

import { contractsTools } from '@/app/lib/mcp/tools/cpm/contracts';
import { renewalsTools } from '@/app/lib/mcp/tools/cpm/renewals';

const listTool = contractsTools.find((t) => t.name === 'list_contracts')!;
const queryTool = contractsTools.find((t) => t.name === 'query_contracts')!;
const renewalSummaryTool = renewalsTools.find(
  (t) => t.name === 'get_renewal_summary',
)!;

function makeEnriched(id: number, currency: string | null = 'GBP') {
  return {
    id,
    vendor_id: 1,
    vendor_name: 'Acme',
    vendor_domain: null,
    products: [],
    isFullySuperseded: false,
    isLinkedChildInvoice: false,
    priceHistory: { periods: [], totalContractValueUSD: 120_000 },
    contract: {
      id,
      organization_id: 'org-1',
      status: 'active',
      currency,
      term_start_date: [{ date: '2026-01-01' }],
      term_end_date: [{ date: '2026-12-31' }],
      contract_tags: [],
      products: [],
    },
  };
}

function collectKeys(value: unknown, out: Set<string>): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, out);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      collectKeys(v, out);
    }
  }
  return out;
}

beforeEach(() => {
  mockGetContractsList.mockResolvedValue({
    contracts: [makeEnriched(1)],
  });
});

describe('CPM tool responses declare their base-currency denomination (psk-1937)', () => {
  it('list_contracts carries the org baseCurrency and *Base spend fields', async () => {
    const result = (await listTool.handler({}, {})) as {
      baseCurrency: string;
      contracts: Array<Record<string, unknown>>;
    };
    expect(result.baseCurrency).toBe('EUR');
    const row = result.contracts[0];
    expect(row.totalContractValueBase).toBe(120_000);
    // The row's own currency stays the contract's source currency.
    expect(row.currency).toBe('GBP');
  });

  it('no response key claims USD denomination', async () => {
    const result = await queryTool.handler({ aggregation_mode: 'all' }, {});
    const keys = collectKeys(result, new Set<string>());
    const usdKeys = [...keys].filter((k) => /usd/i.test(k));
    expect(usdKeys).toEqual([]);
  });

  it('get_renewal_summary reports the source currency, not a fabricated USD', async () => {
    const result = (await renewalSummaryTool.handler(
      { contract_id: 1, include: ['spend'] },
      {},
    )) as {
      baseCurrency: string;
      spend: { contractCurrency: string | null };
    };
    expect(result.baseCurrency).toBe('EUR');
    expect(result.spend.contractCurrency).toBe('GBP');
  });

  it('get_renewal_summary returns null contractCurrency when the source currency is unknown', async () => {
    mockGetContractsList.mockResolvedValue({
      contracts: [makeEnriched(2, null)],
    });
    const result = (await renewalSummaryTool.handler(
      { contract_id: 2, include: ['spend'] },
      {},
    )) as { spend: { contractCurrency: string | null } };
    expect(result.spend.contractCurrency).toBeNull();
  });
});
