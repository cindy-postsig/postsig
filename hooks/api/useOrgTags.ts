'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import { ContractTagsResponse } from '@/app/api/v2/types/api';

export const QUERY_KEYS = {
  orgTags: (orgId: string) => ['tags', 'org', orgId] as const,
};

/**
 * Fetch tags for a specific organization.
 */

export function useOrgTags(orgId: string) {
  return useQuery<ContractTagsResponse>({
    queryKey: QUERY_KEYS.orgTags(orgId),
    queryFn: () => apiClient.tags.getOrgTags(orgId),
    enabled: !!orgId,
  });
}
