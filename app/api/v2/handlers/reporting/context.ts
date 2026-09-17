import { Context } from 'hono';
import type { UserMetadata } from '@/constants/types';
import type { ReportingCaller } from '@/lib/v2/kpis/requests';

export function callerFrom(c: Context): ReportingCaller | null {
  const userMetadata = c.get('userMetadata') as UserMetadata | undefined;
  if (!userMetadata?.organizationId) return null;
  return {
    userId: userMetadata.userId,
    organizationId: userMetadata.organizationId,
    senderName: userMetadata.userProfile?.name ?? null,
    userRole: userMetadata.userRole,
  };
}

export async function readJson<T>(c: Context): Promise<T | null> {
  try {
    return (await c.req.json()) as T;
  } catch {
    return null;
  }
}
