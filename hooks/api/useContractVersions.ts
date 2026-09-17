'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { LatestVersionResult } from '@/app/api/v2/types/api';

const QUERY_KEYS = {
  versions: (id: number) => ['contracts', id, 'versions'] as const,
};

export function useContractVersions(
  contractId: number,
  initialData?: LatestVersionResult,
) {
  return useQuery<LatestVersionResult>({
    queryKey: QUERY_KEYS.versions(contractId),
    queryFn: () => apiClient.contracts.getVersions(contractId),
    initialData,
    staleTime: 60 * 1000,
    enabled: !!contractId,
  });
}
