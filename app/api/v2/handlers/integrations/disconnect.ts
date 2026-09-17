import { Context } from 'hono';
import {
  getNangoClient,
  NANGO_PROVIDER_IDS,
  type NangoProvider,
} from '@/lib/api/nango';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';

export async function disconnectHandler(c: Context) {
  const userMetadata = c.get('userMetadata');
  const { userId } = userMetadata;

  const body = await c.req.json();
  const provider = body.provider as NangoProvider;

  if (!provider || !NANGO_PROVIDER_IDS[provider]) {
    return c.json({ error: 'Invalid provider' }, 400);
  }

  const serviceSupabase = createServiceClient();

  const { data: connection } = await (serviceSupabase
    .from('integration_connections' as any)
    .select('nango_connection_id')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('status', 'connected')
    .single() as any);

  if (connection?.nango_connection_id) {
    try {
      const nango = getNangoClient();
      await nango.deleteConnection(
        NANGO_PROVIDER_IDS[provider],
        connection.nango_connection_id,
      );
    } catch (nangoError) {
      logger.warn(
        { nangoError, provider },
        'Failed to delete Nango connection (continuing)',
      );
    }
  }

  const { error: updateError } = await (serviceSupabase
    .from('integration_connections' as any)
    .update({
      status: 'disconnected',
      health_status: 'disconnected',
      health_reason: 'Disconnected',
      health_detected_at: new Date().toISOString(),
      disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', provider) as any);

  if (updateError) {
    logger.error(
      { error: updateError, provider },
      'Failed to update connection status',
    );
    return c.json({ error: 'Failed to disconnect' }, 500);
  }

  logger.info({ userId, provider }, 'Integration disconnected');
  return c.json({ success: true });
}
