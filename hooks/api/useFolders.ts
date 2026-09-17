'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { ContractFoldersResponse } from '@/app/api/v2/types/api';

export const QUERY_KEYS = {
  contractFolders: (contractId: number) =>
    ['folders', 'contract', contractId] as const,
};

/**
 * Mutation to update contract folders
 */
export function useUpdateContractFolders() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      contractId,
      folderIds,
    }: {
      contractId: number;
      folderIds: number[];
    }) => apiClient.folders.updateContractFolders(contractId, folderIds),
    onSuccess: (_, variables) => {
      // Invalidate the contract folders query to refetch
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.contractFolders(variables.contractId),
      });
      // Invalidate the contract query so useContract refetches with updated folders
      queryClient.invalidateQueries({
        queryKey: ['contracts', variables.contractId],
      });
    },
  });
}
