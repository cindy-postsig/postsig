'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type {
  ModuleArchivesResult,
  ModuleArchiveRow,
} from '@/app/api/v2/types/api';

export const MODULE_ARCHIVES_QUERY_KEYS = {
  list: (moduleCode: string) => ['moduleArchives', moduleCode] as const,
};

interface UseModuleArchivesOptions {
  refetchInterval?: number | false;
}

export function useModuleArchives(
  moduleCode: string,
  initialData?: ModuleArchiveRow[],
  options?: UseModuleArchivesOptions,
) {
  return useQuery<ModuleArchivesResult>({
    queryKey: MODULE_ARCHIVES_QUERY_KEYS.list(moduleCode),
    queryFn: () => apiClient.archives.list(moduleCode),
    initialData: initialData ? { archives: initialData } : undefined,
    staleTime: 30 * 1000,
    refetchInterval: options?.refetchInterval,
  });
}
