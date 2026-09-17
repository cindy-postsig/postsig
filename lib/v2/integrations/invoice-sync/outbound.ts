import { getNangoClient, NANGO_PROVIDER_IDS } from '@/lib/api/nango';
import { getXeroTenantId } from './service';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { RetryAfterError } from 'inngest';
import type { NangoProvider } from './types';

type NangoClient = ReturnType<typeof getNangoClient>;

function formatXeroHistoryDetails(
  details: string | null,
  actorName: string | null,
  status?: string,
): string | null {
  const parts: string[] = [];

  if (status) {
    parts.push(`PostSig status: ${status}`);
  }
  if (actorName) {
    parts.push(`PostSig user: ${actorName}`);
  }
  if (details) {
    parts.push(`Reason: ${details}`);
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

async function writeXeroInvoiceHistory(
  nango: NangoClient,
  connectionId: string,
  tenantId: string,
  externalInvoiceId: string,
  details: string | null,
  actorName: string | null,
  status: string | undefined,
  statusChangeApplied: boolean,
): Promise<void> {
  const historyDetails = formatXeroHistoryDetails(details, actorName, status);
  if (!historyDetails) return;

  try {
    await nango.proxy({
      method: 'PUT',
      endpoint: `/api.xro/2.0/Invoices/${externalInvoiceId}/History`,
      providerConfigKey: NANGO_PROVIDER_IDS.xero,
      connectionId,
      headers: { 'Xero-Tenant-Id': tenantId },
      data: {
        HistoryRecords: [{ Details: historyDetails }],
      },
    });
  } catch (historyErr: any) {
    if (historyErr?.response?.status === 429) {
      const retryAfter = historyErr.response.headers?.['retry-after'];
      const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60_000;
      logger.warn(
        { externalInvoiceId, retryMs },
        'Xero rate limited while writing invoice history — will retry',
      );
      throw new RetryAfterError('Xero rate limit', retryMs);
    }

    logger.error(
      {
        externalInvoiceId,
        statusChangeApplied,
        err: historyErr?.message,
        status: historyErr?.response?.status,
        data: historyErr?.response?.data,
      },
      'Failed to write reason to Xero invoice history',
    );
    throw historyErr;
  }
}

export async function pushStatusToXero(
  connectionId: string,
  externalInvoiceId: string,
  status: string,
  reason: string | null,
  externalInvoiceStatus: string | null,
  actorName: string | null = null,
): Promise<string | null> {
  const nango = getNangoClient();

  const tenantId = await getXeroTenantId(connectionId);
  if (!tenantId) {
    throw new Error(
      `Cannot push status to Xero: no tenant ID for connection ${connectionId}`,
    );
  }

  const postsigStatus = status.toLowerCase();

  if (postsigStatus === 'review') {
    logger.info(
      {
        externalInvoiceId,
        status,
        externalInvoiceStatus,
      },
      'Skipping Xero outbound sync for local review status',
    );
    return externalInvoiceStatus ?? null;
  }

  await writeXeroInvoiceHistory(
    nango,
    connectionId,
    tenantId,
    externalInvoiceId,
    reason,
    actorName,
    status,
    false,
  );

  logger.info(
    {
      externalInvoiceId,
      status,
      externalInvoiceStatus,
    },
    'Wrote Xero invoice history without changing Xero status',
  );

  return externalInvoiceStatus ?? null;
}

export async function pushStatusToRamp(
  connectionId: string,
  externalInvoiceId: string,
  status: string,
  reason: string | null,
): Promise<string | null> {
  const nango = getNangoClient();

  const rampStatusMap: Record<string, string> = {
    approved: 'APPROVED',
    declined: 'REJECTED',
    void: 'CANCELLED',
    paid: 'PAID',
  };
  const rampStatus = rampStatusMap[status.toLowerCase()] ?? 'APPROVED';

  try {
    await nango.proxy({
      method: 'PATCH',
      endpoint: `/developer/v1/bills/${externalInvoiceId}`,
      providerConfigKey: NANGO_PROVIDER_IDS.ramp,
      connectionId,
      data: {
        status: rampStatus,
        ...(reason ? { note: reason } : {}),
      },
    });
  } catch (err: any) {
    if (err?.response?.status === 429) {
      const retryAfter = err.response.headers?.['retry-after'];
      const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60_000;
      logger.warn(
        { externalInvoiceId, retryMs },
        'Ramp rate limited (429) — will retry',
      );
      throw new RetryAfterError('Ramp rate limit', retryMs);
    }
    throw err;
  }

  logger.info(
    { externalInvoiceId, rampStatus, connectionId },
    'Pushed status to Ramp',
  );

  return rampStatus;
}

export interface InvoiceIntegrationConnection {
  id: string;
  nango_connection_id: string;
  status: string;
  user_id: string;
}

export async function getConnectionForInvoice(
  integrationConnectionId: string,
  organizationId: string,
  provider: NangoProvider,
): Promise<InvoiceIntegrationConnection | null> {
  const supabase = createServiceClient();
  const { data } = await (supabase
    .from('integration_connections' as any)
    .select('id, nango_connection_id, status, user_id')
    .eq('id', integrationConnectionId)
    .eq('organization_id', organizationId)
    .eq('provider', provider)
    .maybeSingle() as any);

  return (data as InvoiceIntegrationConnection | null) ?? null;
}
