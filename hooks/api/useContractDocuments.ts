'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { DocumentsResult } from '@/app/api/v2/types/api';

const QUERY_KEYS = {
  documents: (id: number) => ['contracts', id, 'documents'] as const,
};

export function useContractDocuments(
  contractId: number,
  initialData?: DocumentsResult,
) {
  return useQuery<DocumentsResult>({
    queryKey: QUERY_KEYS.documents(contractId),
    queryFn: () => apiClient.contracts.getDocuments(contractId),
    initialData,
    staleTime: 60 * 1000,
    enabled: !!contractId,
  });
}
