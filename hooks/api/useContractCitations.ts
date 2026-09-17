'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { CitationsResult } from '@/app/api/v2/types/api';

const QUERY_KEYS = {
  citations: (id: number) => ['contracts', id, 'citations'] as const,
};

export function useContractCitations(
  contractId: number,
  initialData?: CitationsResult,
) {
  return useQuery<CitationsResult>({
    queryKey: QUERY_KEYS.citations(contractId),
    queryFn: () => apiClient.contracts.getCitations(contractId),
    initialData,
    staleTime: 60 * 1000,
    enabled: !!contractId,
  });
}
