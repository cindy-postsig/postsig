'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { InventoryListResponse } from '@/app/api/v2/types/api';
import type { InventoryItem } from '@/lib/v2/inventory/types';

export const INVENTORY_QUERY_KEYS = {
  inventory: ['inventory'] as const,
};

export function useInventory(initialData?: InventoryItem[]) {
  return useQuery<InventoryListResponse>({
    queryKey: INVENTORY_QUERY_KEYS.inventory,
    queryFn: () => apiClient.inventory.list(),
    initialData: initialData
      ? { items: initialData, count: initialData.length }
      : undefined,
    staleTime: 60 * 1000, // Consider data fresh for 60 seconds
  });
}
