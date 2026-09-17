jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import { Hono } from 'hono';
import { viewerWriteGuard } from '@/app/api/v2/middleware/write-guard';
import { userRoles } from '@/constants/data';

type Metadata = { userId: string; organizationId: string; userRole: number };

const VIEWER: Metadata = {
  userId: 'user-1',
  organizationId: 'org-1',
  userRole: userRoles.clientUser,
};
const MANAGER: Metadata = { ...VIEWER, userRole: userRoles.clientAdmin };
const ADMIN: Metadata = { ...VIEWER, userRole: userRoles.clientSupervisor };

/**
 * Mirrors the real router: the guard sits behind the auth middleware, so it
 * reads whatever userMetadata that middleware set (or nothing, for the API-key
 * routes that authorize themselves).
 */
function appFor(metadata: Metadata | null) {
  const app = new Hono<{ Variables: { userMetadata: Metadata } }>().basePath(
    '/api/v2',
  );
  app.use('*', async (c, next) => {
    if (metadata) c.set('userMetadata', metadata);
    await next();
  });
  app.use('*', viewerWriteGuard);
  app.all('/*', (c) => c.json({ ok: true }));
  return app;
}

async function call(
  metadata: Metadata | null,
  method: string,
  path: string,
): Promise<number> {
  const res = await appFor(metadata).request(path, { method });
  return res.status;
}

describe('viewerWriteGuard', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'refuses %s from a viewer',
    async (method) => {
      expect(await call(VIEWER, method, '/api/v2/tags/contract/1')).toBe(403);
    },
  );

  it.each(['GET', 'HEAD'])('allows %s from a viewer', async (method) => {
    expect(await call(VIEWER, method, '/api/v2/contracts')).toBe(200);
  });

  it.each([
    ['manager', MANAGER],
    ['admin', ADMIN],
  ])('allows writes from a %s', async (_label, metadata) => {
    expect(await call(metadata, 'PATCH', '/api/v2/contracts/1')).toBe(200);
  });

  it.each([
    ['POST', '/api/v2/spend'],
    ['POST', '/api/v2/chat/stream'],
    ['POST', '/api/v2/chat/sessions'],
    ['PATCH', '/api/v2/chat/sessions/abc'],
    ['DELETE', '/api/v2/chat/sessions/abc'],
  ])('allows a viewer to %s %s', async (method, path) => {
    expect(await call(VIEWER, method, path)).toBe(200);
  });

  it('does not let a wildcard entry cover the segment above it', async () => {
    expect(await call(VIEWER, 'PATCH', '/api/v2/chat/sessions')).toBe(403);
  });

  it('does not let an allowlisted path cover its siblings', async () => {
    expect(await call(VIEWER, 'POST', '/api/v2/spend/export')).toBe(403);
  });

  it('keeps every KPI write closed', async () => {
    expect(
      await call(
        VIEWER,
        'PUT',
        '/api/v2/investor/reporting/custom-kpis/abc/value',
      ),
    ).toBe(403);
    expect(
      await call(
        VIEWER,
        'DELETE',
        '/api/v2/investor/reporting/custom-kpis/abc',
      ),
    ).toBe(403);
    expect(
      await call(VIEWER, 'POST', '/api/v2/investor/reporting/custom-kpis'),
    ).toBe(403);
    expect(
      await call(VIEWER, 'PUT', '/api/v2/investor/reporting/kpi-settings'),
    ).toBe(403);
  });

  it('matches a wildcard against exactly one segment', async () => {
    expect(await call(VIEWER, 'DELETE', '/api/v2/chat/sessions/a/b')).toBe(403);
  });

  it('refuses a write to a route added since the allowlist was written', async () => {
    expect(await call(VIEWER, 'POST', '/api/v2/something/new')).toBe(403);
  });

  it('defers to the route when no session metadata is present', async () => {
    expect(await call(null, 'POST', '/api/v2/investor/extraction-fields')).toBe(
      200,
    );
  });
});
