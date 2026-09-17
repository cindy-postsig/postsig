'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { ActivitiesResult } from '@/app/api/v2/types/api';

const QUERY_KEYS = {
  activities: (id: number) => ['contracts', id, 'activities'] as const,
};

export function useContractActivities(
  contractId: number,
  initialData?: ActivitiesResult,
) {
  return useQuery<ActivitiesResult>({
    queryKey: QUERY_KEYS.activities(contractId),
    queryFn: () => apiClient.contracts.getActivities(contractId),
    initialData,
    staleTime: 60 * 1000,
    enabled: !!contractId,
  });
}
