'use client';

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { ChatSessionsResult } from '@/app/api/v2/types/api';

const QUERY_KEYS = {
  sessions: ['chat', 'sessions'] as const,
};

export function useChatSessions(initialData?: ChatSessionsResult) {
  return useQuery<ChatSessionsResult>({
    queryKey: QUERY_KEYS.sessions,
    queryFn: () => apiClient.chat.sessions.list(),
    initialData,
    staleTime: 30 * 1000,
  });
}

export function useInvalidateChatSessions() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessions }),
    [queryClient],
  );
}

export function useCreateChatSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (title?: string) => apiClient.chat.sessions.create(title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessions });
    },
  });
}

export function useUpdateChatSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, title }: { sessionId: number; title: string }) =>
      apiClient.chat.sessions.update(sessionId, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessions });
    },
  });
}

export function useDeleteChatSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: number) =>
      apiClient.chat.sessions.delete(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessions });
    },
  });
}
