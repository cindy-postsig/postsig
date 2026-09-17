'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type { InvPortfolioCompanyResult } from '@/lib/v2/inv/service';
import type { PortfolioCompany } from '@/app/(app)/(investor)/investor/types';

export const INV_PORTFOLIO_COMPANY_QUERY_KEYS = {
  company: (publicId: string) => ['inv-portfolio-company', publicId] as const,
};

export function useInvPortfolioCompany(
  publicId: string,
  initialData?: PortfolioCompany,
) {
  return useQuery<InvPortfolioCompanyResult>({
    queryKey: INV_PORTFOLIO_COMPANY_QUERY_KEYS.company(publicId),
    queryFn: () => apiClient.inv.get(publicId),
    // Server-passed company carries no override lineage; the refetch fills it.
    initialData: initialData
      ? {
          company: initialData,
          overrides: {
            companyDetails: {},
            valuation: { fields: {}, recomputed: [] },
            transactions: {},
            latestSnapshotId: null,
            investorStatus: {
              informationRightsId: null,
              roundTermsId: null,
              createTarget: null,
              values: {
                isMajorInvestor: false,
                infoRightsForMajor: false,
                infoRightsForAll: false,
                proRataRightsMajor: false,
                proRataRightsAll: false,
              },
              overridden: {},
            },
            legalTerms: {
              roundTermsId: null,
              informationRightsId: null,
              securityTermsId: null,
              values: {
                antiDilutionType: null,
                liquidationSeniority: null,
                dividendRate: null,
                dividendSeniority: null,
              },
              overridden: {
                roundTerms: {},
                informationRights: {},
                securityTerms: {},
              },
            },
          },
        }
      : undefined,
    // Mark the seeded placeholder as already stale so override lineage is
    // refetched immediately; real data fetched later still honours staleTime.
    initialDataUpdatedAt: 0,
    staleTime: 60 * 1000, // Consider data fresh for 60 seconds
    enabled: !!publicId,
  });
}
