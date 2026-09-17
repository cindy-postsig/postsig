'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { ContractTagsResponse } from '@/app/api/v2/types/api';

export const QUERY_KEYS = {
  contractTags: (contractId: number) =>
    ['tags', 'contract', contractId] as const,
};

/**
 * Mutate contract tags for a specific contract
 */
export function useUpdateContractTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      contractId,
      tagIds,
    }: {
      contractId: number;
      tagIds: number[];
    }) => apiClient.tags.updateContractTags(contractId, tagIds),
    onSuccess: (_, variables) => {
      // Invalidate the contract tags query to refetch updated data
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.contractTags(variables.contractId),
      });
      // Invalidate the contract query so useContract refetches with updated tags
      queryClient.invalidateQueries({
        queryKey: ['contracts', variables.contractId],
      });
    },
  });
}
