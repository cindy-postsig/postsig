import { Context } from 'hono';
import { z } from 'zod';
import { ValidationError } from '@/lib/errors';
import { sendResendEmail } from '@/app/lib/actions';
import { APP_BASE_URL } from '@/emails/_components/env';
import { InvestorDocumentReceivedEmail } from '@/emails/InvestorDocumentReceivedEmail';
import logger from '@/utils/pino';

const NotifyUploadBodySchema = z.object({
  fileNames: z.array(z.string()).min(1).max(200),
  source: z.enum(['documents', 'aumni']),
  sessionId: z.string().min(1).max(128),
});

// Best-effort dedup: process-local, so a duplicate request that lands on a
// different serverless instance can still send a second email. Not a critical
// risk for this use case (worst case: user gets two upload-confirmation
// emails); upgrade to Redis/DB-backed idempotency if dupes become a real
// problem.
const recentSessions = new Map<string, number>();
const SESSION_TTL_MS = 10 * 60 * 1000;

const RESEND_TIMEOUT_MS = 10_000;

function rememberSession(sessionId: string): boolean {
  const now = Date.now();
  for (const [id, ts] of recentSessions) {
    if (now - ts > SESSION_TTL_MS) recentSessions.delete(id);
  }
  if (recentSessions.has(sessionId)) return false;
  recentSessions.set(sessionId, now);
  return true;
}

export async function notifyUpload(c: Context) {
  const log = logger.child({ fn: 'notify-upload' });
  try {
    const body = await NotifyUploadBodySchema.parseAsync(await c.req.json());
    const { fileNames, source, sessionId } = body;

    const userMetadata = c.get('userMetadata');
    const userId = userMetadata?.userId as string | undefined;
    const userProfile = userMetadata?.userProfile as
      | { email: string | null; name: string | null }
      | null
      | undefined;
    const email = userProfile?.email ?? null;
    const userName = userProfile?.name ?? 'there';

    if (!userId || !email) {
      throw new ValidationError('Missing user context');
    }

    if (!rememberSession(sessionId)) {
      log.info({ userId, sessionId }, 'Skipping duplicate notify-upload');
      return c.json({ success: true, skipped: true });
    }

    const template = InvestorDocumentReceivedEmail({
      appUrl: APP_BASE_URL,
      userName,
      fileNames,
    });

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        sendResendEmail({
          template,
          subject: 'Your documents are being processed',
          emailList: [email],
        }),
        new Promise((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error('Resend send timed out')),
            RESEND_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }

    log.info(
      { userId, source, fileCount: fileNames.length, sessionId },
      'Sent upload confirmation email',
    );

    return c.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof z.ZodError || error instanceof ValidationError) {
      return c.json({ error: 'Invalid request payload' }, 400);
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error({ error: message }, 'notify-upload failed');
    return c.json({ error: message }, 500);
  }
}
