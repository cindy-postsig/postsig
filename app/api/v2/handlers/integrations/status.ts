import { Context } from 'hono';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import type { NangoProvider } from '@/lib/api/nango';

export async function statusHandler(c: Context) {
  const userMetadata = c.get('userMetadata');
  const { userId } = userMetadata;

  const provider = c.req.query('provider') as NangoProvider | null;
  if (!provider || !['xero', 'ramp'].includes(provider)) {
    return c.json({ error: 'Invalid provider' }, 400);
  }

  const serviceSupabase = createServiceClient();

  const { data } = await (serviceSupabase
    .from('integration_connections' as any)
    .select('status')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single() as any);

  return c.json({ connected: data?.status === 'connected' });
}
