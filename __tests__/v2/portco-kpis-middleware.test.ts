import { Hono } from 'hono';
import { portcoKpisMiddleware } from '@/app/api/v2/middleware/auth';
import type { AppContext } from '@/app/api/v2/types/app';
import type { UserMetadata } from '@/constants/types';

jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/data/users', () => ({
  getUserMetadata: jest.fn(),
}));

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

function buildApp(userMetadata: Partial<UserMetadata> | undefined) {
  const app = new Hono<AppContext>();
  app.use('*', async (c, next) => {
    c.set('userMetadata', userMetadata as UserMetadata);
    await next();
  });
  app.use('*', portcoKpisMiddleware);
  app.get('/custom-kpis', (c) => c.json({ ok: true }));
  return app;
}

describe('portcoKpisMiddleware', () => {
  it('passes the request through when the portco module is enabled', async () => {
    const res = await buildApp({ portcoKpisEnabled: true }).request(
      '/custom-kpis',
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('rejects with 403 when the portco module is disabled', async () => {
    const res = await buildApp({ portcoKpisEnabled: false }).request(
      '/custom-kpis',
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: 'The KPIs module is not enabled for this organization',
    });
  });

  it('rejects with 403 when no user metadata is present', async () => {
    const res = await buildApp(undefined).request('/custom-kpis');

    expect(res.status).toBe(403);
  });
});
