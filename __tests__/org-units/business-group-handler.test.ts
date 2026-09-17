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

const createBusinessGroupNode = jest.fn();
jest.mock('@/lib/v2/org-units', () => ({
  createBusinessGroupNode: (...args: unknown[]) =>
    createBusinessGroupNode(...args),
}));

import { postBusinessGroupHandler } from '@/app/api/v2/handlers/org-units';

const ORG = 'org-1';
const admin = { userId: 'user-1', organizationId: ORG };

interface JsonResponse {
  body: unknown;
  status: number;
}

/** The slice of Hono's Context the handler touches, capturing c.json calls. */
function ctx(params: { body?: unknown; jsonThrows?: boolean } = {}): Context {
  return {
    get: (key: string) => (key === 'userMetadata' ? admin : undefined),
    req: {
      json: async () => {
        if (params.jsonThrows) throw new SyntaxError('Unexpected token');
        return params.body;
      },
    },
    json: (body: unknown, status = 200): JsonResponse => ({ body, status }),
  } as unknown as Context;
}

const call = async (
  params: { body?: unknown; jsonThrows?: boolean } = {},
): Promise<JsonResponse> =>
  (await postBusinessGroupHandler(ctx(params))) as JsonResponse;

beforeEach(() => {
  jest.clearAllMocks();
  checkAbility.mockResolvedValue(true);
  createBusinessGroupNode.mockResolvedValue({ id: 7, name: 'EMEA Sales' });
});

describe('postBusinessGroupHandler', () => {
  it('403s users without manage Organization', async () => {
    checkAbility.mockResolvedValue(false);

    const res = await call({ body: { name: 'Ops' } });

    expect(checkAbility).toHaveBeenCalledWith('manage', 'Organization');
    expect(res.status).toBe(403);
    expect((res.body as { error: string }).error).toMatch(
      /organization admins/,
    );
    expect(createBusinessGroupNode).not.toHaveBeenCalled();
  });

  it('400s a blank or missing name before touching the database', async () => {
    const blank = await call({ body: { name: '   ' } });
    const missing = await call({ body: {} });

    for (const res of [blank, missing]) {
      expect(res).toEqual({
        body: { error: 'Business group name is required' },
        status: 400,
      });
    }
    expect(createBusinessGroupNode).not.toHaveBeenCalled();
  });

  it('400s a malformed body instead of failing as a server error', async () => {
    expect(await call({ jsonThrows: true })).toEqual({
      body: { error: 'Invalid JSON body' },
      status: 400,
    });
    expect(createBusinessGroupNode).not.toHaveBeenCalled();
  });

  it('creates the node for the session organization under its trimmed name', async () => {
    const res = await call({ body: { name: '  EMEA Sales  ' } });

    expect(createBusinessGroupNode).toHaveBeenCalledWith(ORG, 'EMEA Sales');
    expect(res).toEqual({
      body: { group: { id: 7, name: 'EMEA Sales' } },
      status: 200,
    });
  });

  it('500s with a generic message when the create fails', async () => {
    createBusinessGroupNode.mockRejectedValue(new Error('db down'));

    expect(await call({ body: { name: 'Ops' } })).toEqual({
      body: { error: 'Failed to create the business group' },
      status: 500,
    });
  });
});
