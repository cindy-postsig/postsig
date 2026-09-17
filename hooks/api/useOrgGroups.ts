'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { OrgBusinessGroupsResponse } from '@/app/api/v2/types/api';

export const QUERY_KEYS = {
  orgGroups: (orgId: string) => ['groups', 'org', orgId] as const,
};

/**
 * Fetch the organization's business-group org-unit nodes
 */
export function useOrgBusinessGroups(orgId: string) {
  return useQuery<OrgBusinessGroupsResponse>({
    queryKey: QUERY_KEYS.orgGroups(orgId),
    queryFn: () => apiClient.groups.getOrgGroups(orgId),
    enabled: !!orgId,
  });
}
