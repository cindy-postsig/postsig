'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { WelcomeDataResponse } from '@/app/api/v2/types/api';

const QUERY_KEYS = {
  welcome: ['chat', 'welcome'] as const,
};

export function useChatWelcome(initialData?: WelcomeDataResponse) {
  return useQuery<WelcomeDataResponse>({
    queryKey: QUERY_KEYS.welcome,
    queryFn: () => apiClient.chat.welcome.get(),
    initialData,
    staleTime: 60 * 1000, // Fresh for 60 seconds
  });
}
