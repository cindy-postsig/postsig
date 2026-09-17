import type { Context } from 'hono';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const checkAbility = jest.fn<Promise<boolean>, [string, string]>();
jest.mock('@/data/user-permissions', () => ({
  checkAbility: (action: string, subject: string) =>
    checkAbility(action, subject),
}));

const saveContractOwners = jest.fn();
jest.mock('@/lib/v2/owners/service', () => ({
  saveContractOwners: (...args: unknown[]) => saveContractOwners(...args),
}));

import { putContractOwnersHandler } from '@/app/api/v2/handlers/contracts/owners';
import { AuthorizationError } from '@/lib/errors';

const ORG = 'org-1';
const user = {
  userId: 'user-1',
  organizationId: ORG,
  userProfile: { name: 'Cindy Admin', email: 'cindy@example.com' },
};

interface JsonResponse {
  body: unknown;
  status: number;
}

/** The slice of Hono's Context the handler touches, capturing c.json calls. */
function ctx(
  params: { id?: string; body?: unknown; jsonThrows?: boolean } = {},
): Context {
  return {
    get: (key: string) => (key === 'userMetadata' ? user : undefined),
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
  params: { id?: string; body?: unknown; jsonThrows?: boolean } = {},
): Promise<JsonResponse> =>
  (await putContractOwnersHandler(ctx(params))) as JsonResponse;

const SPONSORS = [
  { kind: 'user', id: 'u-1' },
  { kind: 'employee', id: 7 },
  { kind: 'label', name: 'Acme Corp' },
];

beforeEach(() => {
  jest.clearAllMocks();
  checkAbility.mockResolvedValue(true);
  saveContractOwners.mockResolvedValue(undefined);
});

describe('putContractOwnersHandler', () => {
  it('saves the parsed body under the caller organization and actor', async () => {
    const res = await call({
      id: '42',
      body: {
        sponsors: SPONSORS,
        groupUnitIds: [100, 200],
        justification: 'Renewal',
        order: null,
      },
    });

    expect(res).toEqual({ body: { success: true }, status: 200 });
    expect(saveContractOwners).toHaveBeenCalledWith({
      organizationId: ORG,
      contractId: 42,
      sponsors: SPONSORS,
      groupUnitIds: [100, 200],
      justification: 'Renewal',
      order: null,
      actorUserId: 'user-1',
      actorName: 'Cindy Admin',
    });
  });

  it('leaves groups, justification and order undefined when they are omitted', async () => {
    await call({ id: '42', body: { sponsors: [] } });

    expect(saveContractOwners).toHaveBeenCalledWith(
      expect.objectContaining({
        sponsors: [],
        groupUnitIds: undefined,
        justification: undefined,
        order: undefined,
      }),
    );
  });

  it.each([
    ['missing', undefined],
    ['not a number', 'abc'],
    ['trailing junk', '42junk'],
    ['zero', '0'],
  ])('400s a contract id that is %s', async (_case, id) => {
    const res = await call({ id, body: { sponsors: [] } });

    expect(res).toEqual({
      body: { error: 'Invalid contract id' },
      status: 400,
    });
    expect(saveContractOwners).not.toHaveBeenCalled();
  });

  it.each([
    ['unparseable JSON', { jsonThrows: true }, 'Invalid JSON body'],
    ['a JSON array', { body: [] }, 'Invalid JSON body'],
    ['no sponsors', { body: {} }, 'sponsors must be an array'],
    [
      'a sponsor that is not an object',
      { body: { sponsors: ['ada'] } },
      'Invalid sponsor',
    ],
    [
      'an unknown sponsor kind',
      { body: { sponsors: [{ kind: 'group', id: 1 }] } },
      'Invalid sponsor',
    ],
    [
      'a user sponsor without a string id',
      { body: { sponsors: [{ kind: 'user', id: 7 }] } },
      'Invalid sponsor',
    ],
    [
      'an employee sponsor without an integer id',
      { body: { sponsors: [{ kind: 'employee', id: '7' }] } },
      'Invalid sponsor',
    ],
    [
      'a label sponsor without a name',
      { body: { sponsors: [{ kind: 'label' }] } },
      'Invalid sponsor',
    ],
    [
      'group unit ids that are not an array',
      { body: { sponsors: [], groupUnitIds: 100 } },
      'groupUnitIds must be an array of unit ids',
    ],
    [
      'a fractional group unit id',
      { body: { sponsors: [], groupUnitIds: [1.5] } },
      'groupUnitIds must be an array of unit ids',
    ],
    [
      'a numeric justification',
      { body: { sponsors: [], justification: 7 } },
      'justification must be a string or null',
    ],
    [
      'a numeric order',
      { body: { sponsors: [], order: 7 } },
      'order must be a string or null',
    ],
  ])('400s %s', async (_case, params, error) => {
    const res = await call({ id: '42', ...params });

    expect(res).toEqual({ body: { error }, status: 400 });
    expect(saveContractOwners).not.toHaveBeenCalled();
  });

  it('403s a caller who cannot update the contract', async () => {
    checkAbility.mockResolvedValue(false);

    const res = await call({ id: '42', body: { sponsors: SPONSORS } });

    expect(checkAbility).toHaveBeenCalledWith('update', 'Contract');
    expect(res).toEqual({
      body: { error: 'You do not have permission to edit contract owners' },
      status: 403,
    });
    expect(saveContractOwners).not.toHaveBeenCalled();
  });

  it('403s group edits from a caller who cannot manage the organization', async () => {
    checkAbility.mockImplementation(
      async (_action, subject) => subject === 'Contract',
    );

    const res = await call({
      id: '42',
      body: { sponsors: SPONSORS, groupUnitIds: [100] },
    });

    expect(checkAbility).toHaveBeenCalledWith('manage', 'Organization');
    expect(res).toEqual({
      body: { error: 'Only organization admins can edit business groups' },
      status: 403,
    });
    expect(saveContractOwners).not.toHaveBeenCalled();
  });

  it('lets a caller who cannot manage the organization save sponsors alone', async () => {
    checkAbility.mockImplementation(
      async (_action, subject) => subject === 'Contract',
    );

    const res = await call({ id: '42', body: { sponsors: SPONSORS } });

    expect(res.status).toBe(200);
    expect(saveContractOwners).toHaveBeenCalledTimes(1);
  });

  it("answers the service's authorization errors with a 403", async () => {
    saveContractOwners.mockRejectedValue(
      new AuthorizationError('Cross-organization contract access denied'),
    );

    const res = await call({ id: '42', body: { sponsors: [] } });

    expect(res).toEqual({
      body: { error: 'Cross-organization contract access denied' },
      status: 403,
    });
  });

  it('answers an unexpected failure with a plain 500', async () => {
    saveContractOwners.mockRejectedValue(new Error('connection reset'));

    const res = await call({ id: '42', body: { sponsors: [] } });

    expect(res).toEqual({
      body: { error: 'Failed to save the contract owners' },
      status: 500,
    });
  });
});
