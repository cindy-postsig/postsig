import { Context } from 'hono';
import { z } from 'zod';
import logger from '@/utils/pino';
import { ValidationError } from '@/lib/errors';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { sanitizeFileName } from '@/utils/helpers';

const VerifyZipUploadBodySchema = z.object({
  fileName: z.string().min(1, 'fileName is required'),
});

export async function verifyZipUpload(c: Context) {
  try {
    const body = await VerifyZipUploadBodySchema.parseAsync(await c.req.json());
    const { fileName } = body;

    const userMetadata = c.get('userMetadata');
    const userId = userMetadata?.userId as string | undefined;

    if (!userId) {
      throw new ValidationError('Missing user ID');
    }

    const sanitized = sanitizeFileName(fileName);
    const bulkFolder = `${userId}/bulk`;

    const supabase = createServiceClient();
    const { data: files, error } = await supabase.storage
      .from('contract_docs')
      .list(bulkFolder);

    if (error) {
      logger.error({ error, bulkFolder }, 'Failed to list bulk folder');
      return c.json({ error: 'Failed to check for existing files' }, 500);
    }

    const existing = files?.find((f) => f.name === sanitized);

    return c.json({
      exists: !!existing,
      existingSize: existing?.metadata?.size as number | undefined,
      existingNames: files?.map((f) => f.name) ?? [],
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError || error instanceof ValidationError) {
      return c.json({ error: 'Invalid request payload' }, 400);
    }
    logger.error({ error }, 'verifyZipUpload failed');
    return c.json({ error: 'Failed to verify ZIP upload' }, 500);
  }
}
