'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { ContractResponse } from '@/app/api/v2/types/api';

const QUERY_KEYS = {
  contract: (id: number) => ['contracts', id] as const,
};

export function useContract(
  contractId: number,
  initialData?: ContractResponse,
) {
  return useQuery<ContractResponse>({
    queryKey: QUERY_KEYS.contract(contractId),
    queryFn: () => apiClient.contracts.get(contractId),
    initialData,
    staleTime: 60 * 1000,
    enabled: !!contractId,
  });
}
