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
    cache: {
      getOrFetch: <T>(_key: string, fetcher: () => Promise<T>) => fetcher(),
    },
  }),
}));

jest.mock('@/app/lib/mcp/update-contract', () => ({
  __esModule: true,
  updateContractFromMcp: jest.fn(),
}));

const hasInvoicesAccess = jest.fn<() => Promise<boolean>>();
jest.mock('@/lib/v2/invoices/access', () => ({
  __esModule: true,
  hasInvoicesAccess: () => hasInvoicesAccess(),
}));

type Enriched = ReturnType<typeof makeEnriched>;
const mockGetContractsList =
  jest.fn<() => Promise<{ contracts: Enriched[] }>>();
const mockGetArchivedContracts =
  jest.fn<() => Promise<{ contracts: Enriched[] }>>();
const mockGetContract = jest.fn<(id: number) => Promise<unknown>>();
const vendorMetrics = {
  totalVendorContractValue: 999,
  relationshipStartDate: '2020-01-01',
  projectedEndDate: '2027-01-01',
  relationshipLengthDisplay: '7 years',
};
jest.mock('@/lib/v2', () => ({
  __esModule: true,
  getContractsList: () => mockGetContractsList(),
  getArchivedContracts: () => mockGetArchivedContracts(),
  getContract: (id: number) => mockGetContract(id),
  filterForAggregation: (rows: unknown[]) => rows,
  getMissingFields: () => [],
  fetchVendorDetails: async () => ({
    id: 1,
    name: 'Acme',
    domain: null,
    asset_classes: [],
  }),
  getVendorContractsWithMetrics: (vendorId: number, contracts: Enriched[]) => ({
    contracts: contracts.filter((c) => c.vendor_id === vendorId),
    metrics: vendorMetrics,
  }),
  getVendorSidProducts: async () => [],
}));

jest.mock('@/lib/v2/contracts/service', () => ({
  __esModule: true,
  getContractsList: () => mockGetContractsList(),
}));

jest.mock('@/utils/supabase/service_server', () => ({
  __esModule: true,
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          in: async () => ({ data: [], error: null }),
        }),
        order: async () => ({ data: [], error: null }),
      }),
    }),
  }),
}));

jest.mock('@/utils/supabase/server', () => ({
  __esModule: true,
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: async () => ({ count: 0, error: null }),
      }),
    }),
  }),
}));

jest.mock('@/lib/v2/groups/service', () => ({
  __esModule: true,
  getOrgBusinessGroups: async () => [{ id: 10, name: 'Trading' }],
  getGroupsWithContracts: async () => [],
  getContractIdsForGroup: async () => [1, 2, 3],
  getContractBusinessGroups: async () => [],
}));

jest.mock('@/app/lib/mcp/tools/cpm/reports', () => ({
  __esModule: true,
  REPORT_INFO: {},
}));

import { contractTypes } from '@/app/lib/constants';
import { contractsTools } from '@/app/lib/mcp/tools/cpm/contracts';
import { vendorsTools } from '@/app/lib/mcp/tools/cpm/vendors';
import { renewalsTools } from '@/app/lib/mcp/tools/cpm/renewals';
import { groupsTools } from '@/app/lib/mcp/tools/cpm/groups';
import { allMcpResources } from '@/app/lib/mcp/resources';

const tool = (tools: { name: string }[], name: string) =>
  tools.find((t) => t.name === name) as (typeof contractsTools)[number];

const listTool = tool(contractsTools, 'list_contracts');
const queryTool = tool(contractsTools, 'query_contracts');
const getTool = tool(contractsTools, 'get_contract');
const vendorTool = tool(vendorsTools, 'get_vendor');
const upcomingTool = tool(renewalsTools, 'get_upcoming_renewals');
const groupsTool = tool(groupsTools, 'get_groups');
const businessGroupsResource = allMcpResources.find(
  (r) => r.uri === 'cpm://reference/business-groups',
)!;

const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);

function makeEnriched(
  id: number,
  typeId: number,
  opts: { orderNumber?: string; group?: string } = {},
) {
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
      type_id: typeId,
      contract_types: { id: typeId, name: `type-${typeId}` },
      term_start_date: [{ date: '2026-01-01' }],
      term_end_date: [{ date: soon }],
      contract_tags: [],
      products: [],
      vendors: { name: 'Acme' },
      contract_owners: opts.group
        ? [
            {
              id: id * 100,
              role: 'group',
              user_id: null,
              org_employee_id: null,
              label: null,
              org_unit_id: 5,
              org_units: {
                name: opts.group,
                level: 'cost_center',
                parent_id: null,
              },
            },
          ]
        : [],
      metadata: opts.orderNumber
        ? { lineage: { order_number: opts.orderNumber } }
        : {},
    },
  };
}

const MSA = makeEnriched(1, contractTypes.MSA, {
  orderNumber: 'MSA-1',
  group: 'Trading',
});
const INVOICE = makeEnriched(2, contractTypes.Invoice, {
  orderNumber: 'INV-2024-001',
  group: 'Trading',
});
const EA_INVOICE = makeEnriched(3, contractTypes.EAINV, {
  orderNumber: 'EAINV-7',
  group: 'Trading',
});

const ids = (rows: Array<{ id: number }>) => rows.map((r) => r.id);

async function run(t: typeof queryTool, input: Record<string, unknown>) {
  const parsed = (t.inputSchema as { parse: (v: unknown) => unknown }).parse(
    input,
  );
  return t.handler(parsed as never, {} as never);
}

beforeEach(() => {
  hasInvoicesAccess.mockReset();
  hasInvoicesAccess.mockResolvedValue(true);
  mockGetContractsList.mockResolvedValue({
    contracts: [MSA, INVOICE, EA_INVOICE],
  });
  mockGetArchivedContracts.mockResolvedValue({ contracts: [] });
  mockGetContract.mockImplementation(
    async (id) =>
      [MSA, INVOICE, EA_INVOICE].find((c) => c.id === id)?.contract ?? null,
  );
});

describe('contract-listing tools never return invoices by default', () => {
  it('list_contracts drops both invoice types, including archived ones', async () => {
    mockGetArchivedContracts.mockResolvedValue({
      contracts: [makeEnriched(4, contractTypes.Invoice)],
    });
    const result = (await run(listTool, { status: 'all' })) as {
      totalMatched: number;
      contracts: Array<{ id: number }>;
    };
    expect(ids(result.contracts)).toEqual([1]);
    expect(result.totalMatched).toBe(1);
  });

  it('query_contracts drops invoices without consulting the module toggle', async () => {
    const result = (await run(queryTool, { vendor_name_contains: 'acme' })) as {
      contracts: Array<{ id: number }>;
    };
    expect(ids(result.contracts)).toEqual([1]);
    expect(hasInvoicesAccess).not.toHaveBeenCalled();
  });

  it('get_vendor lists only non-invoice rows but keeps metrics from the full set', async () => {
    const result = (await run(vendorTool, { id: 1 })) as {
      metrics: { contractCount: number; totalVendorContractValueBase: number };
      contracts: Array<{ id: number }>;
    };
    expect(ids(result.contracts)).toEqual([1]);
    expect(result.metrics.contractCount).toBe(1);
    expect(result.metrics.totalVendorContractValueBase).toBe(999);
  });

  it('get_upcoming_renewals ignores invoices whose term ends in the window', async () => {
    const result = (await run(upcomingTool, { days: 60 })) as {
      contracts: Array<{ contractId: number }>;
    };
    expect(result.contracts.map((r) => r.contractId)).toEqual([1]);
  });

  it('get_groups excludes invoices from a group and from a vendor lookup', async () => {
    const byGroup = (await run(groupsTool, { groupName: 'Trading' })) as {
      contracts?: Array<{ contractId: number }>;
    };
    expect((byGroup.contracts ?? []).map((c) => c.contractId)).toEqual([1]);

    mockGetContractsList.mockResolvedValue({ contracts: [INVOICE] });
    const byVendor = (await run(groupsTool, { vendorName: 'acme' })) as {
      noResults?: boolean;
    };
    expect(byVendor.noResults).toBe(true);
  });

  it('business-groups resource counts contracts only', async () => {
    const result = (await businessGroupsResource.load()) as {
      businessGroups: Array<{ name: string; contractCount: number }>;
    };
    expect(result.businessGroups).toEqual([
      { name: 'Trading', contractCount: 1 },
    ]);
  });
});

describe('invoices are reachable only on explicit request, gated by the org toggle', () => {
  it('include_invoices:true returns invoices alongside contracts', async () => {
    const result = (await run(queryTool, { include_invoices: true })) as {
      contracts: Array<{ id: number }>;
    };
    expect(ids(result.contracts)).toEqual([1, 2, 3]);
  });

  it('contract_type:"Invoice" and "EAINV" each return exactly their type', async () => {
    const invoices = (await run(queryTool, { contract_type: 'invoice' })) as {
      contracts: Array<{ id: number }>;
    };
    expect(ids(invoices.contracts)).toEqual([2]);
    const eaInvoices = (await run(queryTool, { contract_type: 'EAINV' })) as {
      contracts: Array<{ id: number }>;
    };
    expect(ids(eaInvoices.contracts)).toEqual([3]);
  });

  it('a non-invoice contract_type never includes invoices and skips the toggle lookup', async () => {
    const result = (await run(queryTool, { contract_type: 'MSA' })) as {
      contracts: Array<{ id: number }>;
    };
    expect(ids(result.contracts)).toEqual([1]);
    expect(hasInvoicesAccess).not.toHaveBeenCalled();
  });

  it('a full type name that resolves to no abbreviation still reaches invoices', async () => {
    const result = (await run(queryTool, { contract_type: 'type-6' })) as {
      contracts: Array<{ id: number }>;
    };
    expect(ids(result.contracts)).toEqual([2]);
  });

  it('the Invoices module being off overrides every opt-in', async () => {
    hasInvoicesAccess.mockResolvedValue(false);
    const optIn = (await run(queryTool, { include_invoices: true })) as {
      contracts: Array<{ id: number }>;
    };
    expect(ids(optIn.contracts)).toEqual([1]);
    const byType = (await run(queryTool, { contract_type: 'Invoice' })) as {
      count: number;
    };
    expect(byType.count).toBe(0);
  });

  it('get_contract by order_number finds an invoice only while the module is on', async () => {
    const found = (await run(getTool, {
      order_number: 'INV-2024-001',
    })) as { found: boolean; id?: number };
    expect(found.found).toBe(true);

    hasInvoicesAccess.mockResolvedValue(false);
    const hidden = (await run(getTool, { order_number: 'INV-2024-001' })) as {
      found: boolean;
    };
    expect(hidden.found).toBe(false);
  });

  it('get_contract by id is untouched by the listing rule', async () => {
    hasInvoicesAccess.mockResolvedValue(false);
    const result = (await run(getTool, { id: 2 })) as { found: boolean };
    expect(result.found).toBe(true);
    expect(hasInvoicesAccess).not.toHaveBeenCalled();
  });
});
