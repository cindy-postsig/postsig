import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockLoggerWarn = jest.fn();

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
  },
}));

const mockLogAlert = jest.fn();

jest.mock('@/utils/logging/alert', () => ({
  logAlert: (...args: unknown[]) => mockLogAlert(...args),
}));

interface ContractRow {
  id: number;
  organization_id: string | null;
  vendor_id: number | null;
}

let contractRows: ContractRow[] = [];
/** Vendor pairs the `contract_relationship_vendors_related` RPC treats as related. */
let relatedVendorPairs: Array<[number, number]> = [];
let upsertPayloads: Array<Record<string, unknown>> = [];
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
/** Set to make the endpoint fetch fail instead of returning rows. */
let selectError: { message: string } | null = null;
/** Set to make the relatedness RPC fail instead of answering. */
let rpcError: { message: string } | null = null;
/**
 * Set to simulate `ignoreDuplicates` swallowing the write: PostgREST returns an
 * empty row set when the pair already has an edge.
 */
let upsertSwallowed = false;

const selectContractsByIds = (_column: string, ids: number[]) =>
  Promise.resolve(
    selectError
      ? { data: null, error: selectError }
      : {
          data: contractRows.filter((row) => ids.includes(row.id)),
          error: null,
        },
  );

const recordUpsert = (payload: Record<string, unknown>) => {
  upsertPayloads.push(payload);
};

/**
 * Chainable PostgREST stub covering the two tables the guard touches:
 * `contracts` (endpoint fetch) and `contract_relationships` (the upsert the
 * guard protects). Vendor relatedness is an RPC, stubbed separately.
 */
function makeContractsBuilder() {
  const builder: Record<string, unknown> = {
    select: () => builder,
    in: selectContractsByIds,
  };
  return builder;
}

function makeRelationshipsBuilder() {
  const builder: Record<string, unknown> = {
    upsert: (payload: Record<string, unknown>) => {
      recordUpsert(payload);
      return builder;
    },
    select: () =>
      Promise.resolve({
        data: upsertSwallowed ? [] : [{ id: 99 }],
        error: null,
      }),
  };
  return builder;
}

const builders: Record<string, () => Record<string, unknown>> = {
  contracts: makeContractsBuilder,
  contract_relationships: makeRelationshipsBuilder,
};

/** Mirrors the DB function: same id, or an explicitly related pair either way. */
const resolveVendorsRelated = (
  fn: string,
  args: { p_vendor_a: number; p_vendor_b: number },
) => {
  rpcCalls.push({ fn, args });
  if (rpcError) return Promise.resolve({ data: null, error: rpcError });
  const { p_vendor_a: a, p_vendor_b: b } = args;
  const related =
    a === b ||
    relatedVendorPairs.some(
      ([x, y]) => (a === x && b === y) || (a === y && b === x),
    );
  return Promise.resolve({ data: related, error: null });
};

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({
    from: (table: string) => builders[table](),
    rpc: (fn: string, args: { p_vendor_a: number; p_vendor_b: number }) =>
      resolveVendorsRelated(fn, args),
  }),
}));

jest.mock('@/data/superuser/vendors', () => ({
  getCurrentVendorsByOriginalVendorIds: jest.fn(async () => []),
}));

import { saveContractLineage } from '@/data/superuser/contracts';
import { ContractLineageInvariantError } from '@/lib/errors';

const ORG_ID = 'org-1';
const OTHER_ORG_ID = 'org-2';
const PARENT_ID = 100;
const CHILD_ID = 200;

const endpoints = (
  parentVendorId: number | null,
  childVendorId: number | null,
  childOrgId: string = ORG_ID,
): ContractRow[] => [
  { id: PARENT_ID, organization_id: ORG_ID, vendor_id: parentVendorId },
  { id: CHILD_ID, organization_id: childOrgId, vendor_id: childVendorId },
];

const alertArgs = (fragment: string) => [
  'contract-relationship-invalid',
  expect.any(Error),
  { parentContractId: PARENT_ID, childContractId: CHILD_ID },
  expect.stringContaining(fragment),
];

describe('saveContractLineage guardrails', () => {
  beforeEach(() => {
    contractRows = [];
    relatedVendorPairs = [];
    upsertPayloads = [];
    rpcCalls.length = 0;
    selectError = null;
    rpcError = null;
    upsertSwallowed = false;
    mockLogAlert.mockClear();
    mockLoggerWarn.mockClear();
  });

  it('allows linking contracts in the same org under the same vendor', async () => {
    contractRows = endpoints(11, 11);

    await expect(
      saveContractLineage(PARENT_ID, CHILD_ID, { note: 'x' }),
    ).resolves.toEqual({ id: 99 });
    expect(upsertPayloads).toHaveLength(1);
    expect(mockLogAlert).not.toHaveBeenCalled();
  });

  it('does not write vendor_id onto the relationship row', async () => {
    // Vendor identity lives on the linked contracts and in metadata.vendor_id;
    // the relationship column is retired (Task 3.1) ahead of being dropped.
    contractRows = endpoints(11, 11);

    await saveContractLineage(PARENT_ID, CHILD_ID, { vendor_id: 11 });

    expect(upsertPayloads[0]).toEqual({
      parent_contract_id: PARENT_ID,
      child_contract_id: CHILD_ID,
      metadata: { vendor_id: 11 },
      relationship_type: null,
    });
    expect(upsertPayloads[0]).not.toHaveProperty('vendor_id');
  });

  it('defaults to a hierarchy edge when no type is passed', async () => {
    contractRows = endpoints(11, 11);

    await saveContractLineage(PARENT_ID, CHILD_ID, null);

    expect(upsertPayloads[0]).toMatchObject({ relationship_type: null });
  });

  it('writes the requested edge type onto the relationship row', async () => {
    contractRows = endpoints(11, 11);

    await expect(
      saveContractLineage(PARENT_ID, CHILD_ID, null, 'billing'),
    ).resolves.toEqual({ id: 99 });
    expect(upsertPayloads[0]).toMatchObject({ relationship_type: 'billing' });
  });

  it('treats a swallowed duplicate hierarchy edge as the intended no-op', async () => {
    // Re-running detection over already-linked data hits this constantly.
    contractRows = endpoints(11, 11);
    upsertSwallowed = true;

    await expect(
      saveContractLineage(PARENT_ID, CHILD_ID, null),
    ).resolves.toBeUndefined();
    expect(mockLogAlert).not.toHaveBeenCalled();
  });

  it('rejects and alerts when a billing edge is swallowed as a duplicate', async () => {
    // A billing edge names an *additional* parent, so a collision with the
    // pair-unique constraint means the caller picked the existing hierarchy
    // parent. Silently returning no row would drop the write.
    contractRows = endpoints(11, 11);
    upsertSwallowed = true;

    await expect(
      saveContractLineage(PARENT_ID, CHILD_ID, null, 'billing'),
    ).rejects.toThrow(ContractLineageInvariantError);
    expect(mockLogAlert).toHaveBeenCalledWith(...alertArgs('already linked'));
  });

  it('enforces the org and vendor guards on billing edges too', async () => {
    contractRows = endpoints(33, 44);

    await expect(
      saveContractLineage(PARENT_ID, CHILD_ID, null, 'billing'),
    ).rejects.toThrow(ContractLineageInvariantError);
    expect(upsertPayloads).toHaveLength(0);
  });

  it('allows linking contracts the relatedness function accepts', async () => {
    // The PSK-1693 case: parent stored under data.ai, child under Sensor Tower.
    contractRows = endpoints(11, 22);
    relatedVendorPairs = [[11, 22]];

    await expect(
      saveContractLineage(PARENT_ID, CHILD_ID, null),
    ).resolves.toEqual({ id: 99 });
    expect(upsertPayloads).toHaveLength(1);
  });

  it('delegates relatedness to the DB function with both vendor ids', async () => {
    // The rule lives in the DB so the trigger and the app cannot diverge.
    contractRows = endpoints(11, 22);
    relatedVendorPairs = [[11, 22]];

    await saveContractLineage(PARENT_ID, CHILD_ID, null);

    expect(rpcCalls).toEqual([
      {
        fn: 'contract_relationship_vendors_related',
        args: { p_vendor_a: 11, p_vendor_b: 22 },
      },
    ]);
  });

  it('rejects and alerts when the vendors are unrelated', async () => {
    contractRows = endpoints(33, 44);

    // Typed so the Inngest boundary can mark it non-retriable without
    // matching on the message text.
    await expect(
      saveContractLineage(PARENT_ID, CHILD_ID, null),
    ).rejects.toThrow(ContractLineageInvariantError);
    expect(upsertPayloads).toHaveLength(0);
    expect(mockLogAlert).toHaveBeenCalledWith(
      ...alertArgs('unrelated vendors'),
    );
  });

  it('rejects and alerts when the contracts belong to different orgs', async () => {
    // Same vendor — proves the org check is what rejects, not the vendor check.
    contractRows = endpoints(11, 11, OTHER_ORG_ID);

    await expect(
      saveContractLineage(PARENT_ID, CHILD_ID, null),
    ).rejects.toThrow(ContractLineageInvariantError);
    expect(upsertPayloads).toHaveLength(0);
    expect(mockLogAlert).toHaveBeenCalledWith(
      ...alertArgs('across organizations'),
    );
  });

  it('skips the vendor check and warns when a vendor_id is null', async () => {
    contractRows = endpoints(null, 44);

    await expect(
      saveContractLineage(PARENT_ID, CHILD_ID, null),
    ).resolves.toEqual({ id: 99 });
    expect(rpcCalls).toHaveLength(0);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      { parentContractId: PARENT_ID, childContractId: CHILD_ID },
      expect.stringContaining('vendor_id is null'),
    );
  });

  it('still enforces the org check when a vendor_id is null', async () => {
    contractRows = endpoints(null, 44, OTHER_ORG_ID);

    await expect(
      saveContractLineage(PARENT_ID, CHILD_ID, null),
    ).rejects.toThrow('across organizations');
    expect(upsertPayloads).toHaveLength(0);
  });

  it('rejects when either contract row is missing', async () => {
    contractRows = [{ id: PARENT_ID, organization_id: ORG_ID, vendor_id: 11 }];

    await expect(
      saveContractLineage(PARENT_ID, CHILD_ID, null),
    ).rejects.toThrow('contract not found');
    expect(upsertPayloads).toHaveLength(0);
  });

  // The guard runs before the upsert, so a failure inside the guard itself must
  // block the write rather than fall through to an unvalidated one. Both cases
  // below assert the write is skipped, not just that the call rejects.
  it('does not write when the endpoint fetch fails', async () => {
    contractRows = endpoints(11, 11);
    selectError = { message: 'connection reset' };

    // PostgREST surfaces errors as plain objects, not Error instances, and
    // saveContractLineage rethrows them as-is — so match the value, not a class.
    await expect(
      saveContractLineage(PARENT_ID, CHILD_ID, null),
    ).rejects.toMatchObject({ message: 'connection reset' });
    expect(upsertPayloads).toHaveLength(0);
  });

  it('does not write when the relatedness function fails', async () => {
    // Endpoints resolve and the org check passes, so the RPC failure is the
    // only thing that can stop the write here.
    contractRows = endpoints(11, 22);
    rpcError = { message: 'function unavailable' };

    await expect(
      saveContractLineage(PARENT_ID, CHILD_ID, null),
    ).rejects.toMatchObject({ message: 'function unavailable' });
    expect(upsertPayloads).toHaveLength(0);
    // The RPC was reached, so this is a genuine failure of the vendor check
    // rather than the org check rejecting first.
    expect(rpcCalls).toHaveLength(1);
  });
});
