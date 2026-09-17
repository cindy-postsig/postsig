import { Context } from 'hono';
import { ValidationError } from '@/lib/errors';
import { insertContractVersion } from '@/data/contract-versions';
import {
  auditLogger,
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  extractAuditContext,
} from '@/lib/audit';
import logger from '@/utils/pino';
import { invalidateContractSetCache } from '@/app/lib/actions/cache-actions';
import { logContractUploaded } from '@/data/superuser/activities';

export async function uploadContractVersion(c: Context) {
  try {
    const contractIdParam = c.req.param('id');
    const body = await c.req.json();
    const filePath = body.filePath as string | undefined;
    const fileName = body.fileName as string | undefined;
    const description =
      (body.description as string | undefined) ?? 'executed copy';

    const userMetadata = c.get('userMetadata');
    const userId = userMetadata.userId;
    const organizationId = userMetadata.organizationId;

    const contractId = Number(contractIdParam);
    if (!contractId || Number.isNaN(contractId)) {
      throw new ValidationError('Invalid contract id');
    }

    if (!filePath || !fileName || !userId) {
      throw new ValidationError('Missing required fields');
    }

    await insertContractVersion({
      contractId,
      filePath,
      fileName,
      userId,
      description,
    });

    const context = extractAuditContext(c.req.raw, {
      userId,
      organizationId,
      metadata: {
        event: 'EXECUTED_CONTRACT_VERSION_UPLOADED',
        contractId,
      },
    });

    await auditLogger.logEvent({
      action: AUDIT_ACTIONS.EXECUTED_CONTRACT_UPLOADED,
      resourceType: AUDIT_RESOURCE_TYPES.CONTRACT_VERSIONS,
      resourceId: String(contractId),
      newData: {
        version: {
          userId,
          contractId,
          filePath,
          fileName,
          description,
        },
      },
      context,
    });

    await logContractUploaded({
      contractId,
      fileName,
      userId,
      isExecutedVersion: true,
    });

    await invalidateContractSetCache();

    logger.info(
      { userId, organizationId, contractId },
      'Contract version uploaded',
    );
    return c.json({ success: true });
  } catch (error: any) {
    const status = error?.statusCode || 500;
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, status);
  }
}
