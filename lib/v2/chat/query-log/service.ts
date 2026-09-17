import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { getOrgUserNames } from '@/lib/v2/users/service';
import { sanitizeQuery } from '@/lib/v2/chat/sanitize-query';
import logger from '@/utils/pino';
import type { UserMetadata } from '@/constants/types';

const EXCLUDED_EMAIL_DOMAINS = ['@postsig.com', '@codoid.com', '@gmail.com'];
const isProduction = process.env.VERCEL_ENV === 'production';

/** Never throws — errors are logged internally. */
export async function logSanitizedChatQuery(
  userMetadata: UserMetadata,
  rawQuery: string,
): Promise<void> {
  try {
    if (!rawQuery.trim()) return;
    // Local/preview envs sometimes point at the prod Supabase URL; without
    // this gate, dev queries would land in the prod chat_queries_log table.
    if (!isProduction) return;

    const userEmail = userMetadata.userProfile?.email?.toLowerCase() ?? '';
    if (EXCLUDED_EMAIL_DOMAINS.some((domain) => userEmail.endsWith(domain))) {
      return;
    }

    const orgUserNames = await getOrgUserNames(userMetadata.organizationId);

    const sanitizedQuery = sanitizeQuery({
      query: rawQuery,
      organizationName: userMetadata.organizationName ?? '',
      orgUserNames,
    });

    const { error } = await createServiceClient()
      .from('chat_queries_log')
      .insert({ sanitized_query: sanitizedQuery });

    if (error) {
      logger.error({ error }, 'Failed to insert sanitized chat query');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to log sanitized chat query');
  }
}
