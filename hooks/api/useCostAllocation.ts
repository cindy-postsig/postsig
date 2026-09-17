'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type {
  AllocationCatalogData,
  CostAllocationTabPayload,
} from '@/app/api/v2/handlers/cost-allocation';
import type { AllocationScopeInput } from '@/lib/v2/cost-allocation/service';

export const costAllocationQueryKey = (contractId: number) =>
  ['cost-allocation', contractId] as const;

// One catalog per org (the session is org-scoped), shared by every contract's
// editor and refreshed when a business group is created inline.
export const costAllocationCatalogQueryKey = [
  'cost-allocation',
  'catalog',
] as const;

export function useCostAllocationTab(contractId: number) {
  return useQuery<CostAllocationTabPayload>({
    queryKey: costAllocationQueryKey(contractId),
    queryFn: () => apiClient.costAllocation.tab(contractId),
    staleTime: 30 * 1000,
  });
}

/** Fetched only when the editor opens — the catalog is org-wide, not per contract. */
export function useCostAllocationCatalog() {
  return useQuery<AllocationCatalogData>({
    queryKey: costAllocationCatalogQueryKey,
    queryFn: () => apiClient.costAllocation.catalog(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveCostAllocation(contractId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scopes: AllocationScopeInput[]) =>
      apiClient.costAllocation.saveAllocation(contractId, scopes),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: costAllocationQueryKey(contractId),
      }),
  });
}
