'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { ChatMessagesResult } from '@/app/api/v2/types/api';

const QUERY_KEYS = {
  messages: (sessionId: number) => ['chat', 'messages', sessionId] as const,
};

export function useChatMessages(
  sessionId: number | null,
  initialData?: ChatMessagesResult,
) {
  return useQuery<ChatMessagesResult>({
    queryKey: QUERY_KEYS.messages(sessionId ?? 0),
    queryFn: () => apiClient.chat.messages.list(sessionId!),
    initialData,
    enabled: sessionId !== null,
    staleTime: 30 * 1000,
  });
}
