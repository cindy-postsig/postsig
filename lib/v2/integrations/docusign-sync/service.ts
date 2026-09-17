import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import {
  callDocuSignApi,
  fetchEnvelopeDocuments,
  downloadDocument,
} from '@/utils/docusign';
import { buildConnectionHealthUpdate } from '@/lib/v2/integrations/settings-service';
import logger from '@/utils/pino';
import type { DocuSignEnvelope, DocuSignDocument } from './types';

const CONTRACT_STATUS_NEW = 1;

export interface DocuSignActiveConnection {
  id: string;
  organization_id: string;
  user_id: string;
  provider: 'docusign';
  health_status: 'healthy' | 'needs_reconnect' | 'disconnected';
  sync_enabled: boolean;
}

export async function getDocuSignActiveConnections(options: {
  integrationConnectionId?: string;
  includeDisabled?: boolean;
}): Promise<DocuSignActiveConnection[]> {
  const supabase = createServiceClient();
  let query = supabase
    .from('integration_connections' as any)
    .select(
      'id, organization_id, user_id, provider, health_status, sync_enabled',
    )
    .eq('status', 'connected')
    .eq('health_status', 'healthy')
    .eq('provider', 'docusign') as any;

  if (!options.includeDisabled) {
    query = query.eq('sync_enabled', true);
  }

  if (options.integrationConnectionId) {
    query = query.eq('id', options.integrationConnectionId);
  }

  const { data, error } = await query;

  if (error) {
    logger.error(
      { error },
      'Failed to fetch active DocuSign integration connections',
    );
    return [];
  }

  return (data ?? []) as DocuSignActiveConnection[];
}

export async function getLastDocuSignSyncAt(
  integrationConnectionId: string,
): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await (supabase
    .from('integration_sync_logs' as any)
    .select('completed_at')
    .eq('integration_connection_id', integrationConnectionId)
    .eq('provider', 'docusign')
    .eq('status', 'success')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single() as any);

  return data?.completed_at ?? null;
}

export async function fetchDocuSignEnvelopes(
  userId: string,
  options: {
    sinceDate?: string;
  },
): Promise<DocuSignEnvelope[]> {
  const supabase = createServiceClient();
  const fromDate = options.sinceDate
    ? new Date(options.sinceDate)
    : new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000); // Default: 6 months

  return callDocuSignApi(supabase, userId, async (params) => {
    const queryParams = new URLSearchParams({
      from_date: fromDate.toISOString(),
      status: 'completed',
    }).toString();
    const url = `${params.baseUri}/restapi/v2.1/accounts/${params.accountId}/envelopes?${queryParams}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error('token_expired');
      throw new Error(
        `Failed to fetch completed envelopes: ${response.statusText}`,
      );
    }
    const data = await response.json();
    return (data.envelopes ?? []) as DocuSignEnvelope[];
  });
}

export async function fetchDocuSignEnvelopeDocumentList(
  userId: string,
  envelopeId: string,
): Promise<DocuSignDocument[]> {
  const supabase = createServiceClient();
  const docs = await callDocuSignApi(supabase, userId, (params) =>
    fetchEnvelopeDocuments({ ...params, envelopeId }),
  );
  return (docs ?? []).filter(
    (doc: any) => doc.documentId !== 'certificate',
  ) as DocuSignDocument[];
}

export async function downloadDocuSignDocument(
  userId: string,
  envelopeId: string,
  documentId: string,
): Promise<Buffer | null> {
  const supabase = createServiceClient();
  try {
    const blob: Blob = await callDocuSignApi(supabase, userId, (params) =>
      downloadDocument({ ...params, envelopeId, documentId }),
    );
    const arrayBuffer = await blob.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    logger.error(
      { error, envelopeId, documentId, userId },
      'Failed to download DocuSign document',
    );
    return null;
  }
}

export function getDocuSignDocFileName(
  envelopeId: string,
  documentId: string,
  documentName?: string,
): string {
  const safeName = documentName
    ? documentName.replace(/[^a-zA-Z0-9_\s-]/g, '_').replace(/\s+/g, '_')
    : `doc_${documentId}`;
  const safeEnvelopeId = envelopeId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `docusign_${safeEnvelopeId}_${safeName}.pdf`;
}

export function getDocuSignStoragePath(
  userId: string,
  fileName: string,
): string {
  return `${userId}/${fileName}`;
}

export async function upsertDocuSignEnvelopeAsContract(params: {
  envelopeId: string;
  subject: string;
  status: string;
  completedDateTime: string | null;
  createdDateTime: string;
  organizationId: string;
  userId: string;
  integrationConnectionId: string;
}): Promise<{ contractId: number; isNew: boolean } | null> {
  const supabase = createServiceClient();

  // Check if already exists
  const { data: existing } = await supabase
    .from('contracts')
    .select('id, external_invoice_id')
    .eq('organization_id', params.organizationId)
    .eq('external_source', 'docusign')
    .eq('external_invoice_id', params.envelopeId)
    .single();

  const now = new Date().toISOString();

  if (existing?.id) {
    // Update last_synced_at and status
    const { error } = await supabase
      .from('contracts')
      .update({
        last_synced_at: now,
        updated_at: now,
      } as any)
      .eq('id', existing.id);

    if (error) {
      logger.error(
        { error, contractId: existing.id },
        'Failed to update synced DocuSign contract',
      );
      return null;
    }
    return { contractId: existing.id, isNew: false };
  }

  // Insert new contract
  const contractPayload = {
    organization_id: params.organizationId,
    user_id: params.userId,
    external_source: 'docusign',
    external_invoice_id: params.envelopeId,
    external_integration_connection_id: params.integrationConnectionId,
    status_id: CONTRACT_STATUS_NEW,
    summary: params.subject || 'DocuSign Envelope',
    last_synced_at: now,
    created_at: now,
    updated_at: now,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('contracts')
    .insert(contractPayload as any)
    .select('id')
    .single();

  if (insertError || !inserted) {
    logger.error(
      { error: insertError, envelopeId: params.envelopeId },
      'Failed to insert DocuSign envelope as contract',
    );
    return null;
  }

  return { contractId: inserted.id, isNew: true };
}

export async function uploadDocuSignPdfToBucket(
  data: Buffer,
  userId: string,
  fileName: string,
): Promise<{ filePath: string; fileName: string }> {
  const supabase = createServiceClient();
  const filePath = getDocuSignStoragePath(userId, fileName);

  const { error } = await supabase.storage
    .from('contract_docs')
    .upload(filePath, data, { contentType: 'application/pdf', upsert: true });

  if (error) {
    logger.error(
      { error, filePath },
      'Failed to upload DocuSign PDF to contract_docs bucket',
    );
    throw error;
  }

  return { filePath, fileName };
}

export async function insertDocuSignContractDoc(
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
      'Failed to insert DocuSign contract_docs record',
    );
    throw error;
  }
}

export async function getDocuSignProcessingState(
  contractId: number,
  filePath: string,
): Promise<{ hasContractDoc: boolean; needsExtraction: boolean }> {
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
      .maybeSingle(),
  ]);

  const hasContractDoc = !!contractDoc?.id;
  const extractionStatus = contract?.ai_extraction_status as string | null;
  const needsExtraction =
    !extractionStatus ||
    extractionStatus === 'pending' ||
    extractionStatus === 'ai_failed' ||
    extractionStatus === 'ext_failed';

  return { hasContractDoc, needsExtraction };
}

export async function logDocuSignSyncResult(params: {
  organizationId: string;
  userId: string;
  integrationConnectionId: string;
  syncType: 'inbound';
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
      user_id: params.userId,
      integration_connection_id: params.integrationConnectionId,
      provider: 'docusign',
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
      'Failed to insert DocuSign sync log',
    );
  }

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
      'Failed to update DocuSign connection sync metadata',
    );
  }
}
