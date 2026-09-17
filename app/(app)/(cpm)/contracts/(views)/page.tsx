import { getContractsList, filterExcludeInvoices } from '@/lib/v2';
import ContractsTable from '@/components/contracts/ContractsTable';
import { getAbilityForCurrentUser } from '@/data/user-permissions';
import { CONTRACTS_ALL_COLUMNS } from '@/components/contracts/listViewDefaults';
import { getUserMetadata } from '@/data/users';
import { fetchVerifiedEventsForContracts } from '@/data/superuser/contractReplacementResolution';
import { logAlert } from '@/utils/logging/alert';
import { timed } from '@/utils/logging/timed';

export default async function AllContractsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<{
    query?: string;
    page?: string;
    size?: string;
    sort?: string;
    order?: string;
    tag?: string;
    renewal?: string;
    tags?: string;
    group?: string;
  }>;
}) {
  const searchParams = searchParamsPromise
    ? await searchParamsPromise
    : undefined;
  const [{ contracts, relationships }, ability] = await Promise.all([
    timed('contracts.getContractsList', getContractsList),
    timed('contracts.getAbilityForCurrentUser', getAbilityForCurrentUser),
  ]);

  // Invoices are shown only in the Invoices sub-view (plus Pending/Archived),
  // not in the "All Contracts" list.
  const visibleContracts = filterExcludeInvoices(contracts);

  const canManageContractsOrFolders =
    ability?.can('share', 'Contract') ||
    ability?.can('manage', 'Folder') ||
    false;

  const columns = canManageContractsOrFolders
    ? ['select', ...CONTRACTS_ALL_COLUMNS]
    : [...CONTRACTS_ALL_COLUMNS];

  const userMetadata = await timed(
    'contracts.getUserMetadata',
    getUserMetadata,
  );
  const replacementFlaggedContractIds = userMetadata
    ? await timed('contracts.fetchVerifiedEventsForContracts', () =>
        fetchVerifiedEventsForContracts({
          organizationId: userMetadata.organizationId,
          contractIds: visibleContracts.map((contract) => contract.id),
        }),
      )
        .then((events) => events.map((event) => event.old_contract_id))
        .catch((error): number[] => {
          logAlert(
            'contract-replacement-fetch-failure',
            error,
            { organizationId: userMetadata.organizationId },
            'Failed to fetch verified contract replacement events',
          );
          return [];
        })
    : [];

  return (
    <ContractsTable
      contracts={visibleContracts}
      replacementFlaggedContractIds={replacementFlaggedContractIds}
      columns={columns}
      groupByVendor={true}
      defaultSortColumn={searchParams?.sort || 'termEndDate'}
      defaultSortDirection={(searchParams?.order as 'asc' | 'desc') || 'asc'}
      actionType={['folder', 'share', 'export']}
      foldersView={true}
      layoutKey="contracts.all"
      nestByLineage
      relationships={relationships}
    />
  );
}
