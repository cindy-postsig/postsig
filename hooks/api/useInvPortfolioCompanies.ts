'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { InvPortfolioCompaniesResult } from '@/lib/v2/inv/service';
import type { PortfolioCompany } from '@/app/(app)/(investor)/investor/types';

export const INV_PORTFOLIO_COMPANIES_QUERY_KEYS = {
  companies: ['inv-portfolio-companies'] as const,
};

export function useInvPortfolioCompanies(initialData?: PortfolioCompany[]) {
  return useQuery<InvPortfolioCompaniesResult>({
    queryKey: INV_PORTFOLIO_COMPANIES_QUERY_KEYS.companies,
    queryFn: () => apiClient.inv.list(),
    // Server-passed companies carry no override lineage; the refetch fills it.
    initialData: initialData
      ? { companies: initialData, count: initialData.length, overrides: {} }
      : undefined,
    // Mark the seeded placeholder as already stale so override lineage is
    // refetched immediately; real data fetched later still honours staleTime.
    initialDataUpdatedAt: 0,
    staleTime: 60 * 1000, // Consider data fresh for 60 seconds
  });
}
