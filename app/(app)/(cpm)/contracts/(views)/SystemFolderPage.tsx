import { getContractsList } from '@/lib/v2/contracts/service';
import ContractsTable from '@/components/contracts/ContractsTable';
import {
  getSystemFolderByTypeId,
  folderTypeIds,
  DEFAULT_COLUMNS,
} from './systemFolderConfig';
import type { FilterType } from '@/components/contracts/ContractsTableClient';
import type { ColumnLayoutViewKey } from '@/components/contracts/columnLayout';

const SYSTEM_FOLDER_LAYOUT_KEYS: Record<
  string,
  ColumnLayoutViewKey | undefined
> = {
  invoices: 'contracts.invoices',
  trials: 'contracts.trials',
  ndas: 'contracts.ndas',
};
import { resolveDefaultInvoiceStatus } from '@/constants/invoiceStatus';

interface SystemFolderPageProps {
  typeId: number;
  searchParams?: {
    query?: string;
    page?: string;
    size?: string;
    sort?: string;
    order?: string;
    tag?: string;
    renewal?: string;
    tags?: string;
  };
}

export default async function SystemFolderPage({
  typeId,
  searchParams,
}: SystemFolderPageProps) {
  const folderConfig = getSystemFolderByTypeId(typeId);
  const { contracts: allContracts } = await getContractsList();
  const listedTypeIds = folderConfig ? folderTypeIds(folderConfig) : [typeId];
  const contracts = allContracts.filter((c) =>
    listedTypeIds.includes(c.contract.type_id),
  );
  const columns = folderConfig?.columns || DEFAULT_COLUMNS;

  // Each system folder keeps its own layout: their default column sets differ
  // (Invoices shows Invoice Amount, Trials shows Days Remaining). Mapped
  // explicitly rather than templated from the slug, so a new system folder is
  // a compile error here instead of an unrecognised key written to storage.
  const layoutKey = folderConfig
    ? SYSTEM_FOLDER_LAYOUT_KEYS[folderConfig.slug]
    : undefined;

  // Data-dependent default for the invoiceStatus filter; passed to the client
  // as the nuqs fallback instead of redirecting, so a bare URL renders in one
  // pass (a redirect re-navigates without a loading boundary → blank flash)
  const defaultInvoiceStatus = folderConfig?.filters?.includes('invoiceStatus')
    ? resolveDefaultInvoiceStatus(
        contracts.map((c) => c.contract.invoice_status),
      )
    : undefined;

  const actionType = ['export', 'share', ...(folderConfig?.filters || [])];

  return (
    <ContractsTable
      contracts={contracts}
      columns={columns}
      groupByVendor={true}
      defaultSortColumn={searchParams?.sort || 'termEndDate'}
      defaultSortDirection={(searchParams?.order as 'asc' | 'desc') || 'asc'}
      actionType={actionType}
      reportType={folderConfig?.reportType}
      foldersView={true}
      filters={folderConfig?.filters as FilterType[]}
      layoutKey={layoutKey}
      defaultInvoiceStatus={defaultInvoiceStatus}
    />
  );
}
