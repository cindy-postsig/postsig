'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { AssignmentsPayload } from '@/lib/v2/assignments/types';

// The payload is a whole org's seats and roster; a month's figures only move
// when an import lands, so re-asking within the visit buys nothing.
const STALE_TIME_MS = 5 * 60 * 1000;

/**
 * One month of the Assignments payload. The server-rendered month is seeded as
 * `initialData` so the first paint never refetches what it already shipped, and
 * a step keeps the month on screen until its replacement arrives.
 */
export function useAssignmentsPayload(
  month: string,
  initialPayload: AssignmentsPayload,
) {
  return useQuery({
    queryKey: ['assignments', month],
    queryFn: async () => (await apiClient.assignments.payload(month)).payload,
    initialData:
      month === initialPayload.window.month ? initialPayload : undefined,
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME_MS,
  });
}
