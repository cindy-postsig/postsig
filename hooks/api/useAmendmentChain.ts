'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { AmendmentChainResult } from '@/app/api/v2/types/api';

const QUERY_KEYS = {
  amendments: (id: number) => ['contracts', id, 'amendments'] as const,
};

export function useAmendmentChain(
  contractId: number,
  initialData?: AmendmentChainResult,
) {
  return useQuery<AmendmentChainResult>({
    queryKey: QUERY_KEYS.amendments(contractId),
    queryFn: () => apiClient.contracts.getAmendments(contractId),
    initialData,
    staleTime: 60 * 1000,
    enabled: !!contractId,
  });
}
