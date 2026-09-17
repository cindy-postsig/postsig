'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { CalendarResult } from '@/lib/v2/calendar/service';
import type { ContractWithPricing } from '@/lib/v2/core/types';

export const CALENDAR_QUERY_KEYS = {
  calendar: (range?: { start: string; end: string }) =>
    ['calendar', range] as const,
};

export function useCalendar(
  range?: { start: string; end: string },
  initialData?: ContractWithPricing[],
) {
  return useQuery<CalendarResult>({
    queryKey: CALENDAR_QUERY_KEYS.calendar(range),
    queryFn: () => apiClient.calendar.list(range),
    initialData: initialData
      ? {
          events: initialData,
          count: initialData.length,
          fiscalYearStartMonth: 1, // Will be overwritten by actual fetch
        }
      : undefined,
    staleTime: 60 * 1000,
  });
}
