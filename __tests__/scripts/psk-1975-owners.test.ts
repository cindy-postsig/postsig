import {
  classifyOwnerTabCandidates,
  planDeletions,
  planOwnerRun,
  sponsorNamesOf,
  type AllocationRow,
  type ExistingOwnerRow,
  type OwnerRunInput,
} from '@/scripts/lib/psk-1975-owners';
import type { OrgUnitNode } from '@/lib/v2/org-units/tree';
import type { OwnerSponsorRef } from '@/lib/v2/owners/types';

const units: OrgUnitNode[] = [
  { id: 10, level: 'business_group', name: 'Data Science', parent_id: null },
  { id: 11, level: 'business_group', name: 'Trading', parent_id: null },
  { id: 20, level: 'department', name: 'Quant', parent_id: 10 },
];

const groups = [
  { id: 1, name: 'Data Science' },
  { id: 2, name: 'Trading' },
  { id: 3, name: 'Marketing' },
];

function allocation(overrides: Partial<AllocationRow>): AllocationRow {
  return {
    id: 100,
    contract_id: 1,
    product_id: null,
    mode: 'manual',
    created_by: null,
    updated_by: null,
    updated_at: null,
    created_at: '2026-08-26T23:30:30.000Z',
    lines: [{ org_unit_id: 10, org_employee_id: null, percent: 100 }],
    ...overrides,
  };
}

const matchByPrefix = (names: string[]): OwnerSponsorRef[] =>
  names.map((name) =>
    name.startsWith('user:')
      ? { kind: 'user', id: name.slice(5) }
      : name.startsWith('emp:')
        ? { kind: 'employee', id: Number(name.slice(4)) }
        : { kind: 'label', name },
  );

function existingRow(
  overrides: Partial<ExistingOwnerRow> & { contract_id: number; role: string },
): ExistingOwnerRow {
  return {
    user_id: null,
    org_employee_id: null,
    label: null,
    org_unit_id: null,
    ...overrides,
  };
}

function input(overrides: Partial<OwnerRunInput> = {}): OwnerRunInput {
  let minted = 0;
  return {
    groups,
    units,
    contracts: [],
    contractAclGroups: [],
    folderContracts: [],
    folderAclGroups: [],
    existingOwners: [],
    allocations: [],
    contractUpdates: [],
    confirmedOwnerTabAllocationIds: new Set(),
    matchSponsors: matchByPrefix,
    mintUnitId: () => --minted,
    ...overrides,
  };
}

const groupRows = (plan: ReturnType<typeof planOwnerRun>, contractId: number) =>
  plan.rows
    .filter((r) => r.contractId === contractId && r.role === 'group')
    .map((r) => (r.role === 'group' ? r.orgUnitId : -1))
    .sort((a, b) => a - b);

describe('sponsorNamesOf', () => {
  it('reads arrays of strings, a bare string, and { name } objects, trimmed and deduped', () => {
    expect(sponsorNamesOf(['Ada ', 'Ada', '', 'Grace'])).toEqual([
      'Ada',
      'Grace',
    ]);
    expect(sponsorNamesOf('Ada')).toEqual(['Ada']);
    expect(sponsorNamesOf({ name: ' Ada ' })).toEqual(['Ada']);
    expect(sponsorNamesOf(null)).toEqual([]);
    expect(sponsorNamesOf([42, null, { other: 'x' }])).toEqual([]);
  });
});

describe('classifyOwnerTabCandidates', () => {
  const human = allocation({
    id: 200,
    contract_id: 5,
    created_by: 'user-1',
    created_at: '2026-08-27T10:00:05.000Z',
    lines: [
      { org_unit_id: 10, org_employee_id: null, percent: 50 },
      { org_unit_id: 11, org_employee_id: null, percent: 50 },
    ],
  });

  it('pairs an Owner-tab-shaped human allocation with a contracts UPDATE just before it', () => {
    const [candidate] = classifyOwnerTabCandidates({
      units,
      allocations: [human],
      contractUpdates: [
        { contractId: 5, timestamp: '2026-08-27T10:00:03.000Z' },
      ],
    });
    expect(candidate).toMatchObject({
      allocationId: 200,
      contractId: 5,
      nodeIds: [10, 11],
      pairedUpdateAt: '2026-08-27T10:00:03.000Z',
      verdict: 'owner-tab',
    });
  });

  it('marks a shaped allocation with no contracts write nearby as unpaired (Cost Allocation tab)', () => {
    const [candidate] = classifyOwnerTabCandidates({
      units,
      allocations: [human],
      contractUpdates: [
        { contractId: 5, timestamp: '2026-08-27T09:00:00.000Z' },
        { contractId: 5, timestamp: '2026-08-27T10:00:06.000Z' },
      ],
    });
    expect(candidate.verdict).toBe('unpaired');
    expect(candidate.pairedUpdateAt).toBeNull();
  });

  it('ignores backfill rows, rows before #2145, uneven or non-group lines, and product scopes', () => {
    const candidates = classifyOwnerTabCandidates({
      units,
      contractUpdates: [],
      allocations: [
        allocation({ id: 1 }),
        allocation({
          id: 2,
          created_by: 'u',
          created_at: '2026-08-20T00:00:00.000Z',
        }),
        allocation({
          id: 3,
          created_by: 'u',
          created_at: '2026-08-27T00:00:00.000Z',
          lines: [
            { org_unit_id: 10, org_employee_id: null, percent: 70 },
            { org_unit_id: 11, org_employee_id: null, percent: 30 },
          ],
        }),
        allocation({
          id: 4,
          created_by: 'u',
          created_at: '2026-08-27T00:00:00.000Z',
          lines: [{ org_unit_id: 20, org_employee_id: null, percent: 100 }],
        }),
        allocation({
          id: 5,
          created_by: 'u',
          created_at: '2026-08-27T00:00:00.000Z',
          product_id: 9,
        }),
        allocation({
          id: 6,
          created_by: 'u',
          created_at: '2026-08-27T00:00:00.000Z',
          lines: [{ org_unit_id: null, org_employee_id: 3, percent: 100 }],
        }),
      ],
    });
    expect(candidates).toEqual([]);
  });
});

describe('planOwnerRun — group sources', () => {
  it('converts perm=write ACL rows to group rows by normalized name and ignores read shares', () => {
    const plan = planOwnerRun(
      input({
        contracts: [{ id: 1, business_group: null, business_sponsor: null }],
        contractAclGroups: [
          { contract_id: 1, group_id: 1, perm: 'write' },
          { contract_id: 1, group_id: 2, perm: 'read' },
        ],
      }),
    );
    expect(groupRows(plan, 1)).toEqual([10]);
    expect(plan.groupSources.get(1)).toBe('write-acl');
    expect(plan.createdUnits).toEqual([]);
  });

  it('falls back to the legacy business_group scalar, minting a root node when none matches', () => {
    const plan = planOwnerRun(
      input({
        contracts: [
          { id: 1, business_group: '  trading ', business_sponsor: null },
          { id: 2, business_group: 'Marketing', business_sponsor: null },
          { id: 3, business_group: 'marketing', business_sponsor: null },
        ],
      }),
    );
    expect(groupRows(plan, 1)).toEqual([11]);
    expect(plan.createdUnits).toEqual([
      { id: -1, level: 'business_group', name: 'Marketing', parent_id: null },
    ]);
    expect(groupRows(plan, 2)).toEqual([-1]);
    expect(groupRows(plan, 3)).toEqual([-1]);
    expect(plan.groupSources.get(2)).toBe('scalar');
  });

  it('writes nothing for a contract with only read or folder shares', () => {
    const plan = planOwnerRun(
      input({
        contracts: [
          { id: 1, business_group: null, business_sponsor: null },
          { id: 2, business_group: null, business_sponsor: null },
        ],
        contractAclGroups: [{ contract_id: 1, group_id: 1, perm: 'read' }],
        folderContracts: [{ contract_id: 2, folder_id: 7 }],
        folderAclGroups: [{ folder_id: 7, group_id: 1 }],
      }),
    );
    expect(plan.rows).toEqual([]);
    expect(plan.groupSources.get(1)).toBe('none');
    expect(plan.groupSources.get(2)).toBe('none');
  });

  it('prefers a confirmed Owner-tab allocation over an older write ACL row', () => {
    const plan = planOwnerRun(
      input({
        contracts: [{ id: 5, business_group: null, business_sponsor: null }],
        contractAclGroups: [{ contract_id: 5, group_id: 1, perm: 'write' }],
        allocations: [
          allocation({
            id: 200,
            contract_id: 5,
            created_by: 'u',
            created_at: '2026-08-27T10:00:05.000Z',
            lines: [{ org_unit_id: 11, org_employee_id: null, percent: 100 }],
          }),
        ],
        contractUpdates: [
          { contractId: 5, timestamp: '2026-08-27T10:00:04.000Z' },
        ],
        confirmedOwnerTabAllocationIds: new Set([200]),
      }),
    );
    expect(groupRows(plan, 5)).toEqual([11]);
    expect(plan.groupSources.get(5)).toBe('owner-tab');
  });

  it('skips a contract whose Owner-tab candidate is not confirmed, sponsors included', () => {
    const plan = planOwnerRun(
      input({
        contracts: [{ id: 5, business_group: null, business_sponsor: ['Ada'] }],
        contractAclGroups: [{ contract_id: 5, group_id: 1, perm: 'write' }],
        allocations: [
          allocation({
            id: 200,
            contract_id: 5,
            created_by: 'u',
            created_at: '2026-08-27T10:00:05.000Z',
          }),
        ],
        contractUpdates: [
          { contractId: 5, timestamp: '2026-08-27T10:00:04.000Z' },
        ],
      }),
    );
    expect(plan.rows).toEqual([]);
    expect(plan.skippedUnconfirmed).toEqual([5]);
    expect(plan.groupSources.has(5)).toBe(false);
  });

  it('adds only the rows a contract does not already have, and reports the merge', () => {
    const plan = planOwnerRun(
      input({
        contracts: [
          {
            id: 1,
            business_group: 'Trading',
            business_sponsor: ['emp:7', 'Ada', 'user:u-1'],
          },
        ],
        contractAclGroups: [{ contract_id: 1, group_id: 1, perm: 'write' }],
        existingOwners: [
          existingRow({ contract_id: 1, role: 'group', org_unit_id: 10 }),
          existingRow({ contract_id: 1, role: 'sponsor', org_employee_id: 7 }),
        ],
      }),
    );
    expect(plan.rows).toEqual([
      { contractId: 1, role: 'sponsor', ref: { kind: 'label', name: 'Ada' } },
      { contractId: 1, role: 'sponsor', ref: { kind: 'user', id: 'u-1' } },
    ]);
    expect(plan.mergedContracts).toEqual([1]);
  });

  it('is idempotent: a contract whose rows all exist gets nothing and is not a merge', () => {
    const plan = planOwnerRun(
      input({
        contracts: [
          { id: 1, business_group: null, business_sponsor: ['ACME'] },
        ],
        contractAclGroups: [{ contract_id: 1, group_id: 1, perm: 'write' }],
        existingOwners: [
          existingRow({ contract_id: 1, role: 'group', org_unit_id: 10 }),
          existingRow({ contract_id: 1, role: 'sponsor', label: 'acme' }),
        ],
      }),
    );
    expect(plan.rows).toEqual([]);
    expect(plan.mergedContracts).toEqual([]);
  });

  it('seeds label casing from labels already saved in the org', () => {
    const plan = planOwnerRun(
      input({
        contracts: [
          { id: 2, business_group: null, business_sponsor: ['acme'] },
        ],
        existingOwners: [
          existingRow({ contract_id: 1, role: 'sponsor', label: 'ACME' }),
        ],
      }),
    );
    expect(plan.rows).toEqual([
      { contractId: 2, role: 'sponsor', ref: { kind: 'label', name: 'ACME' } },
    ]);
  });
});

describe('planOwnerRun — sponsors', () => {
  it('writes matched users and employees by id and unmatched names as labels', () => {
    const plan = planOwnerRun(
      input({
        contracts: [
          {
            id: 1,
            business_group: null,
            business_sponsor: ['user:u-1', 'emp:7', 'External Co', 'user:u-1'],
          },
        ],
      }),
    );
    expect(plan.rows).toEqual([
      { contractId: 1, role: 'sponsor', ref: { kind: 'user', id: 'u-1' } },
      { contractId: 1, role: 'sponsor', ref: { kind: 'employee', id: 7 } },
      {
        contractId: 1,
        role: 'sponsor',
        ref: { kind: 'label', name: 'External Co' },
      },
    ]);
    expect(plan.sponsorStats).toEqual({
      contractsWithSponsors: 1,
      users: 1,
      employees: 1,
      labels: 1,
    });
  });

  it('dedupes labels case-insensitively per contract and keeps one casing per org', () => {
    const plan = planOwnerRun(
      input({
        contracts: [
          { id: 1, business_group: null, business_sponsor: ['Acme', 'ACME'] },
          { id: 2, business_group: null, business_sponsor: ['acme'] },
        ],
      }),
    );
    expect(plan.rows).toEqual([
      { contractId: 1, role: 'sponsor', ref: { kind: 'label', name: 'Acme' } },
      { contractId: 2, role: 'sponsor', ref: { kind: 'label', name: 'Acme' } },
    ]);
  });
});

describe('planOwnerRun — census of backfilled contracts', () => {
  it('buckets every created_by-null allocation by what its contract actually had', () => {
    const plan = planOwnerRun(
      input({
        contracts: [
          { id: 1, business_group: null, business_sponsor: null },
          { id: 2, business_group: 'Trading', business_sponsor: null },
          { id: 3, business_group: null, business_sponsor: null },
          { id: 4, business_group: null, business_sponsor: null },
          { id: 5, business_group: null, business_sponsor: null },
          { id: 6, business_group: null, business_sponsor: null },
        ],
        contractAclGroups: [
          { contract_id: 1, group_id: 1, perm: 'write' },
          { contract_id: 3, group_id: 1, perm: 'read' },
        ],
        folderContracts: [{ contract_id: 4, folder_id: 7 }],
        folderAclGroups: [{ folder_id: 7, group_id: 1 }],
        allocations: [1, 2, 3, 4, 5].map((contractId) =>
          allocation({ id: contractId, contract_id: contractId }),
        ),
      }),
    );
    expect(plan.census).toEqual({
      'write-acl': [1],
      scalar: [2],
      'read-only': [3],
      'folder-only': [4],
      unshared: [5],
    });
  });
});

describe('planDeletions', () => {
  const contracts = [
    { id: 1, business_group: null, business_sponsor: null },
    { id: 2, business_group: null, business_sponsor: null },
    { id: 3, business_group: null, business_sponsor: null },
  ];
  const acl = [
    { contract_id: 1, group_id: 1, perm: 'write' },
    { contract_id: 2, group_id: 1, perm: 'read' },
    { contract_id: 3, group_id: 2, perm: 'write' },
  ];

  it("deletes a backfill row the oracle reproduces from today's ACL rows, share or not", () => {
    const plan = planDeletions(
      input({
        contracts,
        contractAclGroups: acl,
        allocations: [
          allocation({ id: 1, contract_id: 1 }),
          allocation({ id: 2, contract_id: 2 }),
        ],
      }),
    );
    expect(plan.deletable.map((d) => [d.allocation.id, d.reason])).toEqual([
      [1, 'backfill'],
      [2, 'backfill'],
    ]);
    expect(plan.drifted).toEqual([]);
  });

  it('keeps and reports a backfill row whose stored nodes no longer match the ACL state', () => {
    const plan = planDeletions(
      input({
        contracts,
        contractAclGroups: acl,
        allocations: [allocation({ id: 3, contract_id: 3 })],
      }),
    );
    expect(plan.deletable).toEqual([]);
    expect(plan.drifted).toEqual([
      {
        allocation: expect.objectContaining({ id: 3 }),
        storedNodeIds: [10],
        derivedNodeIds: [11],
        reason: 'nodes-differ',
      },
    ]);
  });

  it('keeps a created_by-null row whose shape is not a backfill shape, and says why', () => {
    const plan = planDeletions(
      input({
        contracts,
        contractAclGroups: acl,
        allocations: [
          allocation({
            id: 3,
            contract_id: 1,
            updated_by: 'u',
            updated_at: '2026-08-27T00:00:00.000Z',
          }),
          allocation({ id: 4, contract_id: 1, product_id: 9 }),
          allocation({
            id: 5,
            contract_id: 1,
            lines: [
              { org_unit_id: 10, org_employee_id: null, percent: 50 },
              { org_unit_id: null, org_employee_id: 3, percent: 50 },
            ],
          }),
        ],
      }),
    );
    expect(plan.deletable).toEqual([]);
    expect(plan.drifted.map((d) => [d.allocation.id, d.reason])).toEqual([
      [3, 'hand-edited'],
      [4, 'product-scope'],
      [5, 'employee-lines'],
    ]);
  });

  it('never touches human rows unless confirmed as Owner-tab saves', () => {
    const human = allocation({ id: 9, contract_id: 1, created_by: 'u' });
    const untouched = planDeletions(
      input({ contracts, contractAclGroups: acl, allocations: [human] }),
    );
    expect(untouched).toEqual({ deletable: [], drifted: [] });

    const confirmed = planDeletions(
      input({
        contracts,
        contractAclGroups: acl,
        allocations: [human],
        confirmedOwnerTabAllocationIds: new Set([9]),
      }),
    );
    expect(confirmed.deletable).toEqual([
      { allocation: human, reason: 'owner-tab' },
    ]);
  });
});
