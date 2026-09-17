import InvoicesListPage from './InvoicesListPage';
import {
  getInvoiceContracts,
  INVOICE_FOLDERS,
  type InvoiceFolder,
} from '@/lib/v2/invoices/service';

function isInvoiceFolder(value: string | undefined): value is InvoiceFolder {
  return INVOICE_FOLDERS.includes(value as InvoiceFolder);
}

function resolveFolder(value: string | undefined): InvoiceFolder {
  return isInvoiceFolder(value) ? value : 'all';
}

export default async function InvoicesPage({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<{ folder?: string }>;
}) {
  const searchParams = searchParamsPromise
    ? await searchParamsPromise
    : undefined;
  const folder = resolveFolder(searchParams?.folder);
  const contracts = await getInvoiceContracts(folder);

  return <InvoicesListPage contracts={contracts} activeFolder={folder} />;
}
