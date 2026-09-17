'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { OrgUsersResponse } from '@/app/api/v2/types/api';

export const QUERY_KEYS = {
  orgUsers: (orgId: string) => ['users', 'org', orgId] as const,
};

/**
 * Fetch users for a specific organization
 */
export function useOrgUsers(orgId: string) {
  return useQuery<OrgUsersResponse>({
    queryKey: QUERY_KEYS.orgUsers(orgId),
    queryFn: () => apiClient.users.getOrgUsers(orgId),
    enabled: !!orgId,
  });
}
