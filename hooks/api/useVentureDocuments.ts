'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { VentureDocumentsResult } from '@/app/api/v2/types/api';
import type { VentureDocumentRow } from '@/lib/v2/investor/service';

export const VENTURE_DOCUMENTS_QUERY_KEYS = {
  documents: ['ventureDocuments'] as const,
};

interface UseVentureDocumentsOptions {
  /** Polling interval in ms. Set to poll for updates (e.g., after uploads). */
  refetchInterval?: number | false;
}

/**
 * Hook to fetch venture documents with optional polling.
 */
export function useVentureDocuments(
  initialData?: VentureDocumentRow[],
  options?: UseVentureDocumentsOptions,
) {
  return useQuery<VentureDocumentsResult>({
    queryKey: VENTURE_DOCUMENTS_QUERY_KEYS.documents,
    queryFn: () => apiClient.investor.getDocuments(),
    initialData: initialData ? { documents: initialData } : undefined,
    staleTime: 30 * 1000, // Consider data fresh for 30 seconds
    refetchInterval: options?.refetchInterval,
  });
}
