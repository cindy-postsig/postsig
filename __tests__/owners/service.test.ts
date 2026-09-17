jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const ORG = 'org-1';
const CONTRACT = 42;

interface DbCall {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  filters: Record<string, unknown>;
  rows?: Record<string, unknown>[];
  values?: Record<string, unknown>;
}

const calls: DbCall[] = [];

let ownerRows: Record<string, unknown>[] = [];
let insertError: { code: string } | null = null;

const defaultTableRows = (): Record<string, Record<string, unknown>[]> => ({
  users: [
    { id: 'u-1', name: 'Ada Lovelace', email: 'ada@acme.com' },
    { id: 'u-2', name: null, email: 'grace@acme.com' },
  ],
  org_employees: [
    { id: 10, first_name: 'Alan', last_name: 'Turing', organization_id: ORG },
  ],
  org_units: [
    { id: 100, name: 'Engineering' },
    { id: 200, name: 'Finance' },
  ],
  contracts: [{ id: CONTRACT, organization_id: ORG }],
});

let tableRows = defaultTableRows();

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({
    from: (table: string) => {
      const call: DbCall = { table, op: 'select', filters: {} };
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        select: () => builder,
        delete: () => {
          call.op = 'delete';
          return builder;
        },
        update: (values: Record<string, unknown>) => {
          call.op = 'update';
          call.values = values;
          return builder;
        },
        insert: (rows: Record<string, unknown>[]) => {
          call.op = 'insert';
          call.rows = rows;
          calls.push(call);
          return Promise.resolve({ error: insertError });
        },
        eq: (column: string, value: unknown) => {
          call.filters[column] = value;
          return builder;
        },
        in: (column: string, value: unknown) => {
          call.filters[column] = value;
          return builder;
        },
        then: (
          resolve: (value: { data: unknown; error: null }) => unknown,
          reject: (reason: unknown) => unknown,
        ) => {
          calls.push(call);
          const data =
            call.op === 'delete' || call.op === 'update'
              ? null
              : table === 'contract_owners'
                ? ownerRows
                : (tableRows[table] ?? []);
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      });
      return builder;
    },
  }),
}));

const logOwnerChanged = jest.fn();
jest.mock('@/data/superuser/activities', () => ({
  logOwnerChanged: (...args: unknown[]) => logOwnerChanged(...args),
}));

const invalidateContractSetForOrg = jest.fn();
jest.mock('@/app/lib/redis/cache-service', () => ({
  getCacheService: async () => ({ invalidateContractSetForOrg }),
}));

import logger from '@/utils/pino';
import {
  replaceContractOwners,
  saveContractOwners,
} from '@/lib/v2/owners/service';
import { AuthorizationError, ValidationError } from '@/lib/errors';

const base = {
  organizationId: ORG,
  contractId: CONTRACT,
  actorUserId: 'actor-1',
  actorName: 'Cindy',
};

const inserts = () => calls.filter((c) => c.op === 'insert');
const deletes = () => calls.filter((c) => c.op === 'delete');
const updates = () => calls.filter((c) => c.op === 'update');

beforeEach(() => {
  calls.length = 0;
  ownerRows = [];
  tableRows = defaultTableRows();
  insertError = null;
  logOwnerChanged.mockReset();
  invalidateContractSetForOrg.mockReset();
  jest.mocked(logger.warn).mockClear();
});

describe('replaceContractOwners', () => {
  it('inserts only what is new and deletes nothing', async () => {
    ownerRows = [
      {
        id: 1,
        role: 'sponsor',
        user_id: 'u-1',
        org_employee_id: null,
        label: null,
        org_unit_id: null,
      },
    ];

    const result = await replaceContractOwners({
      ...base,
      sponsors: [
        { kind: 'user', id: 'u-1' },
        { kind: 'employee', id: 10 },
      ],
      groupUnitIds: [100],
    });

    expect(result).toEqual({ added: 2, removed: 0 });
    expect(deletes()).toHaveLength(0);
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0].rows).toEqual([
      {
        organization_id: ORG,
        contract_id: CONTRACT,
        role: 'sponsor',
        user_id: null,
        org_employee_id: 10,
        label: null,
        org_unit_id: null,
        created_by: 'actor-1',
      },
      {
        organization_id: ORG,
        contract_id: CONTRACT,
        role: 'group',
        user_id: null,
        org_employee_id: null,
        label: null,
        org_unit_id: 100,
        created_by: 'actor-1',
      },
    ]);
  });

  it('deletes only the rows that left, by id', async () => {
    ownerRows = [
      {
        id: 1,
        role: 'sponsor',
        user_id: 'u-1',
        org_employee_id: null,
        label: null,
        org_unit_id: null,
      },
      {
        id: 2,
        role: 'group',
        user_id: null,
        org_employee_id: null,
        label: null,
        org_unit_id: 200,
      },
    ];

    const result = await replaceContractOwners({
      ...base,
      sponsors: [{ kind: 'user', id: 'u-1' }],
      groupUnitIds: [],
    });

    expect(result).toEqual({ added: 0, removed: 1 });
    expect(inserts()).toHaveLength(0);
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0].filters).toEqual({
      organization_id: ORG,
      contract_id: CONTRACT,
      id: [2],
    });
  });

  it('inserts before it deletes', async () => {
    ownerRows = [
      {
        id: 2,
        role: 'group',
        user_id: null,
        org_employee_id: null,
        label: null,
        org_unit_id: 200,
      },
    ];

    await replaceContractOwners({
      ...base,
      sponsors: [{ kind: 'user', id: 'u-1' }],
      groupUnitIds: [],
    });

    const ops = calls
      .filter((call) => call.table === 'contract_owners')
      .map((call) => call.op);
    expect(ops).toContain('insert');
    expect(ops.indexOf('delete')).toBeGreaterThan(ops.indexOf('insert'));
  });

  it('writes nothing, logs nothing and busts no cache when nothing changed', async () => {
    ownerRows = [
      {
        id: 1,
        role: 'sponsor',
        user_id: null,
        org_employee_id: null,
        label: 'Acme',
        org_unit_id: null,
      },
      {
        id: 2,
        role: 'group',
        user_id: null,
        org_employee_id: null,
        label: null,
        org_unit_id: 100,
      },
    ];

    const result = await replaceContractOwners({
      ...base,
      sponsors: [{ kind: 'label', name: '  acme ' }],
      groupUnitIds: [100, 100],
    });

    expect(result).toEqual({ added: 0, removed: 0 });
    expect(inserts()).toHaveLength(0);
    expect(deletes()).toHaveLength(0);
    expect(logOwnerChanged).not.toHaveBeenCalled();
    expect(invalidateContractSetForOrg).not.toHaveBeenCalled();
  });

  it('trims labels, drops blank ones and collapses them case-insensitively', async () => {
    await replaceContractOwners({
      ...base,
      sponsors: [
        { kind: 'label', name: '  Acme  ' },
        { kind: 'label', name: 'ACME' },
        { kind: 'label', name: '   ' },
      ],
      groupUnitIds: [],
    });

    expect(inserts()[0].rows).toEqual([
      expect.objectContaining({ role: 'sponsor', label: 'Acme' }),
    ]);
  });

  it('dedupes sponsor refs by kind and id', async () => {
    await replaceContractOwners({
      ...base,
      sponsors: [
        { kind: 'user', id: 'u-1' },
        { kind: 'user', id: 'u-1' },
        { kind: 'employee', id: 10 },
        { kind: 'employee', id: 10 },
      ],
      groupUnitIds: [],
    });

    expect(inserts()[0].rows).toHaveLength(2);
  });

  it('logs one owner_changed per added and removed owner, with display names', async () => {
    ownerRows = [
      {
        id: 3,
        role: 'group',
        user_id: null,
        org_employee_id: null,
        label: null,
        org_unit_id: 200,
      },
    ];

    await replaceContractOwners({
      ...base,
      sponsors: [{ kind: 'user', id: 'u-1' }],
      groupUnitIds: [100],
    });

    expect(logOwnerChanged).toHaveBeenCalledTimes(3);
    expect(logOwnerChanged).toHaveBeenCalledWith({
      contractId: CONTRACT,
      action: 'added',
      ownerName: 'Ada Lovelace',
      changedBy: 'Cindy',
      userId: 'actor-1',
    });
    expect(logOwnerChanged).toHaveBeenCalledWith({
      contractId: CONTRACT,
      action: 'added',
      ownerGroup: 'Engineering',
      changedBy: 'Cindy',
      userId: 'actor-1',
    });
    expect(logOwnerChanged).toHaveBeenCalledWith({
      contractId: CONTRACT,
      action: 'removed',
      ownerGroup: 'Finance',
      changedBy: 'Cindy',
      userId: 'actor-1',
    });
  });

  it('falls back to the email when a user has no name', async () => {
    await replaceContractOwners({
      ...base,
      sponsors: [{ kind: 'user', id: 'u-2' }],
      groupUnitIds: [],
    });

    expect(logOwnerChanged).toHaveBeenCalledWith(
      expect.objectContaining({ ownerName: 'grace@acme.com' }),
    );
  });

  it('invalidates the org contract cache exactly once', async () => {
    await replaceContractOwners({
      ...base,
      sponsors: [{ kind: 'label', name: 'Acme' }],
      groupUnitIds: [100],
    });

    expect(invalidateContractSetForOrg).toHaveBeenCalledTimes(1);
    expect(invalidateContractSetForOrg).toHaveBeenCalledWith({
      organizationId: ORG,
    });
  });

  it('keeps the save and the cache bust when the activity log write fails', async () => {
    logOwnerChanged.mockRejectedValue(new Error('activity insert failed'));

    const result = await replaceContractOwners({
      ...base,
      sponsors: [{ kind: 'label', name: 'Acme' }],
      groupUnitIds: [],
    });

    expect(result).toEqual({ added: 1, removed: 0 });
    expect(invalidateContractSetForOrg).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, contractId: CONTRACT }),
      'Failed to record the activity for an owner change',
    );
  });

  it('maps a cross-organization reference to a validation error', async () => {
    insertError = { code: '23503' };

    await expect(
      replaceContractOwners({
        ...base,
        sponsors: [{ kind: 'user', id: 'u-from-another-org' }],
        groupUnitIds: [],
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(deletes()).toHaveLength(0);
    expect(invalidateContractSetForOrg).not.toHaveBeenCalled();
  });

  it('pins the organization on every read, insert and delete', async () => {
    ownerRows = [
      {
        id: 1,
        role: 'sponsor',
        user_id: 'u-1',
        org_employee_id: null,
        label: null,
        org_unit_id: null,
      },
    ];

    await replaceContractOwners({
      ...base,
      sponsors: [{ kind: 'employee', id: 10 }],
      groupUnitIds: [100],
    });

    for (const call of calls) {
      if (call.op === 'insert') {
        for (const row of call.rows ?? []) {
          expect(row.organization_id).toBe(ORG);
        }
      } else {
        expect(call.filters.organization_id).toBe(ORG);
      }
    }
  });
});

describe('saveContractOwners', () => {
  const saveBase = {
    organizationId: ORG,
    contractId: CONTRACT,
    actorUserId: 'actor-1',
    actorName: 'Cindy',
  };

  const groupRow = {
    id: 2,
    role: 'group',
    user_id: null,
    org_employee_id: null,
    label: null,
    org_unit_id: 100,
  };

  it('refuses a contract in another organization before writing anything', async () => {
    tableRows.contracts = [{ id: CONTRACT, organization_id: 'org-2' }];

    const save = saveContractOwners({
      ...saveBase,
      sponsors: [{ kind: 'label', name: 'Acme' }],
      groupUnitIds: [],
      justification: 'Renewal',
    });

    await expect(save).rejects.toBeInstanceOf(AuthorizationError);
    await expect(save).rejects.toThrow(
      'Cross-organization contract access denied',
    );
    expect(updates()).toHaveLength(0);
    expect(inserts()).toHaveLength(0);
  });

  it('refuses a contract that does not exist', async () => {
    tableRows.contracts = [];

    await expect(
      saveContractOwners({ ...saveBase, sponsors: [], groupUnitIds: [] }),
    ).rejects.toThrow('Contract not found');
  });

  it('refuses an employee sponsor in another organization', async () => {
    tableRows.org_employees = [
      {
        id: 10,
        first_name: 'Alan',
        last_name: 'Turing',
        organization_id: 'org-2',
      },
    ];

    const save = saveContractOwners({
      ...saveBase,
      sponsors: [{ kind: 'employee', id: 10 }],
      groupUnitIds: [],
    });

    await expect(save).rejects.toBeInstanceOf(AuthorizationError);
    await expect(save).rejects.toThrow(
      'Cross-organization employee access denied',
    );
    expect(inserts()).toHaveLength(0);
  });

  it('refuses an employee sponsor that does not exist', async () => {
    tableRows.org_employees = [];

    await expect(
      saveContractOwners({
        ...saveBase,
        sponsors: [{ kind: 'employee', id: 10 }],
        groupUnitIds: [],
      }),
    ).rejects.toThrow('Employee not found');
  });

  it('writes only the columns it was given, never business_sponsor', async () => {
    await saveContractOwners({
      ...saveBase,
      sponsors: [{ kind: 'label', name: 'Acme' }],
      groupUnitIds: [],
      justification: 'Renewal',
    });

    expect(updates()).toHaveLength(1);
    expect(updates()[0].table).toBe('contracts');
    expect(Object.keys(updates()[0].values ?? {})).toEqual([
      'business_justification',
      'updated_at',
    ]);
    expect(updates()[0].values?.business_justification).toBe('Renewal');
    expect(updates()[0].filters).toEqual({
      id: CONTRACT,
      organization_id: ORG,
    });
  });

  it('writes the order on its own', async () => {
    await saveContractOwners({
      ...saveBase,
      sponsors: [],
      groupUnitIds: [],
      order: null,
    });

    expect(Object.keys(updates()[0].values ?? {})).toEqual([
      'business_order',
      'updated_at',
    ]);
  });

  it('touches no contract column when neither justification nor order is given', async () => {
    await saveContractOwners({
      ...saveBase,
      sponsors: [{ kind: 'label', name: 'Acme' }],
      groupUnitIds: [],
    });

    expect(updates()).toHaveLength(0);
    expect(inserts()).toHaveLength(1);
  });

  it('busts the org contract cache when only a column changed and no owner row moved', async () => {
    await saveContractOwners({
      ...saveBase,
      sponsors: [],
      groupUnitIds: [],
      justification: 'Renewal',
    });

    expect(updates()).toHaveLength(1);
    expect(inserts()).toHaveLength(0);
    expect(invalidateContractSetForOrg).toHaveBeenCalledTimes(1);
    expect(invalidateContractSetForOrg).toHaveBeenCalledWith({
      organizationId: ORG,
    });
  });

  it('busts the cache once, not twice, when a column and an owner row both changed', async () => {
    await saveContractOwners({
      ...saveBase,
      sponsors: [{ kind: 'label', name: 'Acme' }],
      groupUnitIds: [],
      justification: 'Renewal',
    });

    expect(inserts()).toHaveLength(1);
    expect(invalidateContractSetForOrg).toHaveBeenCalledTimes(1);
  });

  it('busts no cache when nothing at all changed', async () => {
    await saveContractOwners({
      ...saveBase,
      sponsors: [],
      groupUnitIds: [],
    });

    expect(invalidateContractSetForOrg).not.toHaveBeenCalled();
  });

  it('passes the existing groups through when groupUnitIds is omitted', async () => {
    ownerRows = [
      {
        id: 1,
        role: 'sponsor',
        user_id: 'u-1',
        org_employee_id: null,
        label: null,
        org_unit_id: null,
      },
      groupRow,
    ];

    await saveContractOwners({ ...saveBase, sponsors: [] });

    expect(inserts()).toHaveLength(0);
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0].filters.id).toEqual([1]);
  });

  it('clears the groups when an empty list is sent', async () => {
    ownerRows = [groupRow];

    await saveContractOwners({ ...saveBase, sponsors: [], groupUnitIds: [] });

    expect(deletes()[0].filters.id).toEqual([2]);
  });
});
