jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockLoadAllocationContext = jest.fn();
jest.mock('@/lib/v2/cost-allocation/context', () => ({
  loadAllocationContext: (...args: unknown[]) =>
    mockLoadAllocationContext(...args),
}));

const mockLogAlert = jest.fn();
jest.mock('@/utils/logging/alert', () => ({
  logAlert: (...args: unknown[]) => mockLogAlert(...args),
}));

import { loadReportAllocations } from '@/lib/v2/reports/monthly-report/allocations';
import type { AllocationContext } from '@/lib/v2/cost-allocation/types';

const unit = {
  id: 7,
  level: 'business_group',
  name: 'Trading',
  parent_id: null,
} as const;

function fakeContext(): AllocationContext {
  return {
    allocationsByContractId: new Map([
      [
        1,
        [{ id: 1, contract_id: 1, product_id: null, mode: 'manual' as const }],
      ],
    ]),
    linesByAllocationId: new Map([
      [
        1,
        [
          {
            id: 1,
            allocation_id: 1,
            org_unit_id: 7,
            org_employee_id: null,
            percent: 100,
          },
        ],
      ],
    ]),
    unitsById: new Map([[7, unit]]),
    employeesById: new Map(),
    seatsByContractId: new Map(),
    hierarchy: { parents: new Map(), children: new Map() },
  } as unknown as AllocationContext;
}

describe('loadReportAllocations', () => {
  beforeEach(() => {
    mockLoadAllocationContext.mockReset();
    mockLogAlert.mockReset();
  });

  it('resolves the contracts against the loaded context, passing relationships through', async () => {
    mockLoadAllocationContext.mockResolvedValue(fakeContext());

    const result = await loadReportAllocations(
      'org-1',
      [{ id: 1 }, { id: 2 }],
      [],
    );

    expect(mockLoadAllocationContext).toHaveBeenCalledWith(
      'org-1',
      undefined,
      [],
    );
    expect(result.resolved.get(1)?.scopes[0].lines[0].target).toEqual({
      kind: 'org_unit',
      id: 7,
      name: 'Trading',
    });
    expect(result.resolved.get(2)?.scopes).toEqual([]);
    expect(result.unitsById.get(7)).toEqual(unit);
    expect(mockLogAlert).not.toHaveBeenCalled();
  });

  it('degrades to no allocations behind a paged alert when the load fails', async () => {
    const failure = new Error('boom');
    mockLoadAllocationContext.mockRejectedValue(failure);

    const result = await loadReportAllocations('org-1', [{ id: 1 }], []);

    expect(result.resolved.size).toBe(0);
    expect(result.unitsById.size).toBe(0);
    expect(mockLogAlert).toHaveBeenCalledWith(
      'cost-allocation-context-failure',
      failure,
      { organizationId: 'org-1' },
      expect.stringContaining('Spend by Business Group'),
    );
  });
});
