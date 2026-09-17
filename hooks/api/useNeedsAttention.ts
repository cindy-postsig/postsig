'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { ReportSummary } from '@/lib/v2/reports/service';

const NEEDS_ATTENTION_REPORTS = [
  'unconfirmed',
  'contract-omissions',
  'dora',
  'unexecuted',
] as const;

export type NeedsAttentionData = Record<string, ReportSummary>;

export function useNeedsAttention(initialData?: NeedsAttentionData) {
  return useQuery<NeedsAttentionData>({
    queryKey: ['needs-attention'],
    queryFn: () => apiClient.reports.getSummaries([...NEEDS_ATTENTION_REPORTS]),
    initialData,
    staleTime: 60 * 1000,
  });
}
