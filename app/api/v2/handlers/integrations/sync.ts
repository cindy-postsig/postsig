import { Context } from 'hono';
import { triggerIntegrationSync } from '@/lib/v2/integrations/settings-service';

export async function syncHandler(c: Context) {
  const userMetadata = c.get('userMetadata');
  const { userId } = userMetadata;
  const provider = c.req.param('provider');
  if (!provider) {
    return c.json({ error: 'Missing provider' }, 400);
  }

  const result = await triggerIntegrationSync({ userId, provider });
  if (!result.triggered) {
    return c.json({ error: result.reason ?? 'Sync was not triggered' }, 400);
  }

  return c.json({ success: true });
}
