'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { ProductsListResponse } from '@/app/api/v2/types/api';

const QUERY_KEYS = {
  products: ['products'] as const,
};

export function useProducts() {
  return useQuery<ProductsListResponse>({
    queryKey: QUERY_KEYS.products,
    queryFn: () => apiClient.products.list(),
  });
}
