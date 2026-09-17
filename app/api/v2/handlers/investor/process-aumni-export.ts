import { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { ValidationError } from '@/lib/errors';
import logger from '@/utils/pino';
import { auditLogger, AUDIT_ACTIONS, extractAuditContext } from '@/lib/audit';
import { createModuleArchive } from '@/lib/v2';
import {
  MAX_PERSISTED_ENTRIES,
  ZipListingSchema,
  countListingEntries,
} from '@/lib/v2/archives/zip-listing-schema';

const ProcessAumniExportBodySchema = z.object({
  fileName: z.string(),
  filePath: z.string(),
  fileSize: z.coerce.number(),
  zipListing: ZipListingSchema.optional(),
});

const MAX_AUMNI_ZIP_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB

/**
 * Process an uploaded Aumni export ZIP file: record the archive so the
 * customer can verify receipt; extraction of its contents is handled out of
 * band.
 */
export async function processAumniExport(c: Context) {
  try {
    const body = await ProcessAumniExportBodySchema.parseAsync(
      await c.req.json(),
    );
    const { fileName, filePath, fileSize, zipListing } = body;

    const userMetadata = c.get('userMetadata');
    const userId = userMetadata?.userId as string | undefined;
    const organizationId = userMetadata?.organizationId as string | undefined;

    if (!fileName || !filePath || !userId || !organizationId) {
      throw new ValidationError('Missing required fields');
    }

    if (fileSize > MAX_AUMNI_ZIP_SIZE) {
      logger.warn(
        {
          fileName,
          fileSize,
          userId,
          organizationId,
          limit: MAX_AUMNI_ZIP_SIZE,
        },
        'Rejected oversized Aumni export upload',
      );
      return c.json({ error: 'ZIP file exceeds the 5GB limit' }, 413);
    }

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
      source: 'aumni',
      ...(persistListing ? { extraMetadata: { zip_listing: zipListing } } : {}),
    });

    const auditContext = extractAuditContext(c.req.raw, {
      userId,
      organizationId,
    });
    await auditLogger.logInvestorModuleEvent(
      AUDIT_ACTIONS.INVESTOR_DOCUMENT_UPLOADED,
      'investor_document',
      filePath,
      auditContext,
      { fileName, fileSize, importSource: 'aumni' },
    );

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
    logger.error(
      { error: message, stack: err?.stack },
      'process-aumni-export failed',
    );
    return c.json({ error: message }, status);
  }
}
