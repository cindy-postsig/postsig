import { Context } from 'hono';
import { getIntegrationDetail } from '@/lib/v2/integrations/settings-service';

export async function detailHandler(c: Context) {
  const userMetadata = c.get('userMetadata');
  const { userId } = userMetadata;
  const provider = c.req.param('provider');
  if (!provider) {
    return c.json({ error: 'Missing provider' }, 400);
  }

  const detail = await getIntegrationDetail({ userId, provider });
  if (!detail) {
    return c.json({ error: 'Integration not found' }, 404);
  }

  return c.json({ integration: detail });
}
