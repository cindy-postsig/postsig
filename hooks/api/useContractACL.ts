'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { ContractACLResult } from '@/app/api/v2/types/api';

const QUERY_KEYS = {
  acl: (id: number) => ['contracts', id, 'acl'] as const,
};

export function useContractACL(
  contractId: number,
  initialData?: ContractACLResult,
) {
  return useQuery<ContractACLResult>({
    queryKey: QUERY_KEYS.acl(contractId),
    queryFn: () => apiClient.contracts.getACL(contractId),
    initialData,
    staleTime: 60 * 1000,
    enabled: !!contractId,
  });
}
