import { Context } from 'hono';
import logger from '@/utils/pino';
import { ValidationError } from '@/lib/errors';
import { contractStatuses } from '@/app/lib/constants';
import { ModelProvider } from '@/constants/types';
import { uploadToOpenAi } from '@/app/lib/actions/openai';
import { insertContract, insertContractDoc } from '@/data/superuser/contracts';
import {
  logProcessingStatusChange,
  logContractUploaded,
} from '@/data/superuser/activities';
import { getCacheService } from '@/app/lib/redis/cache-service';
import { inngest } from '@/utils/inngest/client';
import { createClient } from '@/utils/supabase/service_server';
import { validateDocumentContent } from '@/lib/utils/document-content-validation';
import { buildSafePath, PathTraversalError } from '@/utils/helpers';
import {
  auditLogger,
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  extractAuditContext,
} from '@/lib/audit';

/**
 * Reason to refuse a stored contract, or null when its bytes are a PDF.
 *
 * Reads the object rather than trusting the request: the declared type is a
 * client claim, and the pipeline downstream assumes a PDF.
 */
async function rejectContractContent(
  filePath: string,
): Promise<{ message: string; sniffed?: string } | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from('contract_docs')
    .download(filePath);
  if (error || !data) {
    throw new Error(`Failed to download ${filePath} for validation`);
  }

  const bytes = new Uint8Array(await data.arrayBuffer());
  const validation = await validateDocumentContent('application/pdf', bytes);
  if (validation.accepted) return null;

  return {
    message: `Unsupported file type: ${validation.sniffedMimeType ?? 'unknown'}`,
    sniffed: validation.sniffedMimeType,
  };
}

export async function processContract(c: Context) {
  try {
    const body = await c.req.json();
    const fileName = body.fileName as string | undefined;
    const modelProvider = body.modelProvider as
      | ModelProvider
      | ModelProvider.google;
    const processType = body.processType as string | undefined;

    const userMetadata = c.get('userMetadata');
    const userId = userMetadata?.userId as string | undefined;
    const organizationId = userMetadata?.organizationId as string | undefined;

    if (
      !fileName ||
      !modelProvider ||
      !processType ||
      !userId ||
      !organizationId
    ) {
      throw new ValidationError('Missing required fields');
    }

    let filePath: string;
    try {
      filePath = buildSafePath([userId, fileName]);
    } catch (error) {
      if (error instanceof PathTraversalError) {
        logger.warn({ fileName, userId }, 'Path traversal attempt detected');
        throw new ValidationError('Invalid file name');
      }
      throw error;
    }

    // The contracts pipeline treats every upload as a PDF, so confirm the bytes
    // back that before a contract record exists for the file or it is handed to
    // the model. The type reaching this handler is whatever the client claimed.
    const rejection = await rejectContractContent(filePath);
    if (rejection) {
      logger.warn(
        { fileName, filePath, userId, sniffedFileType: rejection.sniffed },
        'Rejecting contract whose content is not a PDF',
      );
      throw new ValidationError(rejection.message, 'fileName');
    }

    const cacheService = await getCacheService();

    // Upload to OpenAI (if applicable)
    const openAiFile =
      modelProvider === ModelProvider.openai
        ? await uploadToOpenAi(filePath)
        : { id: null };

    // Insert contract record
    const insertContractData = await insertContract({
      updated_at: new Date().toISOString(),
      open_ai_file_id: openAiFile.id,
      status_id: contractStatuses.uploaded,
      user_id: userId,
      organization_id: organizationId,
    });

    const contractId = insertContractData[0].id;

    // Activity logs
    await logContractUploaded({
      contractId,
      fileName,
      changedBy: userId,
      userId,
    });

    await logProcessingStatusChange({
      contractId,
      newStatusId: contractStatuses.uploaded,
      changedBy: userId,
    });

    const auditContext = extractAuditContext(c.req.raw, {
      userId,
      organizationId,
    });
    await auditLogger.logEvent({
      action: AUDIT_ACTIONS.CONTRACT_DOCUMENT_UPLOADED,
      resourceType: AUDIT_RESOURCE_TYPES.CONTRACTS,
      resourceId: String(contractId),
      newData: { fileName, filePath, uploadType: 'pdf' },
      context: auditContext,
    });

    // Insert contract document record
    await insertContractDoc({
      file_path: filePath,
      updated_at: new Date().toISOString(),
      contract_id: contractId,
      user_id: userId,
    });

    // Trigger downstream Inngest events
    await inngest.send([
      // {
      //   name: 'contracts/extractcontracttext',
      //   data: {
      //     fileName,
      //     modelProvider,
      //     contractId,
      //   },
      //   user: {
      //     id: userId,
      //     organizationId,
      //   },
      // },
      {
        // Translation and extraction run in parallel: extraction always reads
        // the original upload, so it never waits on language detection or DeepL.
        name: 'contracts/translate-document',
        data: {
          fileName,
          contractId,
        },
        user: {
          id: userId,
          organizationId,
        },
      },
      {
        name: 'contracts/extractcontract',
        data: {
          fileName,
          fileId: openAiFile.id,
          contractId,
          modelProvider,
        },
        user: {
          id: userId,
          organizationId,
        },
      },
    ]);

    // Invalidate caches
    await cacheService.invalidateOrganizationData({ organizationId });
    await cacheService.invalidateVendorList({ userId, organizationId });

    logger.info(
      { userId, organizationId, fileName, contractId },
      'Contract processed',
    );
    return c.json({ contractId });
  } catch (error: any) {
    const status = error?.statusCode || 500;
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      { error: message, stack: error?.stack },
      'processContract failed',
    );
    return c.json({ error: message }, status);
  }
}
