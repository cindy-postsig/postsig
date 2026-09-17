'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import { VENTURE_DOCUMENTS_QUERY_KEYS } from './useVentureDocuments';

interface ProcessDocumentPayload {
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  zipListing?: unknown;
}

/**
 * Mutation hook for processing uploaded investor documents.
 * Triggers inngest for AI extraction, PDF sanitization, and entity linking.
 * Invalidates the documents query on success.
 */
export function useProcessInvestorDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ProcessDocumentPayload) =>
      apiClient.investor.processDocument(payload),
    onSuccess: () => {
      // Invalidate documents list to trigger refetch
      queryClient.invalidateQueries({
        queryKey: VENTURE_DOCUMENTS_QUERY_KEYS.documents,
      });
    },
  });
}
