import { Context } from 'hono';
import { NANGO_PROVIDER_IDS, type NangoProvider } from '@/lib/api/nango';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { inngest } from '@/utils/inngest/client';
import logger from '@/utils/pino';
import { getIntegrationProviderConfig } from '@/lib/v2/integrations/catalog';

export async function callbackHandler(c: Context) {
  const userMetadata = c.get('userMetadata');
  const { userId, organizationId } = userMetadata;

  const body = await c.req.json();
  const { connectionId, provider } = body as {
    connectionId: string;
    provider: NangoProvider;
  };

  if (!connectionId || !provider) {
    return c.json({ error: 'Missing connectionId or provider' }, 400);
  }

  if (!NANGO_PROVIDER_IDS[provider]) {
    return c.json({ error: 'Invalid provider' }, 400);
  }

  const serviceSupabase = createServiceClient();
  const config = getIntegrationProviderConfig(provider);

  const { data: savedConnection, error: upsertError } = await (serviceSupabase
    .from('integration_connections' as any)
    .upsert(
      {
        organization_id: organizationId,
        user_id: userId,
        provider,
        nango_connection_id: connectionId,
        auth_provider: 'nango',
        status: 'connected',
        health_status: 'healthy',
        health_reason: null,
        health_detected_at: null,
        connected_at: new Date().toISOString(),
        disconnected_at: null,
        sync_enabled: true,
        sync_interval_minutes: config?.syncIntervalMinutes ?? 120,
        import_new_invoices: true,
        track_unpaid_invoices: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' },
    )
    .select('id')
    .single() as any);

  if (upsertError || !savedConnection?.id) {
    logger.error(
      {
        errorCode: upsertError?.code,
        errorMessage: upsertError?.message,
        errorDetails: upsertError?.details,
        userId,
        provider,
      },
      'Failed to save connection',
    );
    return c.json({ error: 'Failed to save connection' }, 500);
  }

  logger.info({ userId, provider, connectionId }, 'Integration connected');

  // Trigger an immediate sync for this connection so the user gets data
  // without waiting for the next scheduled two-hour cron run.
  try {
    await inngest.send({
      name: 'integrations/sync-invoices',
      data: { integrationConnectionId: savedConnection.id },
    });
  } catch (err) {
    logger.warn(
      { err, userId, provider },
      'Failed to trigger post-connect sync',
    );
  }

  return c.json({ success: true });
}
