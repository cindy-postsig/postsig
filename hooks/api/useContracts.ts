'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';

export const QUERY_KEYS = {
  contracts: ['contracts'] as const,
};

/**
 * Update contract details
 */
export function useUpdateContract() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contractData: { contractId: number; data: any }) =>
      apiClient.contracts.updateContract(
        contractData.contractId,
        contractData.data,
      ),
    onSuccess: (_, variables) => {
      // Invalidate the contracts query to refetch
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.contracts,
      });
      // Invalidate the specific contract query to refetch
      queryClient.invalidateQueries({
        queryKey: [...QUERY_KEYS.contracts, variables.contractId],
      });
    },
  });
}
