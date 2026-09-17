import type { Context } from 'hono';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const mockIsAssignmentsEnabled = jest.fn();
jest.mock('@/lib/v2/assignments/flag', () => ({
  isAssignmentsEnabled: (...args: unknown[]) =>
    mockIsAssignmentsEnabled(...args),
}));

const mockLoadAssignmentsPage = jest.fn();
jest.mock('@/lib/v2/assignments/service', () => ({
  loadAssignmentsPage: (...args: unknown[]) => mockLoadAssignmentsPage(...args),
}));

import { getAssignmentsPayloadHandler } from '@/app/api/v2/handlers/assignments/payload';

const USER = { organizationId: 'org-1', userId: 'user-1' };

function makeContext(month?: string, userMetadata: unknown = USER) {
  let captured: unknown;
  let status = 200;
  const context = {
    get: (key: string) => (key === 'userMetadata' ? userMetadata : undefined),
    req: { query: (name: string) => (name === 'month' ? month : undefined) },
    json: (payload: unknown, code?: number) => {
      captured = payload;
      status = code ?? 200;
      return payload;
    },
  } as unknown as Context;
  return {
    context,
    result: () => captured as { payload?: unknown; error?: string },
    status: () => status,
  };
}

const PAYLOAD = { window: { month: '2026-04', label: 'April 2026' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockIsAssignmentsEnabled.mockResolvedValue(true);
  mockLoadAssignmentsPage.mockResolvedValue(PAYLOAD);
});

describe('GET /api/v2/assignments', () => {
  it('answers a month with its payload', async () => {
    const { context, result, status } = makeContext('2026-04');
    await getAssignmentsPayloadHandler(context);
    expect(status()).toBe(200);
    expect(result().payload).toEqual(PAYLOAD);
    expect(mockLoadAssignmentsPage).toHaveBeenCalledWith(USER, {
      month: '2026-04',
    });
  });

  it('404s an org without the feature, and loads nothing', async () => {
    mockIsAssignmentsEnabled.mockResolvedValue(false);
    const { context, status } = makeContext('2026-04');
    await getAssignmentsPayloadHandler(context);
    expect(status()).toBe(404);
    expect(mockLoadAssignmentsPage).not.toHaveBeenCalled();
  });

  it('asks the flag for the signed-in org', async () => {
    const { context } = makeContext('2026-04');
    await getAssignmentsPayloadHandler(context);
    expect(mockIsAssignmentsEnabled).toHaveBeenCalledWith(USER);
  });

  it('400s a missing month rather than guessing one', async () => {
    const { context, status } = makeContext();
    await getAssignmentsPayloadHandler(context);
    expect(status()).toBe(400);
    expect(mockLoadAssignmentsPage).not.toHaveBeenCalled();
  });

  it.each(['2026-13', '2026', 'April', '2026-4'])('400s %s', async (month) => {
    const { context, status } = makeContext(month);
    await getAssignmentsPayloadHandler(context);
    expect(status()).toBe(400);
    expect(mockLoadAssignmentsPage).not.toHaveBeenCalled();
  });

  it('500s when the loader throws, without leaking the reason', async () => {
    mockLoadAssignmentsPage.mockRejectedValue(new Error('boom'));
    const { context, result, status } = makeContext('2026-04');
    await getAssignmentsPayloadHandler(context);
    expect(status()).toBe(500);
    expect(result().error).toBe('Internal server error');
  });
});
