'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { SaveContractOwnersBody } from '@/app/api/v2/handlers/contracts/owners';
import type { OwnersCatalogData } from '@/lib/v2/owners/catalog';

// One catalog per org (the session is org-scoped), shared by every contract's
// owner pickers.
export const ownersCatalogQueryKey = ['owners', 'catalog'] as const;

/** Fetched only once a picker opens — the catalog is org-wide, not per contract. */
export function useOwnersCatalog(enabled: boolean) {
  return useQuery<OwnersCatalogData>({
    queryKey: ownersCatalogQueryKey,
    queryFn: () => apiClient.contracts.ownersCatalog(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/** Owners ride the contract embed, so a save leaves the cached contract stale. */
export function useSaveContractOwners(contractId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveContractOwnersBody) =>
      apiClient.contracts.saveOwners(contractId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['contracts', contractId] }),
  });
}
