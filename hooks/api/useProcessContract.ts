'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import { ModelProvider } from '@/constants/types';
import { QUERY_KEYS } from './useContracts';

interface ProcessPayload {
  fileName: string;
  modelProvider: ModelProvider;
  processType: string;
}

export function useProcessContract() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ProcessPayload) =>
      apiClient.contracts.process(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.contracts });
    },
  });
}
