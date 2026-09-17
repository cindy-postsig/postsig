import { Context } from 'hono';
import { updateIntegrationSettings } from '@/lib/v2/integrations/settings-service';

const clientToDbKey: Record<string, string> = {
  syncEnabled: 'sync_enabled',
  importNewInvoices: 'import_new_invoices',
  trackUnpaidInvoices: 'track_unpaid_invoices',
  sync_enabled: 'sync_enabled',
  import_new_invoices: 'import_new_invoices',
  track_unpaid_invoices: 'track_unpaid_invoices',
};

export function normalizeIntegrationSettingsPayload(
  body: Record<string, unknown>,
): Record<string, boolean> {
  const settings: Record<string, boolean> = {};
  for (const [clientKey, dbKey] of Object.entries(clientToDbKey)) {
    if (clientKey in body && typeof body[clientKey] === 'boolean') {
      settings[dbKey] = body[clientKey];
    }
  }
  return settings;
}

export async function updateSettingsHandler(c: Context) {
  const userMetadata = c.get('userMetadata');
  const { userId } = userMetadata;
  const provider = c.req.param('provider');
  if (!provider) {
    return c.json({ error: 'Missing provider' }, 400);
  }
  const body = await c.req.json();

  const settings = normalizeIntegrationSettingsPayload(body);
  if (Object.keys(settings).length === 0) {
    return c.json({ error: 'No valid settings provided' }, 400);
  }

  await updateIntegrationSettings({ userId, provider, settings });
  return c.json({ success: true });
}
