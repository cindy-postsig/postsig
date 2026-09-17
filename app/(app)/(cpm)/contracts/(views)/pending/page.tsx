import { getPendingContracts } from '@/lib/v2/contracts/service';
import ContractsTable from '@/components/contracts/ContractsTable';
import { CONTRACTS_PENDING_COLUMNS } from '@/components/contracts/listViewDefaults';

export default async function PendingContractsPage({
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
  // NOTE: unlike Archived, the Invoices module doesn't surface pending
  // (unconfirmed/status_id != 4) invoices anywhere today — getInvoiceContracts
  // fetches only published invoices. A pending invoice is invisible everywhere
  // until confirmed, not just de-duplicated. Excluding anyway per explicit
  // instruction: Contracts views never show invoices, full stop.
  const { contracts } = await getPendingContracts({ excludeInvoices: true });

  const columns = CONTRACTS_PENDING_COLUMNS;

  return (
    <ContractsTable
      contracts={contracts}
      columns={columns}
      groupByVendor={true}
      defaultSortColumn={searchParams?.sort || 'termEndDate'}
      defaultSortDirection={(searchParams?.order as 'asc' | 'desc') || 'asc'}
      actionType="none"
      foldersView={true}
      layoutKey="contracts.pending"
    />
  );
}
