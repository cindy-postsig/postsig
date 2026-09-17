'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import { costAllocationCatalogQueryKey } from '@/hooks/api/useCostAllocation';
import { ownersCatalogQueryKey } from '@/hooks/api/useOwners';

/**
 * Both picker catalogs are org-wide and cached, so an inline create has to
 * land in each of them before the new group can be selected.
 */
export function useCreateBusinessGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiClient.orgUnits.createBusinessGroup(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: costAllocationCatalogQueryKey,
      });
      void queryClient.invalidateQueries({ queryKey: ownersCatalogQueryKey });
    },
  });
}
