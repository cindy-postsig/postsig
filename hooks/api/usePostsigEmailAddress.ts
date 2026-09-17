'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { PostsigEmailAddressResponse } from '@/app/api/v2/types/api';

const QUERY_KEYS = {
  postsigEmailAddress: [
    'organization-preferences',
    'postsig-email-address',
  ] as const,
};

export function usePostsigEmailAddress() {
  return useQuery<PostsigEmailAddressResponse>({
    queryKey: QUERY_KEYS.postsigEmailAddress,
    queryFn: () => apiClient.organizationPreferences.getPostsigEmailAddress(),
  });
}

export function useTogglePostsigEmailAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: boolean) =>
      apiClient.organizationPreferences.togglePostsigEmailAddress(value),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.postsigEmailAddress,
      });
    },
  });
}
