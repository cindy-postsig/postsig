import { getNangoClient, NANGO_PROVIDER_IDS } from '@/lib/api/nango';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import {
  mapXeroInvoiceToContract,
  mapRampInvoiceToContract,
  mapXeroStatusToInvoiceStatus,
  mapRampStatusToInvoiceStatus,
} from './transforms';
import logger from '@/utils/pino';
import { logAlert } from '@/utils/logging/alert';
import { saveContractLineage } from '@/data/superuser/contracts';
import { ContractActivityType } from '@/constants/types';
import { buildConnectionHealthUpdate } from '@/lib/v2/integrations/settings-service';
import { INVOICE_TYPE_IDS, typeIdInList } from '@/app/lib/constants';
import type {
  NangoProvider,
  XeroInvoice,
  RampInvoice,
  MappedInvoiceContract,
} from './types';

interface ActiveConnection {
  id: string;
  organization_id: string;
  user_id: string;
  provider: NangoProvider;
  nango_connection_id: string;
  sync_enabled?: boolean;
  import_new_invoices?: boolean;
  track_unpaid_invoices?: boolean;
}

export async function getActiveConnections(
  options: {
    integrationConnectionId?: string;
    includeDisabled?: boolean;
  } = {},
): Promise<ActiveConnection[]> {
  const supabase = createServiceClient();
  let query = supabase
    .from('integration_connections' as any)
    .select(
      'id, organization_id, user_id, provider, nango_connection_id, sync_enabled, import_new_invoices, track_unpaid_invoices',
    )
    .eq('status', 'connected') as any;

  if (!options.includeDisabled) {
    query = query.eq('sync_enabled', true);
  }

  if (options.integrationConnectionId) {
    query = query.eq('id', options.integrationConnectionId);
  }

  const { data, error } = await query;

  if (error) {
    logger.error({ error }, 'Failed to fetch active integration connections');
    return [];
  }

  return ((data ?? []) as ActiveConnection[]).filter(
    (connection) =>
      (connection.provider === 'xero' || connection.provider === 'ramp') &&
      !!connection.nango_connection_id,
  );
}

export async function getXeroTenantId(
  connectionId: string,
): Promise<string | null> {
  const nango = getNangoClient();
  const metadata = await nango.getMetadata<{ xeroTenantId?: string }>(
    NANGO_PROVIDER_IDS.xero,
    connectionId,
  );
  let tenantId = metadata?.xeroTenantId;

  if (!tenantId) {
    const tenantsRes = await nango.proxy<
      Array<{ tenantId: string; tenantName: string }>
    >({
      method: 'GET',
      baseUrlOverride: 'https://api.xero.com',
      endpoint: '/connections',
      providerConfigKey: NANGO_PROVIDER_IDS.xero,
      connectionId,
    });
    tenantId = tenantsRes.data?.[0]?.tenantId;
    if (tenantId) {
      await nango.setMetadata(NANGO_PROVIDER_IDS.xero, connectionId, {
        xeroTenantId: tenantId,
      });
      logger.info({ connectionId, tenantId }, 'Cached Xero tenant ID');
    }
  }

  return tenantId ?? null;
}

export async function getLastSuccessfulSyncAt(
  integrationConnectionId: string,
): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('integration_sync_logs')
    .select('completed_at')
    .eq('integration_connection_id', integrationConnectionId)
    .eq('sync_type', 'inbound')
    .eq('status', 'success')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();
  return data?.completed_at ?? null;
}

export async function fetchXeroInvoices(
  connectionId: string,
  modifiedAfter?: string,
): Promise<XeroInvoice[]> {
  try {
    const tenantId = await getXeroTenantId(connectionId);
    if (!tenantId) {
      logger.error(
        { connectionId },
        'No Xero tenant ID available — cannot fetch invoices',
      );
      return [];
    }

    const nango = getNangoClient();
    const all: XeroInvoice[] = [];
    let page = 1;

    while (true) {
      const params: Record<string, string | number> = {
        Statuses: 'SUBMITTED',
        where: 'Type=="ACCPAY"',
        page,
      };
      const headers: Record<string, string> = { 'Xero-Tenant-Id': tenantId };
      if (modifiedAfter) {
        headers['If-Modified-Since'] = modifiedAfter;
      }

      const response = await nango.proxy({
        method: 'GET',
        endpoint: '/api.xro/2.0/Invoices',
        providerConfigKey: NANGO_PROVIDER_IDS.xero,
        connectionId,
        headers,
        params,
      });

      const body = response.data as { Invoices?: XeroInvoice[] };
      const invoices = body?.Invoices ?? [];
      all.push(...invoices);

      // Xero returns up to 100 per page; fewer means last page
      if (invoices.length < 100) break;
      page++;
    }

    return all;
  } catch (error) {
    logger.error(
      {
        errorMessage: (error as { message?: string })?.message,
        errorStatus: (error as { response?: { status?: number } })?.response
          ?.status,
        connectionId,
      },
      'Failed to fetch Xero invoices',
    );
    return [];
  }
}

export async function fetchXeroInvoiceById(
  connectionId: string,
  invoiceId: string,
): Promise<XeroInvoice | null> {
  try {
    const tenantId = await getXeroTenantId(connectionId);
    if (!tenantId) {
      logger.error(
        { connectionId, invoiceId },
        'No Xero tenant ID available — cannot fetch invoice status',
      );
      return null;
    }

    const nango = getNangoClient();
    const response = await nango.proxy({
      method: 'GET',
      endpoint: `/api.xro/2.0/Invoices/${invoiceId}`,
      providerConfigKey: NANGO_PROVIDER_IDS.xero,
      connectionId,
      headers: { 'Xero-Tenant-Id': tenantId },
    });

    return (
      ((response.data as { Invoices?: XeroInvoice[] })?.Invoices ?? [])[0] ??
      null
    );
  } catch (error) {
    logger.error(
      {
        errorMessage: (error as { message?: string })?.message,
        errorStatus: (error as { response?: { status?: number } })?.response
          ?.status,
        connectionId,
        invoiceId,
      },
      'Failed to fetch Xero invoice by ID',
    );
    return null;
  }
}

async function fetchRampBillsByApprovalStatus(
  connectionId: string,
  approvalStatus: 'INITIALIZED' | 'PENDING',
  fromDate?: string,
): Promise<RampInvoice[]> {
  const nango = getNangoClient();
  const all: RampInvoice[] = [];
  let nextCursor: string | undefined;

  do {
    const params: Record<string, string> = {
      approval_status: approvalStatus,
    };
    if (fromDate) params['from_date'] = fromDate;
    if (nextCursor) params['next'] = nextCursor;

    const response = await nango.proxy({
      method: 'GET',
      endpoint: '/developer/v1/bills',
      providerConfigKey: NANGO_PROVIDER_IDS.ramp,
      connectionId,
      params,
    });

    const body = response.data as {
      data?: RampInvoice[];
      page?: { next?: string };
    };
    all.push(...(body?.data ?? []));
    nextCursor = body?.page?.next;
  } while (nextCursor);

  return all;
}

export async function fetchRampInvoices(
  connectionId: string,
  fromDate?: string,
): Promise<RampInvoice[]> {
  try {
    const [initialized, pending] = await Promise.all([
      fetchRampBillsByApprovalStatus(connectionId, 'INITIALIZED', fromDate),
      fetchRampBillsByApprovalStatus(connectionId, 'PENDING', fromDate),
    ]);
    return [...initialized, ...pending];
  } catch (error) {
    logger.error(
      {
        errorMessage: (error as { message?: string })?.message,
        errorStatus: (error as { response?: { status?: number } })?.response
          ?.status,
        connectionId,
      },
      'Failed to fetch Ramp invoices',
    );
    return [];
  }
}

export async function fetchRampInvoiceById(
  connectionId: string,
  billId: string,
): Promise<RampInvoice | null> {
  try {
    const nango = getNangoClient();
    const response = await nango.proxy({
      method: 'GET',
      endpoint: `/developer/v1/bills/${billId}`,
      providerConfigKey: NANGO_PROVIDER_IDS.ramp,
      connectionId,
    });

    return (response.data as RampInvoice | null) ?? null;
  } catch (error) {
    logger.error(
      {
        errorMessage: (error as { message?: string })?.message,
        errorStatus: (error as { response?: { status?: number } })?.response
          ?.status,
        connectionId,
        billId,
      },
      'Failed to fetch Ramp bill by ID',
    );
    return null;
  }
}

export async function resolveVendorId(
  vendorName: string,
  organizationId: string,
): Promise<number | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('vendors')
    .select('id')
    .eq('organization_id', organizationId)
    .ilike('name', vendorName)
    .limit(1)
    .single();

  return data?.id ?? null;
}

export async function findParentContractByVendor(
  vendorId: number,
  organizationId: string,
): Promise<number | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('contracts')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('vendor_id', vendorId)
    .not('type_id', 'in', typeIdInList(INVOICE_TYPE_IDS))
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return data?.id ?? null;
}

export interface UpsertResult {
  contractId: number;
  isNew: boolean;
}

async function logInvoiceImportedActivity(
  supabase: ReturnType<typeof createServiceClient>,
  params: {
    contractId: number;
    provider: NangoProvider;
    externalInvoiceId: string;
    externalInvoiceStatus?: string | null;
    userId: string;
  },
): Promise<void> {
  const { error } = await supabase.from('activities').insert({
    contract_id: params.contractId,
    user_id: params.userId,
    activity_type: ContractActivityType.INVOICE_IMPORTED,
    activity_data: {
      provider: params.provider,
      external_invoice_id: params.externalInvoiceId,
      external_invoice_status: params.externalInvoiceStatus ?? null,
    } as any,
  });

  if (error) {
    logger.error(
      { error, contractId: params.contractId },
      'Failed to log imported invoice activity',
    );
  }
}

function mapExternalStatusToInvoiceStatus(params: {
  provider: NangoProvider;
  externalStatusNew: string | null;
}): MappedInvoiceContract['invoice_status'] {
  return params.provider === 'xero'
    ? mapXeroStatusToInvoiceStatus(params.externalStatusNew)
    : mapRampStatusToInvoiceStatus(params.externalStatusNew);
}

export async function upsertInvoiceAsContract(
  mapped: MappedInvoiceContract,
  organizationId: string,
  userId: string,
  integrationConnectionId: string,
): Promise<UpsertResult | null> {
  const supabase = createServiceClient();

  // Destructure fields that are not direct DB columns.
  const { vendor_name, current_budget, ...contractFields } = mapped;

  const vendorId = await resolveVendorId(vendor_name, organizationId);

  const contractPayload = {
    ...contractFields,
    organization_id: organizationId,
    user_id: userId,
    external_integration_connection_id: integrationConnectionId,
    vendor_id: vendorId ?? undefined,
    updated_at: new Date().toISOString(),
  };

  // Check if already exists
  const { data: existing } = await supabase
    .from('contracts')
    .select(
      'id, external_integration_connection_id, external_invoice_status, invoice_status',
    )
    .eq('organization_id', organizationId)
    .eq('external_source', mapped.external_source)
    .eq('external_invoice_id', mapped.external_invoice_id)
    .single();

  if (existing?.id) {
    if (
      (existing as any).external_integration_connection_id !==
      integrationConnectionId
    ) {
      logger.info(
        {
          contractId: existing.id,
          organizationId,
          provider: mapped.external_source,
          externalInvoiceId: mapped.external_invoice_id,
          integrationConnectionId,
          owningIntegrationConnectionId: (existing as any)
            .external_integration_connection_id,
        },
        'Skipping overlapping external invoice from another user connection',
      );
      return null;
    }

    const externalStatusOld = (existing as any).external_invoice_status ?? null;
    const externalStatusNew = mapped.external_invoice_status ?? null;
    const didExternalStatusChange = externalStatusOld !== externalStatusNew;
    const invoiceStatusOld = (existing as any).invoice_status ?? null;
    const invoiceStatusNew = didExternalStatusChange
      ? mapExternalStatusToInvoiceStatus({
          provider: mapped.external_source,
          externalStatusNew,
        })
      : invoiceStatusOld;
    const update: Record<string, unknown> = {
      last_synced_at: mapped.last_synced_at,
      external_invoice_status: externalStatusNew,
      updated_at: new Date().toISOString(),
    };
    if (didExternalStatusChange) {
      update.invoice_status = invoiceStatusNew;
    }

    const { error } = await supabase
      .from('contracts')
      .update(update as any)
      .eq('id', existing.id);

    if (error) {
      logger.error(
        { error, contractId: existing.id },
        'Failed to update synced invoice contract',
      );
      return null;
    }

    if (didExternalStatusChange) {
      await logSyncResult({
        organizationId,
        userId,
        integrationConnectionId,
        provider: mapped.external_source,
        syncType: 'inbound',
        status: 'success',
        recordsProcessed: 1,
        details: {
          event: 'external_invoice_status_changed',
          contract_id: existing.id,
          external_invoice_id: mapped.external_invoice_id,
          external_status_old: externalStatusOld,
          external_status_new: externalStatusNew,
          invoice_status_old: invoiceStatusOld,
          invoice_status_new: invoiceStatusNew,
        },
        startedAt: new Date(),
      });
    }
    return { contractId: existing.id, isNew: false };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('contracts')
    .insert(contractPayload as any)
    .select('id')
    .single();

  if (insertError || !inserted) {
    logger.error(
      { error: insertError, mapped },
      'Failed to insert synced invoice contract',
    );
    return null;
  }

  await logInvoiceImportedActivity(supabase, {
    contractId: inserted.id,
    provider: mapped.external_source,
    externalInvoiceId: mapped.external_invoice_id,
    externalInvoiceStatus: mapped.external_invoice_status ?? null,
    userId,
  });

  return { contractId: inserted.id, isNew: true };
}

export function getXeroInvoicePdfFileName(invoiceId: string): string {
  const safeId = invoiceId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `invoice_xero_${safeId}.pdf`;
}

export function getRampInvoicePdfFileName(
  billId: string,
  invoiceNumber?: string,
): string {
  const identifier = invoiceNumber ?? billId;
  const safeId = identifier.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `invoice_ramp_${safeId}.pdf`;
}

export function getInvoiceStoragePath(
  userId: string,
  fileName: string,
): string {
  return `${userId}/${fileName}`;
}

export async function getInvoiceProcessingState(
  contractId: number,
  filePath: string,
): Promise<{
  hasContractDoc: boolean;
  needsExtraction: boolean;
}> {
  const supabase = createServiceClient();

  const [{ data: contract }, { data: contractDoc }] = await Promise.all([
    supabase
      .from('contracts')
      .select('ai_extraction_status')
      .eq('id', contractId)
      .single(),
    supabase
      .from('contract_docs')
      .select('id')
      .eq('contract_id', contractId)
      .eq('file_path', filePath)
      .limit(1)
      .maybeSingle(),
  ]);

  const aiExtractionStatus = contract?.ai_extraction_status ?? null;

  return {
    hasContractDoc: Boolean(contractDoc?.id),
    needsExtraction:
      aiExtractionStatus === null || aiExtractionStatus === 'ai_failed',
  };
}

export interface InvoiceRepairCandidate {
  contractId: number;
  externalInvoiceId: string;
  filePath: string | null;
  hasContractDoc: boolean;
  needsExtraction: boolean;
}

export interface ImportedInvoiceStatusCandidate {
  contractId: number;
  externalInvoiceId: string;
  externalInvoiceStatus: string | null;
  invoiceStatus: string | null;
}

export async function getImportedInvoiceStatusCandidates(
  integrationConnectionId: string,
  provider: NangoProvider,
): Promise<ImportedInvoiceStatusCandidate[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('contracts')
    .select('id, external_invoice_id, external_invoice_status, invoice_status')
    .eq('external_integration_connection_id', integrationConnectionId)
    .eq('external_source', provider)
    .not('external_invoice_id', 'is', null);

  if (error) {
    logger.error(
      { error, integrationConnectionId, provider },
      'Failed to fetch imported invoice status candidates',
    );
    return [];
  }

  return ((data ?? []) as any[]).map((contract) => ({
    contractId: contract.id as number,
    externalInvoiceId: contract.external_invoice_id as string,
    externalInvoiceStatus:
      (contract.external_invoice_status as string | null) ?? null,
    invoiceStatus: (contract.invoice_status as string | null) ?? null,
  }));
}

export async function updateImportedInvoiceExternalStatus(params: {
  contractId: number;
  externalInvoiceId: string;
  externalStatusOld: string | null;
  externalStatusNew: string | null;
  invoiceStatusOld?: string | null;
  organizationId: string;
  userId: string;
  integrationConnectionId: string;
  provider: NangoProvider;
  startedAt?: Date;
}): Promise<boolean> {
  const supabase = createServiceClient();

  // Re-read current DB state to ensure idempotency (guards against Inngest
  // step retries where cached params carry a stale externalStatusOld).
  const { data: current } = await supabase
    .from('contracts')
    .select('external_invoice_status, invoice_status')
    .eq('id', params.contractId)
    .single();

  const currentExternalStatus =
    (current as any)?.external_invoice_status ?? null;
  const currentInvoiceStatus = (current as any)?.invoice_status ?? null;

  const didStatusChange = currentExternalStatus !== params.externalStatusNew;
  const update: Record<string, unknown> = {
    last_synced_at: new Date().toISOString(),
  };

  if (didStatusChange) {
    const invoiceStatusNew = mapExternalStatusToInvoiceStatus({
      provider: params.provider,
      externalStatusNew: params.externalStatusNew,
    });
    update.external_invoice_status = params.externalStatusNew;
    update.invoice_status = invoiceStatusNew;

    const { error } = await supabase
      .from('contracts')
      .update(update as any)
      .eq('id', params.contractId);

    if (error) {
      logger.error(
        { error, contractId: params.contractId },
        'Failed to update imported invoice external status',
      );
      return false;
    }

    await logSyncResult({
      organizationId: params.organizationId,
      userId: params.userId,
      integrationConnectionId: params.integrationConnectionId,
      provider: params.provider,
      syncType: 'inbound',
      status: 'success',
      recordsProcessed: 1,
      details: {
        event: 'external_invoice_status_changed',
        contract_id: params.contractId,
        external_invoice_id: params.externalInvoiceId,
        external_status_old: currentExternalStatus,
        external_status_new: params.externalStatusNew,
        invoice_status_old: currentInvoiceStatus,
        invoice_status_new: invoiceStatusNew,
      },
      startedAt: params.startedAt ?? new Date(),
    });

    return true;
  }

  const { error } = await supabase
    .from('contracts')
    .update(update as any)
    .eq('id', params.contractId);

  if (error) {
    logger.error(
      { error, contractId: params.contractId },
      'Failed to refresh imported invoice sync timestamp',
    );
  }

  return false;
}

export async function getInvoiceContractsNeedingRepair(
  integrationConnectionId: string,
  provider: NangoProvider,
): Promise<InvoiceRepairCandidate[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('contracts')
    .select(
      'id, external_invoice_id, ai_extraction_status, contract_docs(id, file_path)' as any,
    )
    .eq('external_integration_connection_id', integrationConnectionId)
    .eq('external_source', provider)
    .not('external_invoice_id', 'is', null);

  if (error) {
    logger.error(
      { error, integrationConnectionId, provider },
      'Failed to fetch invoice contracts needing repair',
    );
    return [];
  }

  return ((data ?? []) as any[])
    .map((contract) => {
      const contractDocs = contract.contract_docs ?? [];
      const filePath = contractDocs[0]?.file_path ?? null;
      const hasContractDoc = contractDocs.length > 0;
      const aiExtractionStatus = contract.ai_extraction_status ?? null;
      return {
        contractId: contract.id as number,
        externalInvoiceId: contract.external_invoice_id as string,
        filePath,
        hasContractDoc,
        needsExtraction:
          aiExtractionStatus === null || aiExtractionStatus === 'ai_failed',
      };
    })
    .filter((contract) => !contract.hasContractDoc || contract.needsExtraction);
}

export async function linkInvoiceToParentContract(
  invoiceContractId: number,
  parentContractId: number,
  organizationId: string,
): Promise<void> {
  try {
    // saveContractLineage runs assertLineageAllowed and upserts with
    // ignoreDuplicates, so re-syncing an already-linked invoice is a no-op.
    await saveContractLineage(parentContractId, invoiceContractId, {
      source: 'invoice-sync',
      organization_id: organizationId,
    });
  } catch (error) {
    // Swallowed rather than thrown so one bad link cannot abort the sync
    // batch, but alerted: a missing relationship keeps the invoice off the
    // discrepancy report entirely, which no user-visible surface reveals.
    logAlert(
      'invoice-sync-link-failure',
      error,
      { invoiceContractId, parentContractId, organizationId },
      'Failed to link invoice to parent contract',
    );
  }
}

export async function logSyncResult(params: {
  organizationId: string;
  userId?: string | null;
  integrationConnectionId?: string | null;
  provider: NangoProvider;
  syncType: 'inbound' | 'outbound';
  status: 'success' | 'failed' | 'partial';
  recordsProcessed: number;
  details?: unknown;
  errorDetails?: unknown;
  startedAt: Date;
}): Promise<void> {
  const supabase = createServiceClient();
  const completedAt = new Date().toISOString();
  const { error: insertError } = await (supabase
    .from('integration_sync_logs' as any)
    .insert({
      organization_id: params.organizationId,
      user_id: params.userId ?? null,
      integration_connection_id: params.integrationConnectionId ?? null,
      provider: params.provider,
      sync_type: params.syncType,
      status: params.status,
      records_processed: params.recordsProcessed,
      details: params.details ? (params.details as any) : null,
      error_details: params.errorDetails ? (params.errorDetails as any) : null,
      started_at: params.startedAt.toISOString(),
      completed_at: completedAt,
    }) as any);

  if (insertError) {
    logger.warn(
      {
        error: insertError,
        integrationConnectionId: params.integrationConnectionId,
      },
      'Failed to insert integration sync log',
    );
  }

  if (params.integrationConnectionId) {
    const healthUpdate = buildConnectionHealthUpdate({
      status: params.status,
      errorDetails: params.errorDetails,
      completedAt,
    });
    try {
      await (supabase
        .from('integration_connections' as any)
        .update(healthUpdate)
        .eq('id', params.integrationConnectionId) as any);
    } catch (error) {
      logger.warn(
        { error, integrationConnectionId: params.integrationConnectionId },
        'Failed to update integration connection sync metadata',
      );
    }
  }
}

export async function downloadXeroInvoicePdf(
  connectionId: string,
  invoiceId: string,
): Promise<{ data: Buffer; fileName: string } | null> {
  try {
    const tenantId = await getXeroTenantId(connectionId);
    if (!tenantId) {
      logger.error(
        { connectionId, invoiceId },
        'No Xero tenant ID — cannot download invoice PDF',
      );
      return null;
    }

    const nango = getNangoClient();
    const response = await nango.proxy({
      method: 'GET',
      endpoint: `/api.xro/2.0/Invoices/${invoiceId}`,
      providerConfigKey: NANGO_PROVIDER_IDS.xero,
      connectionId,
      headers: {
        'Xero-Tenant-Id': tenantId,
        Accept: 'application/pdf',
      },
      responseType: 'arraybuffer',
    });

    if (!response.data) {
      logger.error({ invoiceId }, 'Xero returned empty PDF response');
      return null;
    }

    const buffer = Buffer.from(response.data as ArrayBuffer);
    if (!buffer.slice(0, 5).toString().startsWith('%PDF-')) {
      logger.error({ invoiceId }, 'Xero response is not a valid PDF');
      return null;
    }

    return { data: buffer, fileName: getXeroInvoicePdfFileName(invoiceId) };
  } catch (error) {
    logger.error(
      {
        errorMessage: (error as { message?: string })?.message,
        errorStatus: (error as { response?: { status?: number } })?.response
          ?.status,
        invoiceId,
        connectionId,
      },
      'Failed to download Xero invoice PDF',
    );
    return null;
  }
}

export async function downloadRampInvoicePdf(
  connectionId: string,
  billId: string,
  invoiceNumber?: string,
): Promise<{ data: Buffer; fileName: string } | null> {
  try {
    const nango = getNangoClient();
    const response = await nango.proxy({
      method: 'GET',
      endpoint: `/developer/v1/bills/${billId}`,
      providerConfigKey: NANGO_PROVIDER_IDS.ramp,
      connectionId,
    });

    const bill = response.data as { invoice_urls?: string[] };
    const invoiceUrls = bill?.invoice_urls ?? [];

    if (invoiceUrls.length === 0) {
      logger.warn(
        { billId },
        'Ramp bill has no invoice URLs — cannot download PDF',
      );
      return null;
    }

    const pdfResponse = await fetch(invoiceUrls[0]);
    if (!pdfResponse.ok) {
      logger.error(
        { billId, status: pdfResponse.status },
        'Failed to download Ramp invoice PDF from pre-signed URL',
      );
      return null;
    }

    const arrayBuffer = await pdfResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0) {
      logger.error({ billId }, 'Ramp invoice PDF download returned empty data');
      return null;
    }

    return {
      data: buffer,
      fileName: getRampInvoicePdfFileName(billId, invoiceNumber),
    };
  } catch (error) {
    logger.error(
      {
        errorMessage: (error as { message?: string })?.message,
        billId,
        connectionId,
      },
      'Failed to download Ramp invoice PDF',
    );
    return null;
  }
}

export async function uploadInvoicePdfToBucket(
  data: Buffer,
  userId: string,
  fileName: string,
): Promise<{ filePath: string; fileName: string }> {
  const supabase = createServiceClient();
  const filePath = getInvoiceStoragePath(userId, fileName);

  const { error } = await supabase.storage
    .from('contract_docs')
    .upload(filePath, data, { contentType: 'application/pdf', upsert: true });

  if (error) {
    logger.error(
      { error, filePath },
      'Failed to upload invoice PDF to contract_docs bucket',
    );
    throw error;
  }

  return { filePath, fileName };
}

export async function insertInvoiceContractDoc(
  filePath: string,
  contractId: number,
  userId: string,
): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await (supabase.from('contract_docs').insert({
    file_path: filePath,
    contract_id: contractId,
    user_id: userId,
    updated_at: new Date().toISOString(),
  } as any) as any);

  if (error) {
    logger.error(
      { error, contractId, filePath },
      'Failed to insert invoice contract_docs record',
    );
    throw error;
  }
}
