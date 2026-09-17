import { ReactNode } from 'react';
import { Suspense } from 'react';
import Loading from '@/components/Loading';
import ContractsSidebar from './ContractsSidebar';
import FolderHeader from './FolderHeader';
import { getUserMetadata } from '@/data/users';
import { getAllFolders } from '@/data/superuser/folders';
import { fetchContractsWithFiltering } from '@/app/lib/contracts/actions';
import { filterExcludeInvoices } from '@/lib/v2';
import { FolderProvider } from './FolderContext';

export default async function ContractsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const userMetadata = await getUserMetadata();
  const organizationId = userMetadata?.organizationId || '';
  const userId = userMetadata?.userId || '';

  // Fetch all folders and contracts in parallel
  const [folders, contracts] = await Promise.all([
    getAllFolders(),
    fetchContractsWithFiltering({
      contractStatus: 4,
      hideFailed: true,
    }),
  ]);

  // Calculate contract counts for sidebar. The "All Contracts" total excludes
  // invoices to match the All Contracts view — Contracts never shows them.
  const contractCounts = {
    trials: contracts.filter((c: any) => c.type_id === 7).length,
    ndas: contracts.filter((c: any) => c.type_id === 8).length,
    total: filterExcludeInvoices(contracts).length,
  };

  // Create folder name map
  const folderNameMap = folders.reduce(
    (acc, folder) => {
      acc[folder.id] = folder.name;
      return acc;
    },
    {} as Record<number, string>,
  );

  return (
    <FolderProvider
      folderNameMap={folderNameMap}
      folders={folders}
      organizationId={organizationId}
      userId={userId}
    >
      <div className="min-h-[calc(100vh-3.5rem)]">
        <div className="flex">
          <ContractsSidebar
            organizationId={organizationId}
            userId={userId}
            initialFolders={folders}
            contractCounts={contractCounts}
          />

          <div className="min-w-0 flex-1">
            <FolderHeader />
            <div className="px-6">
              <Suspense
                fallback={
                  <div className="flex w-full items-center justify-center p-12">
                    <Loading />
                  </div>
                }
              >
                {children}
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </FolderProvider>
  );
}
