'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { ContractFoldersResponse } from '@/app/api/v2/types/api';

export const QUERY_KEYS = {
  orgFolders: (orgId: string) => ['folders', 'org', orgId] as const,
};

/**
 * Fetch organization folders for a specific organization
 */
export function useOrgFolders(orgId: string) {
  return useQuery<ContractFoldersResponse>({
    queryKey: QUERY_KEYS.orgFolders(orgId),
    queryFn: () => apiClient.folders.getOrgFolders(orgId),
    enabled: !!orgId,
  });
}
