'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type {
  SpendQueryInput,
  SpendQueryResponse,
} from '@/app/api/v2/handlers/spend/query';

export function useSpendQuery(
  input: SpendQueryInput,
  options?: { enabled?: boolean },
) {
  return useQuery<SpendQueryResponse>({
    queryKey: ['spend', input],
    queryFn: () => apiClient.spend.query(input),
    enabled: options?.enabled ?? true,
  });
}
