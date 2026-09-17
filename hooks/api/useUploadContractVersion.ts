'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';

const QUERY_KEYS = {
  contracts: ['contracts'] as const,
};

interface UploadPayload {
  contractId: number;
  filePath: string;
  fileName: string;
  description?: string;
}

export function useUploadContractVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      contractId,
      filePath,
      fileName,
      description,
    }: UploadPayload) =>
      apiClient.contracts.uploadVersion(contractId, {
        filePath,
        fileName,
        description,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.contracts });
    },
  });
}
