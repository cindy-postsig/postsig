import { fetchContractIdsByFolder } from '@/app/lib/contracts/actions';
import { getContractsList } from '@/lib/v2/contracts/service';
import { filterExcludeInvoices } from '@/lib/v2';
import ContractsTable from '@/components/contracts/ContractsTable';
import { CONTRACTS_FOLDER_COLUMNS } from '@/components/contracts/listViewDefaults';
import { EmptyFolderView } from '@/components/contracts/EmptyFolderView';
import { getAllFolders } from '@/data/superuser/folders';
import { ShareButton } from './ShareButton';
import { notFound } from 'next/navigation';
import { timed } from '@/utils/logging/timed';

export default async function FolderPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    query?: string;
    page?: string;
    sort?: string;
    order?: string;
    tag?: string;
    renewal?: string;
    tags?: string;
  }>;
}) {
  const params = await paramsPromise;
  const searchParams = searchParamsPromise
    ? await searchParamsPromise
    : undefined;
  const folders = await timed('folder.getAllFolders', getAllFolders);
  const currentFolder = folders.find((f) => f.public_uuid === params.id);

  if (!currentFolder) {
    notFound();
  }

  const [contractIdsInFolder, { contracts: allContracts }] = await Promise.all([
    timed('folder.fetchContractIdsByFolder', () =>
      fetchContractIdsByFolder(params.id),
    ),
    timed('folder.getContractsList', getContractsList),
  ]);

  const contracts =
    contractIdsInFolder.length === 0
      ? []
      : filterExcludeInvoices(
          allContracts.filter((contract) =>
            contractIdsInFolder.includes(contract.id),
          ),
        );

  const columns = CONTRACTS_FOLDER_COLUMNS;

  if (contracts.length === 0) {
    return (
      <>
        {currentFolder && (
          <ShareButton
            folderId={currentFolder.id}
            folderPublicUuid={params.id}
            folderName={currentFolder.name}
            folderOwnerId={currentFolder.user_id}
          />
        )}
        <EmptyFolderView folderId={params.id} />
      </>
    );
  }

  return (
    <>
      {currentFolder && (
        <ShareButton
          folderId={currentFolder.id}
          folderPublicUuid={params.id}
          folderName={currentFolder.name}
          folderOwnerId={currentFolder.user_id}
        />
      )}
      <ContractsTable
        contracts={contracts}
        columns={columns}
        groupByVendor={true}
        defaultSortColumn={searchParams?.sort || 'termEndDate'}
        defaultSortDirection={(searchParams?.order as 'asc' | 'desc') || 'asc'}
        actionType={['export', 'share']}
        foldersView={true}
        layoutKey="contracts.folder"
      />
    </>
  );
}
