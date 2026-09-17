import { getArchivedContracts } from '@/lib/v2/contracts/service';
import ContractsTable from '@/components/contracts/ContractsTable';
import { CONTRACTS_ARCHIVED_COLUMNS } from '@/components/contracts/listViewDefaults';

export default async function ArchivedContractsPage({
  searchParams: searchParamsPromise,
}: {
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
  const searchParams = searchParamsPromise
    ? await searchParamsPromise
    : undefined;
  // Archived invoices live in the Invoices module's own Archived Invoices
  // folder — never here, matching every other Contracts list view.
  const { contracts } = await getArchivedContracts({ excludeInvoices: true });

  const columns = CONTRACTS_ARCHIVED_COLUMNS;

  return (
    <ContractsTable
      contracts={contracts}
      columns={columns}
      groupByVendor={true}
      defaultSortColumn={searchParams?.sort || 'termEndDate'}
      defaultSortDirection={(searchParams?.order as 'asc' | 'desc') || 'asc'}
      actionType="export"
      foldersView={true}
      layoutKey="contracts.archived"
    />
  );
}
