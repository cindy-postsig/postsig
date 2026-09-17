'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';

export function useUpdateEntityTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entityId, tags }: { entityId: number; tags: string[] }) =>
      apiClient.tags.updateEntityTags(entityId, tags),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolioCompanies'] });
    },
  });
}
