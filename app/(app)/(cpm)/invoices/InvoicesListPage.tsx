import type { EnrichedContract } from '@/lib/v2/contracts/service';
import { InvoicesDashboard } from '@/components/invoices/InvoicesDashboard';
import { getEffectiveBaseCurrency, getUserMetadata } from '@/data/users';
import {
  getAllInvoiceValidations,
  getArchivedInvoiceValidations,
  getInvoiceContracts,
  shouldShowInvoiceStatusFilter,
  toInvoiceRows,
  type InvoiceFolder,
} from '@/lib/v2/invoices/service';

export default async function InvoicesListPage({
  contracts,
  activeFolder,
}: {
  contracts: EnrichedContract[];
  activeFolder: InvoiceFolder;
}) {
  // getAllInvoiceValidations() covers active invoices — always fetched, since
  // `allContracts` (below) is always the active set and the stat tiles need
  // its real validation data (Potential Discrepancies). The archived folder
  // additionally needs its own validations map for `rows` (archived invoices
  // are a disjoint id set from the active map), fetched alongside everything
  // else rather than after it so the archived folder isn't left waiting on
  // its own extra round trip.
  const [archivedValidations, activeValidations, user, currency, allContracts] =
    await Promise.all([
      activeFolder === 'archived'
        ? getArchivedInvoiceValidations()
        : Promise.resolve(null),
      getAllInvoiceValidations(),
      getUserMetadata(),
      getEffectiveBaseCurrency(),
      // Folder-independent, for the Vendor/Tags/Sponsor/Group dropdown
      // options and the stat tiles (date-filtered, cross-folder) —
      // getAllInvoicesWithFolders() is request-cached, so this is free when
      // activeFolder is already 'all'.
      getInvoiceContracts('all'),
    ]);
  const validations = archivedValidations ?? activeValidations;
  const rows = toInvoiceRows(contracts, validations);
  const optionRows = toInvoiceRows(allContracts, activeValidations);
  const showStatusFilter = shouldShowInvoiceStatusFilter(activeFolder);
  // Same fiscal-year-aware date presets as the Invoice Cost Allocation report.
  const fiscalConfig = { startMonth: user?.organizationFY || 1 };

  return (
    <>
      <h1 className="font-light mb-8 font-serif text-4xl leading-none">
        Invoice Management
      </h1>
      {/* Not keyed on the folder: the table's filter/sort state (vendor,
          date range, status, etc.) is meant to carry over when switching
          folder tabs, not reset — a key here would force a remount instead. */}
      <InvoicesDashboard
        rows={rows}
        optionRows={optionRows}
        activeFolder={activeFolder}
        showStatusFilter={showStatusFilter}
        fiscalConfig={fiscalConfig}
        dateFormat={user?.dateFormat}
        currency={currency}
      />
    </>
  );
}
