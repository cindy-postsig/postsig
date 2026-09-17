import * as fs from 'fs';
import * as path from 'path';
import type { Context } from 'hono';
import { buildAllocationContext } from '@/lib/v2/cost-allocation/context';
import type {
  AllocationContext,
  AllocationLineRow,
  AllocationRow,
} from '@/lib/v2/cost-allocation/types';
import type { OrgUnitNode } from '@/lib/v2/org-units/tree';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const isCostAllocationEnabled = jest.fn();
jest.mock('@/lib/v2/cost-allocation/flag', () => ({
  isCostAllocationEnabled: (...args: unknown[]) =>
    isCostAllocationEnabled(...args),
}));

const checkAbility = jest.fn<Promise<boolean>, [string, string]>();
jest.mock('@/data/user-permissions', () => ({
  checkAbility: (action: string, subject: string) =>
    checkAbility(action, subject),
}));

const saveContractAllocation = jest.fn();
jest.mock('@/lib/v2/cost-allocation/service', () => ({
  ...jest.requireActual('@/lib/v2/cost-allocation/service'),
  saveContractAllocation: (...args: unknown[]) =>
    saveContractAllocation(...args),
}));

const loadContractHeader = jest.fn();
const loadCostAllocationTabData = jest.fn();
const loadAllocationCatalog = jest.fn();
jest.mock('@/lib/v2/cost-allocation/tab-data', () => ({
  loadContractHeader: (...args: unknown[]) => loadContractHeader(...args),
  loadCostAllocationTabData: (...args: unknown[]) =>
    loadCostAllocationTabData(...args),
  loadAllocationCatalog: (...args: unknown[]) => loadAllocationCatalog(...args),
}));

const getContractScopeValues = jest.fn();
jest.mock('@/lib/v2/cost-allocation/amounts', () => ({
  getContractScopeValues: (...args: unknown[]) =>
    getContractScopeValues(...args),
}));

const assertBudgetTargetInOrg = jest.fn();
const saveBudget = jest.fn();
jest.mock('@/lib/v2/cost-allocation/budgets', () => ({
  assertBudgetTargetInOrg: (...args: unknown[]) =>
    assertBudgetTargetInOrg(...args),
  saveBudget: (...args: unknown[]) => saveBudget(...args),
}));

let fixtureCtx: AllocationContext;
jest.mock('@/lib/v2/cost-allocation/context', () => ({
  ...jest.requireActual('@/lib/v2/cost-allocation/context'),
  loadAllocationContextForContract: jest.fn(async () => fixtureCtx),
}));

import {
  getCostAllocationCatalog,
  getCostAllocationTab,
  putAllocationBudget,
  putContractAllocation,
} from '@/app/api/v2/handlers/cost-allocation';
import { NotFoundError } from '@/lib/errors';

const ORG = 'org-1';
const admin = {
  userId: 'user-1',
  organizationId: ORG,
  userProfile: { name: 'Cindy Admin', email: 'cindy@example.com' },
};

interface JsonResponse {
  body: unknown;
  status: number;
}

/** The slice of Hono's Context the handlers touch, capturing c.json calls. */
function ctx(
  params: { id?: string; body?: unknown; jsonThrows?: boolean } = {},
): Context {
  return {
    get: (key: string) => (key === 'userMetadata' ? admin : undefined),
    req: {
      param: (name: string) => (name === 'id' ? params.id : undefined),
      json: async () => {
        if (params.jsonThrows) throw new SyntaxError('Unexpected token');
        return params.body;
      },
    },
    json: (body: unknown, status = 200): JsonResponse => ({ body, status }),
  } as unknown as Context;
}

const call = async (
  handler: (c: Context) => Promise<unknown>,
  params: { id?: string; body?: unknown; jsonThrows?: boolean } = {},
): Promise<JsonResponse> => (await handler(ctx(params))) as JsonResponse;

const validScopes = [
  {
    productId: null,
    mode: 'manual' as const,
    lines: [{ orgUnitId: 1, percent: 100 }],
  },
];

const UNITS: OrgUnitNode[] = [
  { id: 2, level: 'business_group', name: 'Markets', parent_id: null },
  { id: 5, level: 'business_group', name: 'Wealth', parent_id: null },
  { id: 6, level: 'department', name: 'Ops', parent_id: null },
  { id: 9, level: 'business_group', name: 'Asset Mgmt', parent_id: null },
];

function makeCtx(
  allocations: AllocationRow[],
  lines: AllocationLineRow[],
): AllocationContext {
  return buildAllocationContext({
    allocations,
    lines,
    units: UNITS,
    employees: [],
    seats: [],
    relationships: [],
  });
}

const EMPTY = makeCtx([], []);
const SIMPLE = makeCtx(
  [{ id: 1, contract_id: 42, product_id: null, mode: 'manual' }],
  [
    {
      id: 1,
      allocation_id: 1,
      org_unit_id: 2,
      org_employee_id: null,
      percent: 50,
    },
    {
      id: 2,
      allocation_id: 1,
      org_unit_id: 5,
      org_employee_id: null,
      percent: 50,
    },
  ],
);
const PRODUCT_SCOPED = makeCtx(
  [{ id: 1, contract_id: 42, product_id: 7, mode: 'manual' }],
  [
    {
      id: 1,
      allocation_id: 1,
      org_unit_id: 2,
      org_employee_id: null,
      percent: 100,
    },
  ],
);

beforeEach(() => {
  jest.clearAllMocks();
  isCostAllocationEnabled.mockResolvedValue(true);
  checkAbility.mockResolvedValue(true);
  loadContractHeader.mockResolvedValue({ id: 5, type_id: 1, typeName: 'MSA' });
  saveContractAllocation.mockResolvedValue(undefined);
  assertBudgetTargetInOrg.mockResolvedValue(undefined);
  saveBudget.mockResolvedValue(undefined);
  fixtureCtx = SIMPLE;
});

describe('cost-allocation flag gate', () => {
  it('404s the gated endpoints before any data access when the flag is off', async () => {
    isCostAllocationEnabled.mockResolvedValue(false);
    const offBody = { error: 'Cost allocation not found' };

    expect(await call(getCostAllocationTab, { id: '5' })).toEqual({
      body: offBody,
      status: 404,
    });
    expect(await call(getCostAllocationCatalog)).toEqual({
      body: offBody,
      status: 404,
    });
    expect(
      await call(putContractAllocation, {
        id: '5',
        body: { scopes: validScopes },
      }),
    ).toEqual({ body: offBody, status: 404 });
    expect(
      await call(putAllocationBudget, {
        body: {
          target: { kind: 'org_unit', id: 5 },
          fiscalYear: 2026,
          amount: 1,
        },
      }),
    ).toEqual({ body: offBody, status: 404 });

    expect(loadContractHeader).not.toHaveBeenCalled();
    expect(loadCostAllocationTabData).not.toHaveBeenCalled();
    expect(loadAllocationCatalog).not.toHaveBeenCalled();
    expect(saveContractAllocation).not.toHaveBeenCalled();
    expect(saveBudget).not.toHaveBeenCalled();
  });
});

describe('putContractAllocation', () => {
  it('403s users without manage Organization (the RLS role 11/12 gate)', async () => {
    checkAbility.mockResolvedValue(false);

    const res = await call(putContractAllocation, {
      id: '5',
      body: { scopes: validScopes },
    });

    expect(checkAbility).toHaveBeenCalledWith('manage', 'Organization');
    expect(res.status).toBe(403);
    expect((res.body as { error: string }).error).toMatch(
      /organization admins/,
    );
    expect(saveContractAllocation).not.toHaveBeenCalled();
  });

  it("400s with the service's validation messages verbatim", async () => {
    const res = await call(putContractAllocation, {
      id: '5',
      body: {
        scopes: [
          {
            productId: null,
            mode: 'manual',
            lines: [
              { orgUnitId: 1, percent: 50 },
              { orgUnitId: 2, percent: 30 },
            ],
          },
        ],
      },
    });

    expect(res).toEqual({
      body: { error: 'Allocation must total 100%, got 80%' },
      status: 400,
    });
    expect(saveContractAllocation).not.toHaveBeenCalled();
  });

  it('404s a contract outside the caller organization', async () => {
    loadContractHeader.mockRejectedValue(new NotFoundError('Contract'));

    const res = await call(putContractAllocation, {
      id: '999',
      body: { scopes: validScopes },
    });

    expect(res).toEqual({
      body: { error: 'Contract not found' },
      status: 404,
    });
    expect(saveContractAllocation).not.toHaveBeenCalled();
  });

  it('calls the service with the session org, user, and display name', async () => {
    const res = await call(putContractAllocation, {
      id: '5',
      body: { scopes: validScopes },
    });

    expect(res).toEqual({ body: { success: true }, status: 200 });
    expect(saveContractAllocation).toHaveBeenCalledWith({
      organizationId: ORG,
      contractId: 5,
      scopes: validScopes,
      userId: 'user-1',
      changedBy: 'Cindy Admin',
    });
  });

  it('500s unexpected failures behind a generic message', async () => {
    saveContractAllocation.mockRejectedValue(new Error('boom'));

    const res = await call(putContractAllocation, {
      id: '5',
      body: { scopes: validScopes },
    });

    expect(res).toEqual({
      body: { error: 'Failed to save the cost allocation' },
      status: 500,
    });
  });
});

describe('getCostAllocationTab', () => {
  it('combines the loader payload with engine values', async () => {
    loadCostAllocationTabData.mockResolvedValue({
      contractId: 5,
      isInvoice: true,
      resolved: { contractId: 5, scopes: [] },
      sourceContract: null,
      products: [{ id: 7, name: 'Terminal' }],
    });
    getContractScopeValues.mockResolvedValue({
      values: { contract: 10, products: {} },
      valuesFromSource: false,
    });

    const res = await call(getCostAllocationTab, { id: '5' });

    expect(loadCostAllocationTabData).toHaveBeenCalledWith(ORG, 5);
    expect(getContractScopeValues).toHaveBeenCalledWith(5, true, null);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        products: [{ id: 7, name: 'Terminal' }],
        values: { contract: 10, products: {} },
        valuesFromSource: false,
      }),
    );
  });

  it('prices an inheriting record against its allocation source', async () => {
    loadCostAllocationTabData.mockResolvedValue({
      contractId: 5,
      isInvoice: false,
      resolved: { contractId: 5, scopes: [] },
      sourceContract: { id: 100, label: 'MSA · ID 100' },
    });
    getContractScopeValues.mockResolvedValue({
      values: { contract: 900, products: {} },
      valuesFromSource: true,
    });

    const res = await call(getCostAllocationTab, { id: '5' });

    expect(getContractScopeValues).toHaveBeenCalledWith(5, false, 100);
    expect(res.body).toEqual(
      expect.objectContaining({
        values: { contract: 900, products: {} },
        valuesFromSource: true,
      }),
    );
  });

  it('400s a malformed contract id, trailing junk included', async () => {
    for (const id of ['abc', '12junk', '-3', '']) {
      const res = await call(getCostAllocationTab, { id });
      expect(res).toEqual({
        body: { error: 'Invalid contract id' },
        status: 400,
      });
    }
    expect(loadCostAllocationTabData).not.toHaveBeenCalled();
  });
});

describe('request-body validation', () => {
  it('400s malformed JSON instead of 500ing', async () => {
    const res = await call(putContractAllocation, {
      id: '5',
      jsonThrows: true,
    });
    expect(res).toEqual({
      body: { error: 'Invalid JSON body' },
      status: 400,
    });
    expect(saveContractAllocation).not.toHaveBeenCalled();
  });

  it('400s null and non-object bodies on every write', async () => {
    for (const body of [null, 'text', [1]]) {
      expect(
        (await call(putContractAllocation, { id: '5', body })).status,
      ).toBe(400);
      expect((await call(putAllocationBudget, { body })).status).toBe(400);
    }
    expect(saveContractAllocation).not.toHaveBeenCalled();
    expect(saveBudget).not.toHaveBeenCalled();
  });
});

describe('getCostAllocationCatalog', () => {
  it('serves the org-wide picker catalog', async () => {
    loadAllocationCatalog.mockResolvedValue({ catalog: [] });

    const res = await call(getCostAllocationCatalog);

    expect(loadAllocationCatalog).toHaveBeenCalledWith(ORG);
    expect(res).toEqual({ body: { catalog: [] }, status: 200 });
  });
});

describe('putAllocationBudget', () => {
  const input = {
    target: { kind: 'org_unit' as const, id: 5 },
    fiscalYear: 2026,
    amount: 1200,
  };

  it('requires manage Organization — the same gate as an allocation save', async () => {
    checkAbility.mockResolvedValue(false);

    const res = await call(putAllocationBudget, { body: input });

    expect(res).toEqual({
      body: { error: 'Only organization admins can edit budgets' },
      status: 403,
    });
    expect(saveBudget).not.toHaveBeenCalled();
  });

  it('400s an invalid target, fiscal year, or amount', async () => {
    const cases: Array<[unknown, string]> = [
      [
        { ...input, target: { kind: 'org_unit', id: 0 } },
        'Invalid budget target',
      ],
      [{ ...input, fiscalYear: 2026.5 }, 'Invalid fiscal year'],
      [{ ...input, amount: -1 }, 'A budget must be zero or more'],
      [{ ...input, amount: Number.NaN }, 'A budget must be zero or more'],
      // Finite, but *100 overflows to Infinity inside the cent rounding.
      [{ ...input, amount: 1e307 }, 'Budget amount is too large'],
    ];
    for (const [body, error] of cases) {
      expect(await call(putAllocationBudget, { body })).toEqual({
        body: { error },
        status: 400,
      });
    }
    expect(saveBudget).not.toHaveBeenCalled();
  });

  it("404s a target outside the caller's org before writing", async () => {
    assertBudgetTargetInOrg.mockRejectedValue(new NotFoundError('Org unit'));

    const res = await call(putAllocationBudget, { body: input });

    expect(res.status).toBe(404);
    expect(assertBudgetTargetInOrg).toHaveBeenCalledWith(ORG, input.target);
    expect(saveBudget).not.toHaveBeenCalled();
  });

  it('writes the cents-rounded amount for the org and author', async () => {
    const res = await call(putAllocationBudget, {
      body: { ...input, amount: 1200.456 },
    });

    expect(res).toEqual({ body: { success: true }, status: 200 });
    expect(saveBudget).toHaveBeenCalledWith({
      organizationId: ORG,
      target: input.target,
      fiscalYear: 2026,
      amount: 1200.46,
      userId: 'user-1',
    });
  });

  it('clears a budget with a null amount', async () => {
    await call(putAllocationBudget, { body: { ...input, amount: null } });

    expect(saveBudget).toHaveBeenCalledWith(
      expect.objectContaining({ amount: null }),
    );
  });

  it('500s unexpected failures behind a generic message', async () => {
    saveBudget.mockRejectedValue(new Error('db down'));

    expect(await call(putAllocationBudget, { body: input })).toEqual({
      body: { error: 'Failed to save the budget' },
      status: 500,
    });
  });
});
