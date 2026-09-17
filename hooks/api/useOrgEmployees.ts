'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getOrgEmployees } from '@/data/superuser/org-employees';
import type { OrgEmployee } from '@/constants/types';

export const QUERY_KEYS = {
  orgEmployees: (organizationId: string) =>
    ['org-employees', organizationId] as const,
};

export function useOrgEmployees(
  organizationId: string,
  initialData?: OrgEmployee[],
) {
  return useQuery<OrgEmployee[]>({
    queryKey: QUERY_KEYS.orgEmployees(organizationId),
    queryFn: () => getOrgEmployees(organizationId),
    enabled: !!organizationId,
    initialData,
    staleTime: 60 * 1000,
  });
}

export function useInvalidateOrgEmployees() {
  const queryClient = useQueryClient();
  return (organizationId: string) =>
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.orgEmployees(organizationId),
    });
}
