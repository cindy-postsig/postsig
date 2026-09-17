'use server';

import { fetchVendorAndContractUsage } from '@/data/superuser/vendors';
import { getVentureDocumentSummary } from '@/lib/v2';
import { getInvPortfolioCompanies } from '@/lib/v2/inv';
import { getUserMetadata } from '@/data/users';
import { checkAbility } from '@/data/user-permissions';
import type { AppModule } from '@/lib/settings/config';
import logger from '@/utils/pino';

export interface StatItem {
  key: string;
  label: string;
  value: number;
  tooltip?: string;
}

export async function getModuleStats(module: AppModule): Promise<StatItem[]> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) return [];

  // Organization-wide totals count contracts and vendors the caller cannot
  // open, so they are limited to the accounts that administer the organization.
  if (!(await checkAbility('manage', 'Organization'))) return [];

  try {
    if (module === 'investor') {
      const [{ companies }, { summary }] = await Promise.all([
        getInvPortfolioCompanies(),
        getVentureDocumentSummary(),
      ]);
      return [
        {
          key: 'companies',
          label: 'Total Portfolio Companies',
          value: companies.length,
        },
        {
          key: 'documents',
          label: 'Total Documents',
          value: summary.documentCount,
        },
      ];
    }

    const usage = await fetchVendorAndContractUsage(userMetadata);
    return [
      {
        key: 'vendors',
        label: 'Total Vendors',
        value: usage.vendorCount,
      },
      {
        key: 'contracts',
        label: 'Total Contracts',
        value: usage.contractCount,
        tooltip:
          'Total number of successfully processed contracts, including archived contracts.',
      },
    ];
  } catch (error) {
    logger.error(
      { error, module, organizationId: userMetadata.organizationId },
      'Error fetching module stats',
    );
    return [];
  }
}
