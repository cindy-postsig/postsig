import { Context } from 'hono';
import { getIntegrationSummary } from '@/lib/v2/integrations/settings-service';

export async function summaryHandler(c: Context) {
  const userMetadata = c.get('userMetadata');
  const { userId } = userMetadata;

  const summary = await getIntegrationSummary(userId);
  return c.json(summary);
}
