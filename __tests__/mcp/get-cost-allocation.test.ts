jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const isCostAllocationEnabled = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/v2/cost-allocation/flag', () => ({
  isCostAllocationEnabled: (...args: unknown[]) =>
    isCostAllocationEnabled(...args),
}));

const getOrFetch = jest.fn((_key: string, fetcher: () => Promise<unknown>) =>
  fetcher(),
);
jest.mock('@/app/lib/mcp/context', () => ({
  requireMcpContext: () => ({
    userMetadata: { organizationId: 'org-1', baseCurrency: 'EUR' },
    tokenId: 'token-1',
    cache: { getOrFetch },
  }),
}));
const loadContractHeader = jest.fn();
jest.mock('@/lib/v2/cost-allocation/tab-data', () => ({
  loadContractHeader: (...args: unknown[]) => loadContractHeader(...args),
}));

const loadAllocationContextForContract = jest.fn();
jest.mock('@/lib/v2/cost-allocation/context', () => ({
  ...jest.requireActual('@/lib/v2/cost-allocation/context'),
  loadAllocationContextForContract: (...args: unknown[]) =>
    loadAllocationContextForContract(...args),
}));

const getContractsList = jest.fn();
jest.mock('@/lib/v2/contracts/service', () => ({
  getContractsList: (...args: unknown[]) => getContractsList(...args),
}));

import { contractTypes } from '@/app/lib/constants';
import {
  FeatureDisabledToolError,
  NotFoundToolError,
  TenantIsolationError,
} from '@/app/lib/mcp/errors';
import {
  costAllocationTools,
  getCostAllocation,
} from '@/app/lib/mcp/tools/cpm/cost-allocation';
import { NotFoundError } from '@/lib/errors';
import { buildAllocationContext } from '@/lib/v2/cost-allocation/context';

const tool = costAllocationTools.find((t) => t.name === 'get_cost_allocation');
if (!tool) throw new Error('get_cost_allocation not registered');
const handler = tool.handler as (payload: {
  id: number;
}) => ReturnType<typeof getCostAllocation>;

const MSA = 100;
const INVOICE = 300;
const ORPHAN = 302;

const ctx = buildAllocationContext({
  allocations: [{ id: 1, contract_id: MSA, product_id: null, mode: 'manual' }],
  lines: [
    {
      id: 1,
      allocation_id: 1,
      org_unit_id: 3,
      org_employee_id: null,
      percent: 60,
    },
    {
      id: 2,
      allocation_id: 1,
      org_unit_id: null,
      org_employee_id: 9,
      percent: 40,
    },
  ],
  units: [
    { id: 1, level: 'entity', name: 'Bank', parent_id: null },
    { id: 2, level: 'business_group', name: 'Global Equities', parent_id: 1 },
    { id: 3, level: 'department', name: 'Research', parent_id: 2 },
  ],
  employees: [
    {
      id: 9,
      name: 'Ada Lovelace',
      status: 'active',
      deleted_at: null,
      org_unit_id: 3,
    },
  ],
  seats: [],
  relationships: [{ parent_contract_id: MSA, child_contract_id: INVOICE }],
});

const enrichedInvoice = {
  id: INVOICE,
  vendor_name: 'Bloomberg',
  vendor_domain: 'bloomberg.com',
  products: [{ product_id: 7, name: 'Terminal', isSuperseded: false }],
  contract: {
    organization_id: 'org-1',
    type_id: contractTypes.Invoice,
    metadata: { lineage: { order_number: 'INV-300' } },
    vendor_products_details: [{ product_id: 7, fees: 1000 }],
  },
  engineSpend: {
    currentBase: 0,
    projectedBase: 0,
    currentNative: 0,
    projectedNative: 0,
    recordedBase: 1000,
    recordedNative: 1000,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  loadAllocationContextForContract.mockResolvedValue(ctx);
  getContractsList.mockResolvedValue({ contracts: [enrichedInvoice] });
});

describe('get_cost_allocation', () => {
  it('is read-only and registered with annotations', () => {
    expect(tool.annotations?.readOnlyHint).toBe(true);
    expect(tool.annotations?.destructiveHint).toBeUndefined();
    expect(tool.requiredScope).toBeUndefined();
  });

  it('returns inherited lines with percent, engine amount, breadcrumb path, and provenance', async () => {
    loadContractHeader.mockResolvedValue({
      id: INVOICE,
      type_id: contractTypes.Invoice,
      typeName: 'Invoice',
    });

    const result = await handler({ id: INVOICE });

    expect(loadContractHeader).toHaveBeenCalledWith('org-1', INVOICE);
    expect(getContractsList).toHaveBeenCalledWith({
      status: 'all',
      productValues: true,
    });
    expect(result).toEqual({
      found: true,
      contract: {
        id: INVOICE,
        isInvoice: true,
        contractType: 'Invoice',
        vendor: { name: 'Bloomberg', domain: 'bloomberg.com' },
        orderNumber: 'INV-300',
      },
      baseCurrency: 'EUR',
      provenance: { kind: 'inherited', sourceContractId: MSA },
      scopes: [
        {
          productId: null,
          productName: null,
          mode: 'manual',
          valueBase: 1000,
          lines: [
            {
              target: {
                kind: 'org_unit',
                id: 3,
                name: 'Research',
                type: 'Department',
              },
              path: ['Bank', 'Global Equities', 'Research'],
              percent: 60,
              amountBase: 600,
            },
            {
              target: {
                kind: 'employee',
                id: 9,
                name: 'Ada Lovelace',
                type: 'User',
              },
              path: ['Bank', 'Global Equities', 'Research'],
              percent: 40,
              amountBase: 400,
            },
          ],
        },
      ],
    });
  });

  it('marks an own allocation with the record itself as source', async () => {
    loadContractHeader.mockResolvedValue({
      id: MSA,
      type_id: contractTypes.MSA,
      typeName: 'MSA',
    });
    getContractsList.mockResolvedValue({
      contracts: [
        {
          ...enrichedInvoice,
          id: MSA,
          engineSpend: {
            currentBase: 12000,
            projectedBase: 12000,
            currentNative: 12000,
            projectedNative: 12000,
          },
        },
      ],
    });

    const result = await handler({ id: MSA });

    expect(result.provenance).toEqual({ kind: 'own', sourceContractId: MSA });
    expect(result.contract.isInvoice).toBe(false);
    expect(result.scopes[0].valueBase).toBe(12000);
    expect(result.scopes[0].lines[0].amountBase).toBe(7200);
  });

  it('reports an unallocated invoice as unassigned with a note', async () => {
    loadContractHeader.mockResolvedValue({
      id: ORPHAN,
      type_id: contractTypes.Invoice,
      typeName: 'Invoice',
    });
    getContractsList.mockResolvedValue({
      contracts: [{ ...enrichedInvoice, id: ORPHAN }],
    });

    const result = await handler({ id: ORPHAN });

    expect(result.provenance).toEqual({
      kind: 'unassigned',
      sourceContractId: null,
    });
    expect(result.scopes).toEqual([]);
    expect(result.notes).toEqual([
      expect.stringContaining('reports under "Unassigned"'),
    ]);
  });

  it('returns percents only, with a note, when the engine set lacks the record', async () => {
    loadContractHeader.mockResolvedValue({
      id: INVOICE,
      type_id: contractTypes.Invoice,
      typeName: 'Invoice',
    });
    getContractsList.mockResolvedValue({ contracts: [] });

    const result = await handler({ id: INVOICE });

    expect(result.contract.vendor).toBeNull();
    expect(result.scopes[0].valueBase).toBeNull();
    expect(
      result.scopes[0].lines.map(
        (l: { amountBase: number | null }) => l.amountBase,
      ),
    ).toEqual([null, null]);
    expect(result.notes).toEqual([expect.stringContaining('unavailable')]);
  });

  it("prices a past invoice's product scopes from its recorded fees", async () => {
    loadContractHeader.mockResolvedValue({
      id: INVOICE,
      type_id: contractTypes.Invoice,
      typeName: 'Invoice',
    });
    loadAllocationContextForContract.mockResolvedValue(
      buildAllocationContext({
        allocations: [
          { id: 1, contract_id: MSA, product_id: 7, mode: 'manual' },
        ],
        lines: [
          {
            id: 1,
            allocation_id: 1,
            org_unit_id: 3,
            org_employee_id: null,
            percent: 60,
          },
        ],
        units: [
          { id: 3, level: 'department', name: 'Research', parent_id: null },
        ],
        employees: [],
        seats: [],
        relationships: [
          { parent_contract_id: MSA, child_contract_id: INVOICE },
        ],
      }),
    );
    getContractsList.mockResolvedValue({
      contracts: [
        {
          ...enrichedInvoice,
          contract: {
            ...enrichedInvoice.contract,
            vendor_products_details: [{ product_id: 7, fees: 800 }],
          },
          engineSpend: {
            ...enrichedInvoice.engineSpend,
            recordedBase: 1000,
            recordedNative: 800,
          },
        },
      ],
    });

    const result = await handler({ id: INVOICE });

    expect(result.scopes[0]).toEqual(
      expect.objectContaining({
        productId: 7,
        productName: 'Terminal',
        valueBase: 1000,
      }),
    );
    expect(result.scopes[0].lines[0].amountBase).toBe(600);
    expect(result.notes).toBeUndefined();
  });

  it("prices an inheriting record absent from the engine set from its source, with the source's product name and a note", async () => {
    loadContractHeader.mockResolvedValue({
      id: INVOICE,
      type_id: contractTypes.Invoice,
      typeName: 'Invoice',
    });
    loadAllocationContextForContract.mockResolvedValue(
      buildAllocationContext({
        allocations: [
          { id: 1, contract_id: MSA, product_id: 7, mode: 'manual' },
        ],
        lines: [
          {
            id: 1,
            allocation_id: 1,
            org_unit_id: 3,
            org_employee_id: null,
            percent: 60,
          },
          {
            id: 2,
            allocation_id: 1,
            org_unit_id: null,
            org_employee_id: 9,
            percent: 40,
          },
        ],
        units: [
          { id: 3, level: 'department', name: 'Research', parent_id: null },
        ],
        employees: [
          {
            id: 9,
            name: 'Ada Lovelace',
            status: 'active',
            deleted_at: null,
            org_unit_id: 3,
          },
        ],
        seats: [],
        relationships: [
          { parent_contract_id: MSA, child_contract_id: INVOICE },
        ],
      }),
    );
    getContractsList.mockResolvedValue({
      contracts: [
        {
          ...enrichedInvoice,
          id: MSA,
          contract: { ...enrichedInvoice.contract, type_id: contractTypes.MSA },
          engineSpend: {
            currentBase: 12000,
            projectedBase: 12000,
            currentNative: 12000,
            projectedNative: 12000,
            products: { 7: { currentNative: 12000, projectedNative: 12000 } },
          },
        },
      ],
    });

    const result = await handler({ id: INVOICE });

    expect(result.contract.vendor).toBeNull();
    expect(result.scopes[0]).toEqual(
      expect.objectContaining({
        productId: 7,
        productName: 'Terminal',
        valueBase: 12000,
      }),
    );
    expect(
      result.scopes[0].lines.map(
        (l: { amountBase: number | null }) => l.amountBase,
      ),
    ).toEqual([7200, 4800]);
    expect(result.notes).toEqual([
      expect.stringContaining("allocation source's (contract #100)"),
    ]);
  });

  it('returns only the inherited product scopes for products the record carries', async () => {
    loadContractHeader.mockResolvedValue({
      id: INVOICE,
      type_id: contractTypes.Invoice,
      typeName: 'Invoice',
    });
    loadAllocationContextForContract.mockResolvedValue(
      buildAllocationContext({
        allocations: [
          { id: 1, contract_id: MSA, product_id: 7, mode: 'manual' },
          { id: 2, contract_id: MSA, product_id: 8, mode: 'manual' },
        ],
        lines: [
          {
            id: 1,
            allocation_id: 1,
            org_unit_id: 3,
            org_employee_id: null,
            percent: 100,
          },
          {
            id: 2,
            allocation_id: 2,
            org_unit_id: 3,
            org_employee_id: null,
            percent: 100,
          },
        ],
        units: [
          { id: 3, level: 'department', name: 'Research', parent_id: null },
        ],
        employees: [],
        seats: [],
        relationships: [
          { parent_contract_id: MSA, child_contract_id: INVOICE },
        ],
      }),
    );

    const result = await handler({ id: INVOICE });

    expect(result.provenance.kind).toBe('inherited');
    expect(
      result.scopes.map((s: { productId: number | null }) => s.productId),
    ).toEqual([7]);
    expect(result.scopes[0].productName).toBe('Terminal');
  });

  it('surfaces the unlinked-seat count only when nonzero', async () => {
    loadContractHeader.mockResolvedValue({
      id: MSA,
      type_id: contractTypes.MSA,
      typeName: 'MSA',
    });
    loadAllocationContextForContract.mockResolvedValue(
      buildAllocationContext({
        allocations: [
          { id: 1, contract_id: MSA, product_id: null, mode: 'active_users' },
        ],
        lines: [],
        units: [],
        employees: [
          {
            id: 9,
            name: 'Ada Lovelace',
            status: 'active',
            deleted_at: null,
            org_unit_id: null,
          },
        ],
        seats: [
          { contract_id: MSA, product_id: null, org_employee_id: 9 },
          { contract_id: MSA, product_id: null, org_employee_id: null },
        ],
        relationships: [],
      }),
    );

    const result = await handler({ id: MSA });

    expect(result.scopes[0]).toEqual(
      expect.objectContaining({ mode: 'active_users', unlinkedUserCount: 1 }),
    );
    expect(result.scopes[0].lines[0].path).toEqual([]);
  });

  it('maps a missing contract to a not-found tool error', async () => {
    loadContractHeader.mockRejectedValue(new NotFoundError('Contract'));

    await expect(handler({ id: 999 })).rejects.toBeInstanceOf(
      NotFoundToolError,
    );
    expect(getContractsList).not.toHaveBeenCalled();
  });

  it('fails closed when the engine set hands back a record from another org', async () => {
    loadContractHeader.mockResolvedValue({
      id: INVOICE,
      type_id: contractTypes.Invoice,
      typeName: 'Invoice',
    });
    getContractsList.mockResolvedValue({
      contracts: [
        {
          ...enrichedInvoice,
          contract: { ...enrichedInvoice.contract, organization_id: 'org-2' },
        },
      ],
    });

    await expect(handler({ id: INVOICE })).rejects.toBeInstanceOf(
      TenantIsolationError,
    );
  });

  it('refuses, before any lookup, for an org without the feature', async () => {
    isCostAllocationEnabled.mockResolvedValueOnce(false);

    await expect(handler({ id: INVOICE })).rejects.toBeInstanceOf(
      FeatureDisabledToolError,
    );
    expect(isCostAllocationEnabled).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
    );
    expect(loadContractHeader).not.toHaveBeenCalled();
  });
});
