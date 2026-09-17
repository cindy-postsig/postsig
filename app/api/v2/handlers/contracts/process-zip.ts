import { Context } from 'hono';
import { z } from 'zod';
import logger from '@/utils/pino';
import { ValidationError } from '@/lib/errors';
import { inngest } from '@/utils/inngest/client';
import {
  auditLogger,
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  extractAuditContext,
} from '@/lib/audit';
import { buildSafePath, sanitizeFileName } from '@/utils/helpers';
import { createModuleArchive } from '@/lib/v2';

const ProcessZipBodySchema = z.object({
  fileName: z.string(),
  filePath: z.string(),
  fileSize: z.number(),
});

// 500mb
const SKIP_PROCESSING_FILE_SIZE_LIMIT = 500 * 1024 * 1024;

export async function processZip(c: Context) {
  try {
    const body = await ProcessZipBodySchema.parseAsync(await c.req.json());
    const { fileName, filePath, fileSize } = body;

    const userMetadata = c.get('userMetadata');
    const userId = userMetadata?.userId as string | undefined;
    const organizationId = userMetadata?.organizationId as string | undefined;

    if (!userId || !organizationId) {
      throw new ValidationError('Missing required fields');
    }

    const expectedPath = buildSafePath([
      userId,
      'bulk',
      sanitizeFileName(fileName),
    ]);
    if (filePath !== expectedPath) {
      throw new ValidationError('Invalid file path');
    }

    await createModuleArchive({
      moduleCode: 'cpm',
      organizationId,
      userId,
      filePath,
      fileName,
      fileType: 'application/zip',
      fileSize,
      source: 'cpm_upload',
    });

    if (fileSize <= SKIP_PROCESSING_FILE_SIZE_LIMIT) {
      await inngest.send({
        name: 'contracts/process-zip',
        data: {
          fileName,
          filePath,
        },
        user: {
          id: userId,
          organizationId,
        },
      });

      logger.info(
        { userId, organizationId, fileName, filePath },
        'Contract ZIP processing triggered',
      );
    } else {
      logger.info(
        { userId, organizationId, fileName, filePath, fileSize },
        'Contract ZIP processing skipped due to file size',
      );
    }

    const auditContext = extractAuditContext(c.req.raw, {
      userId,
      organizationId,
    });
    await auditLogger.logEvent({
      action: AUDIT_ACTIONS.CONTRACT_DOCUMENT_UPLOADED,
      resourceType: AUDIT_RESOURCE_TYPES.CONTRACTS,
      resourceId: filePath,
      newData: { fileName, filePath, uploadType: 'zip' },
      context: auditContext,
    });

    return c.json({ success: true });
  } catch (error: unknown) {
    const status = error instanceof ValidationError ? 400 : 500;
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message }, 'processZip failed');
    return c.json({ error: message }, status);
  }
}
