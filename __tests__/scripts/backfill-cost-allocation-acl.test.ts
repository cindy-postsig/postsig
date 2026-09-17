import { classifyExistingAllocations } from '@/scripts/backfill-cost-allocation-acl';

// The header and its lines are two requests, so a run that dies between them
// leaves a header with no lines. Counting that header as "allocated" would
// make every rerun skip the contract and freeze the half-written state.
describe('classifyExistingAllocations', () => {
  it('counts a header with lines as done and a line-less header as reusable', () => {
    const result = classifyExistingAllocations([
      { id: 10, contract_id: 1, contract_cost_allocation_lines: [{ id: 100 }] },
      { id: 11, contract_id: 2, contract_cost_allocation_lines: [] },
    ]);
    expect([...result.allocatedContractIds]).toEqual([1]);
    expect([...result.emptyHeaderIdByContract]).toEqual([[2, 11]]);
  });

  it('never offers a header for reuse on a contract that also has a complete allocation', () => {
    const result = classifyExistingAllocations([
      { id: 12, contract_id: 3, contract_cost_allocation_lines: [] },
      { id: 13, contract_id: 3, contract_cost_allocation_lines: [{ id: 101 }] },
    ]);
    expect([...result.allocatedContractIds]).toEqual([3]);
    expect(result.emptyHeaderIdByContract.size).toBe(0);
  });

  it('is empty for an org with no allocations', () => {
    const result = classifyExistingAllocations([]);
    expect(result.allocatedContractIds.size).toBe(0);
    expect(result.emptyHeaderIdByContract.size).toBe(0);
  });
});
