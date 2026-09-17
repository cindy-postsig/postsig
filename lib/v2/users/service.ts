import { User } from '@/app/api/v2/types/api';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { filterVisibleOrgUsers } from '@/lib/utils/users';
import logger from '@/utils/pino';

const ORG_NAMES_TTL_MS = 60 * 60 * 1000; // 1 hour
const orgNamesCache = new Map<string, { names: string[]; expiresAt: number }>();

/** Cached org user names via service client (safe for use during streaming). */
export async function getOrgUserNames(orgId: string): Promise<string[]> {
  const cached = orgNamesCache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) return cached.names;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('users')
    .select('name')
    .eq('organization_id', orgId);

  if (error) {
    logger.error({ error, orgId }, 'Failed to fetch org user names');
    throw error;
  }

  const names = (data ?? []).map((u) => u.name).filter(Boolean) as string[];
  orgNamesCache.set(orgId, { names, expiresAt: Date.now() + ORG_NAMES_TTL_MS });
  return names;
}

export function warmOrgNamesCache(orgId: string): void {
  getOrgUserNames(orgId).catch((err) => {
    logger.error({ error: err, orgId }, 'Failed to warm org names cache');
  });
}

export async function getOrgUsers(
  organizationId: string,
  options?: { currentUserEmail?: string | null },
): Promise<User[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('users')
    .select(`id, email, name`)
    .eq('organization_id', organizationId);

  if (error) {
    logger.error(
      { error, organizationId },
      'Failed to fetch organization users',
    );
    throw error;
  }

  const users: User[] = (data || []).map((item) => ({
    id: item.id as unknown as number,
    email: item.email || '',
    name: item.name || '',
  }));

  return filterVisibleOrgUsers(users, options);
}
