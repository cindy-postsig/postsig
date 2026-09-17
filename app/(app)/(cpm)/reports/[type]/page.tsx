import {
  reportConfigs,
  defaultReportFilters,
} from '@/app/(app)/(cpm)/reports/reportConfigs';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ContractsTableClient } from '@/components/contracts/ContractsTableClient';
import Loading from '@/components/Loading';
import { getUserMetadata } from '@/data/users';
import dynamic from 'next/dynamic';
import { formatCurrency } from '@/app/lib/utils';
import { getOrganizationMissingClauseSettings } from '@/app/lib/contracts/actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileTextIcon } from '@radix-ui/react-icons';
import { Database } from '@/database.types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { getAbilityForCurrentUser } from '@/data/user-permissions';
import { getReportData, TrialReportRow } from '@/lib/v2/reports/service';
import { DoraReportMetadata } from '@/lib/v2/reports/definitions/dora';
import { hasInvoicesAccess } from '@/lib/v2/invoices/access';
import { timed } from '@/utils/logging/timed';
import {
  getInvoiceValidations,
  type InvoiceValidation,
} from '@/lib/v2/invoices/validation';
import { InvoiceReportTableWithSheet } from '@/components/invoices/InvoiceReportTableWithSheet';

type VendorsExtended = Database['public']['Tables']['vendors']['Row'] & {
  ict_provider?: boolean;
};

const ExportReportCSVButton = dynamic(
  () => import('@/components/contracts/ExportReportCSVButton'),
);

const DoraReportTabs = dynamic(() =>
  import('@/components/contracts/DoraReportTabs').then(
    (mod) => mod.DoraReportTabs,
  ),
);

const ClientSideMissingClausesSettings = dynamic(
  () => import('@/components/settings/MissingClausesSettings'),
  {
    loading: () => <div className="p-4 text-center"></div>,
  },
);

const MissingClausesDialog = dynamic(
  () => import('@/components/settings/MissingClausesDialog'),
  {
    loading: () => <div className="p-4 text-center"></div>,
  },
);

export default async function ReportPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ type: string }>;
  searchParams?: Promise<{
    query?: string;
    page?: string;
    tab?: string;
    sort?: string;
    order?: string;
    tag?: string;
    renewal?: string;
    tags?: string;
  }>;
}) {
  const { type } = await paramsPromise;
  const searchParams = searchParamsPromise
    ? await searchParamsPromise
    : undefined;
  const activeTab = searchParams?.tab || 'ict';
  const reportConfig = reportConfigs[type as keyof typeof reportConfigs];
  if (!reportConfig) {
    notFound();
  }
  if (
    type === 'invoices' &&
    !(await timed('reports.hasInvoicesAccess', hasInvoicesAccess))
  ) {
    notFound();
  }
  const noun = reportConfig.noun ?? {
    singular: 'contract',
    plural: 'contracts',
  };
  const columns =
    type === 'dora' && searchParams?.tab === 'other'
      ? reportConfig.columns.filter((col) => col !== 'doraScore')
      : reportConfig.columns;

  const user = await timed('reports.getUserMetadata', getUserMetadata);
  if (!user) {
    return null;
  }
  const currentPage = Number(searchParams?.page) || 1;

  // Fetch report data using v2 pipeline
  const reportData = await timed(`reports.getReportData.${type}`, () =>
    getReportData(type, {
      activeTab,
      valueField: reportConfig.valueField,
    }),
  );

  // Map contracts for UI needs (counts, export)
  const filteredContracts = reportData.contracts.map((c) => ({
    id: c.id,
    vendors: c.contract.vendors,
    type_id: c.contract.type_id,
  }));
  const filteredTotalValueInUSD = reportData.totalValueInUSD;
  const tableData = reportData.rows;

  // Invoice Discrepancies opens a detail sheet on row click — keyed by
  // contract id (a plain object, not a Map, since it crosses the
  // server/client boundary as a prop). Only computed for the rows the report
  // actually flagged (tableData), not every invoice in range: validation
  // does real per-contract FX/DB work, and only a flagged row can ever be
  // clicked here.
  let invoiceValidationsById: Record<number, InvoiceValidation> = {};
  if (type === 'invoices') {
    const flaggedIds = new Set(tableData.map((row) => Number(row.id)));
    const flaggedContracts = reportData.contracts.filter((c) =>
      flaggedIds.has(c.id),
    );
    const validations = await timed('reports.getInvoiceValidations', () =>
      getInvoiceValidations(flaggedContracts),
    );
    invoiceValidationsById = Object.fromEntries(validations);
  }

  // DORA-specific metadata
  let contracts: { id: number; vendors: VendorsExtended | null | undefined }[] =
    filteredContracts;
  let allVendorsIctProviderNull = false;
  let hasIctProviders = false;

  if (type === 'dora' && reportData.metadata) {
    const doraMetadata = reportData.metadata as unknown as DoraReportMetadata;
    contracts = (doraMetadata.allContracts || []).map((c) => ({
      id: c.id,
      vendors: c.contract.vendors,
    }));
    allVendorsIctProviderNull = doraMetadata.allVendorsIctProviderNull || false;
    hasIctProviders = doraMetadata.hasIctProviders || false;
  }

  // For missing clauses report, check if organization has configured any clause settings
  let missingClausesSettingsConfigured = false;
  if (type === 'contract-omissions') {
    const { settings, isConfirmed } = await timed(
      'reports.getOrganizationMissingClauseSettings',
      () => getOrganizationMissingClauseSettings(user.organizationId),
    );
    missingClausesSettingsConfigured = isConfirmed && settings.length > 0;
  }

  // For trial report, calculate max days remaining for custom value display
  let maxDaysRemaining = 0;
  if (type === 'trial' && filteredContracts.length > 0) {
    const daysRemainingValues = (tableData as TrialReportRow[])
      .map((row) => row.daysRemaining || 0)
      .filter((days) => days > 0);

    maxDaysRemaining =
      daysRemainingValues.length > 0 ? Math.max(...daysRemainingValues) : 0;
  }

  // Check permissions for updating application settings
  const ability = await timed(
    'reports.getAbilityForCurrentUser',
    getAbilityForCurrentUser,
  );
  const canUpdateApplication = ability?.can('update', 'Application') ?? false;
  const canUpdateVendors = ability?.can('update', 'Vendor') ?? false;
  const canUpdateContract = ability?.can('update', 'Contract') ?? false;

  let actionType: string | string[] | undefined;
  if (type === 'dora') {
    if (!canUpdateVendors) {
      actionType = 'none';
    } else if (activeTab === 'ict') {
      actionType = allVendorsIctProviderNull ? 'confirmIct' : 'notIct';
    } else if (activeTab === 'other') {
      actionType = 'addIct';
    }
  } else if (type === 'unconfirmed') {
    const actions = [];
    if (canUpdateContract) {
      actions.unshift('bulkEdit');
    }
    actionType = actions;
  }

  return (
    <>
      <div className="absolute right-0 top-0 flex gap-3">
        {type === 'contract-omissions' && missingClausesSettingsConfigured && (
          <div className="text-right">
            <MissingClausesDialog
              user={user}
              buttonText="Settings"
              buttonSize="default"
              buttonVariant="outline"
              disabled={!canUpdateApplication}
            />
          </div>
        )}
        <ExportReportCSVButton
          label="Export"
          reportTitle={reportConfig.title}
          reportType={type}
          contractIds={filteredContracts.map((contract) => contract.id)}
          disabled={filteredContracts.length === 0}
        />
      </div>
      <div className="mb-10">
        <div className="font-sans text-foreground/70">
          {tableData.length > 0 && type === 'leavers' ? (
            (() => {
              const licenses = filteredTotalValueInUSD || 0;
              const productCount =
                (reportData.metadata?.productCount as number | undefined) ?? 0;
              return (
                <>
                  {licenses} {licenses === 1 ? 'license' : 'licenses'} across{' '}
                  {productCount} {productCount === 1 ? 'product' : 'products'}{' '}
                  {licenses === 1 ? 'is' : 'are'} available for reassignment
                </>
              );
            })()
          ) : tableData.length > 0 ? (
            <>
              {tableData.length}{' '}
              {tableData.length === 1 ? noun.singular : noun.plural}{' '}
              {reportConfig.customValueDisplay && type === 'trial' ? (
                <>
                  ending within {maxDaysRemaining}{' '}
                  {maxDaysRemaining === 1 ? 'day' : 'days'}
                </>
              ) : reportConfig.valueLabel && reportConfig.valueField ? (
                <>
                  {reportConfig.valueLabel}{' '}
                  {formatCurrency(
                    filteredTotalValueInUSD || 0,
                    user.baseCurrency,
                  )}
                </>
              ) : null}
              {type === 'nda' && (
                <>
                  {' '}
                  &middot;{' '}
                  <Dialog>
                    <DialogTrigger asChild>
                      <button className="text-psblue underline-offset-2 hover:underline">
                        About NDA Insights
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-5xl">
                      <DialogHeader>
                        <DialogTitle>NDA Risk Level Insights</DialogTitle>
                        <DialogDescription className="text-left">
                          Understanding potential risks in your non-disclosure
                          agreements.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="mt-6">
                        <h4 className="font-bold mb-4 font-label text-xs uppercase tracking-wide">
                          Risk Factors Analyzed
                        </h4>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div className="rounded-lg border p-4">
                            <h5 className="font-medium mb-2 text-sm">
                              Perpetual NDA
                            </h5>
                            <p className="text-sm text-muted-foreground">
                              NDA that is ongoing with no end of term date
                              specified.
                            </p>
                          </div>
                          <div className="rounded-lg border p-4">
                            <h5 className="font-medium mb-2 text-sm">
                              Unilateral NDA
                            </h5>
                            <p className="text-sm text-muted-foreground">
                              NDA that will obligate ONLY the signing party to
                              confidentiality.
                            </p>
                          </div>
                          <div className="rounded-lg border p-4">
                            <h5 className="font-medium mb-2 text-sm">
                              Non-Solicitation
                            </h5>
                            <p className="text-sm text-muted-foreground">
                              NDA that obligates one or both parties not to hire
                              or attempt to hire an employee of the
                              counterparty.
                            </p>
                          </div>
                          <div className="rounded-lg border p-4">
                            <h5 className="font-medium mb-2 text-sm">
                              Uncapped Liability
                            </h5>
                            <p className="text-sm text-muted-foreground">
                              NDA that has no upward limit on monetary damages
                              or other liabilities that can be incurred by one
                              or both parties.
                            </p>
                          </div>
                          <div className="rounded-lg border p-4">
                            <h5 className="font-medium mb-2 text-sm">
                              Post End of Term Obligations
                            </h5>
                            <p className="text-sm text-muted-foreground">
                              NDA that has a term beyond the end of term that
                              obliges continued confidentiality to one or both
                              parties.
                            </p>
                          </div>
                          <div className="rounded-lg border p-4">
                            <h5 className="font-medium mb-2 text-sm">
                              Foreign Jurisdiction
                            </h5>
                            <p className="text-sm text-muted-foreground">
                              NDA that stipulates any controversies arising will
                              be adjudicated outside of the United States.
                            </p>
                          </div>
                          <div className="rounded-lg border p-4">
                            <h5 className="font-medium mb-2 text-sm">
                              No Carve Out Provisions
                            </h5>
                            <p className="text-sm text-muted-foreground">
                              NDA that fails to stipulate what doesn&apos;t
                              constitute confidential information (i.e. publicly
                              known information, compelled disclosure by
                              courts).
                            </p>
                          </div>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </>
          ) : (
            <span className="italic opacity-70">
              No {noun.plural} for this report
            </span>
          )}
        </div>
      </div>

      {/* Show settings component for missing clauses report when not configured */}
      {type === 'contract-omissions' && !missingClausesSettingsConfigured && (
        <div className="mb-8">
          <div className="rounded-md border border-gray-200 bg-gray-700/5 p-6">
            <h3 className="font-medium mb-2 font-sans text-lg">
              Configure Required Clauses
            </h3>
            <p className="mb-10 max-w-3xl text-balance leading-tight text-muted-foreground">
              Please select which contract clauses are important to your
              organization below. This will determine which missing clauses
              appear in this report and elsewhere missing clauses are
              highlighted.
            </p>

            <ClientSideMissingClausesSettings
              user={user}
              showTitle={false}
              refreshRoute="true"
            />
          </div>
        </div>
      )}

      {/* Show ICT provider setup banner for DORA report */}
      {type === 'dora' &&
        allVendorsIctProviderNull &&
        filteredContracts.length > 0 && (
          <Alert className="mb-8 border-blue-200 bg-blue-50 p-5 text-base text-blue-900">
            <AlertTitle>Confirm ICT Vendors</AlertTitle>
            <AlertDescription className="max-w-4xl font-sans-neue text-base">
              DORA regulations apply specifically to ICT (Information and
              Communication Technology) service providers. Select vendors from
              the list below to enable DORA compliance analysis.
            </AlertDescription>
          </Alert>
        )}

      {/* Show tabs if we have DORA report with ICT providers identified */}
      {type === 'dora' && hasIctProviders && (
        <DoraReportTabs
          activeTab={activeTab}
          ictCount={
            new Set(
              contracts
                .filter(
                  (contract) =>
                    contract.vendors && contract.vendors.ict_provider === true,
                )
                .map((contract) => contract.vendors?.id),
            ).size
          }
          otherCount={
            new Set(
              contracts
                .filter(
                  (contract) =>
                    contract.vendors &&
                    (contract.vendors.ict_provider === false ||
                      contract.vendors.ict_provider === null),
                )
                .map((contract) => contract.vendors?.id),
            ).size
          }
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-8">
        <Suspense
          key={`${currentPage}-${activeTab}`}
          fallback={
            <div className="flex w-full items-center justify-center p-12">
              <Loading />
            </div>
          }
        >
          {tableData.length > 0 ? (
            type === 'invoices' ? (
              <InvoiceReportTableWithSheet
                data={tableData}
                columns={columns}
                fillViewport={true}
                includeReportSubRows={true}
                reportType={type}
                actionType={actionType}
                groupByVendor={false}
                userMetadata={user}
                defaultSortColumn={
                  searchParams?.sort || reportConfig.defaultSortColumn
                }
                defaultSortDirection={
                  (searchParams?.order as 'asc' | 'desc') ||
                  reportConfig.defaultSortDirection
                }
                filters={reportConfig.filters || defaultReportFilters}
                invoiceValidationsById={invoiceValidationsById}
              />
            ) : (
              <ContractsTableClient
                data={tableData}
                columns={columns}
                fillViewport={true}
                includeReportSubRows={true}
                reportType={type}
                actionType={actionType}
                groupByVendor={false}
                userMetadata={user}
                defaultSortColumn={
                  searchParams?.sort || reportConfig.defaultSortColumn
                }
                defaultSortDirection={
                  (searchParams?.order as 'asc' | 'desc') ||
                  reportConfig.defaultSortDirection
                }
                filters={reportConfig.filters || defaultReportFilters}
              />
            )
          ) : (
            <div className="mt-6 flex min-h-[240px] flex-1 flex-col items-center justify-center rounded-lg bg-gradient-to-t from-transparent from-0% to-secondary/50 text-center">
              <FileTextIcon className="m-2 h-6 w-6 text-muted-foreground/80" />
              <p className="font-serif italic tracking-wide text-muted-foreground">
                No matching {noun.plural}
              </p>
            </div>
          )}
        </Suspense>
      </div>
    </>
  );
}
