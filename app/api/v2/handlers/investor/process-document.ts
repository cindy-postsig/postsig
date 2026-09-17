import { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { ValidationError } from '@/lib/errors';
import { inngest } from '@/utils/inngest/client';
import logger from '@/utils/pino';
import { logDocumentUploaded } from '@/data/superuser/investor-activities';
import { auditLogger, AUDIT_ACTIONS, extractAuditContext } from '@/lib/audit';
import { createModuleArchive } from '@/lib/v2';
import {
  MAX_PERSISTED_ENTRIES,
  ZipListingSchema,
  countListingEntries,
  type ZipListing,
} from '@/lib/v2/archives/zip-listing-schema';

const ProcessDocumentBodySchema = z.object({
  fileName: z.string(),
  filePath: z.string(),
  fileType: z.string(),
  fileSize: z.coerce.number(),
  zipListing: ZipListingSchema.optional(),
});

const MAX_INDIVIDUAL_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_ZIP_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB

/**
 * Process an uploaded investor document:
 * Trigger inngest for AI extraction, PDF sanitization, entity linking
 */
export async function processDocument(c: Context) {
  const log = logger.child({ fn: 'process-document' });
  try {
    const body = await ProcessDocumentBodySchema.parseAsync(await c.req.json());
    const { fileName, filePath, fileType, fileSize, zipListing } = body;

    const userMetadata = c.get('userMetadata');
    const userId = userMetadata?.userId as string | undefined;
    const organizationId = userMetadata?.organizationId as string | undefined;

    if (!fileName || !filePath || !fileType || !userId || !organizationId) {
      throw new ValidationError('Missing required fields');
    }

    const isZip =
      fileType === 'application/zip' ||
      fileType === 'application/x-zip-compressed' ||
      fileName.toLowerCase().endsWith('.zip');

    const sizeLimit = isZip ? MAX_ZIP_FILE_SIZE : MAX_INDIVIDUAL_FILE_SIZE;
    if (typeof fileSize === 'number' && fileSize > sizeLimit) {
      const limitLabel = isZip ? '5GB' : '50MB';
      log.warn(
        {
          fileName,
          fileSize,
          fileType,
          userId,
          organizationId,
          limit: sizeLimit,
        },
        'Rejected oversized investor document upload',
      );
      return c.json(
        {
          error: `${isZip ? 'ZIP file' : 'File'} exceeds the ${limitLabel} limit`,
        },
        413,
      );
    }

    if (isZip) {
      const persistListing =
        zipListing &&
        !zipListing.truncated &&
        countListingEntries(zipListing.entries) <= MAX_PERSISTED_ENTRIES;
      await createModuleArchive({
        moduleCode: 'investor',
        organizationId,
        userId,
        filePath,
        fileName,
        fileType: 'application/zip',
        fileSize,
        source: 'investor_upload',
        ...(persistListing
          ? { extraMetadata: { zip_listing: zipListing satisfies ZipListing } }
          : {}),
      });
    }

    await inngest.send({
      name: 'droid/investor/process.document',
      data: {
        fileName,
        filePath,
        fileType,
        fileSize,
      },
      user: {
        id: userId,
        organizationId,
      },
    });

    // Log activity for document upload
    await logDocumentUploaded({
      fileName,
      fileType,
      fileSize,
      filePath,
      userId,
    });

    // Log audit event for security compliance
    const auditContext = extractAuditContext(c.req.raw, {
      userId,
      organizationId,
    });
    await auditLogger.logInvestorModuleEvent(
      AUDIT_ACTIONS.INVESTOR_DOCUMENT_UPLOADED,
      'investor_document',
      filePath,
      auditContext,
      { fileName, fileType, fileSize },
    );

    log.info({ userId, organizationId, fileName, fileType, fileSize });

    return c.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof z.ZodError || error instanceof ValidationError) {
      return c.json({ error: 'Invalid request payload' }, 400);
    }
    const err = error as {
      statusCode?: number;
      message?: string;
      stack?: string;
    };
    const status = (err?.statusCode || 500) as ContentfulStatusCode;
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error({
      error: message,
      stack: err?.stack,
      userId: (c.get('userMetadata') as Record<string, unknown>)?.userId,
      organizationId: (c.get('userMetadata') as Record<string, unknown>)
        ?.organizationId,
      processName: 'process-document',
    });
    return c.json({ error: message }, status);
  }
}
