import { Context } from 'hono';
import { getIntegrationRecentRuns } from '@/lib/v2/integrations/settings-service';

export async function runsHandler(c: Context) {
  const userMetadata = c.get('userMetadata');
  const { userId } = userMetadata;
  const provider = c.req.param('provider');
  if (!provider) {
    return c.json({ error: 'Missing provider' }, 400);
  }

  const recentRuns = await getIntegrationRecentRuns({ userId, provider });
  if (!recentRuns) {
    return c.json({ error: 'Integration not found' }, 404);
  }

  return c.json({ recentRuns });
}
