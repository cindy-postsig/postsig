'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { ReportData, ReportSummary } from '@/lib/v2/reports/service';

export const REPORT_QUERY_KEYS = {
  report: (type: string) => ['reports', type] as const,
  summary: (type: string) => ['reports', type, 'summary'] as const,
};

export interface ReportDataOptions {
  activeTab?: string;
}

export function useReportData(
  reportType: string,
  options?: ReportDataOptions,
  initialData?: ReportData,
) {
  return useQuery<ReportData>({
    queryKey: REPORT_QUERY_KEYS.report(reportType),
    queryFn: () => apiClient.reports.get(reportType, options),
    initialData,
    staleTime: 60 * 1000,
  });
}

export function useReportSummary(
  reportType: string,
  initialData?: ReportSummary,
) {
  return useQuery<ReportSummary>({
    queryKey: REPORT_QUERY_KEYS.summary(reportType),
    queryFn: () => apiClient.reports.getSummary(reportType),
    initialData,
    staleTime: 60 * 1000,
  });
}
