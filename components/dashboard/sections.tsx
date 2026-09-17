import Link from 'next/link';
import {
  getContractsList,
  getOldestContractFiscalYear,
} from '@/lib/v2/contracts/service';
import { buildContractTableRow } from '@/lib/v2/contracts/transforms';
import { getInvoiceValidations } from '@/lib/v2/invoices/validation';
import { resolveWindow } from '@/lib/v2/spend';
import { buildReportFromContracts } from '@/lib/v2/reports/service';
import {
  buildBudgetSummary,
  isActiveContract,
  sumValuesInUSD,
} from '@/lib/v2/core/budget';
import { contractOwners, isSponsoredBy } from '@/lib/v2/owners/embed';
import { aggregateTopVendors } from '@/lib/v2/vendors/transforms';
import { getSidVendorTotals } from '@/lib/v2/vendors/service';
import { isSidVendorInvoice } from '@/lib/v2/bloomberg-sid/spend';
import { getUserMetadata, getEffectiveBaseCurrency } from '@/data/users';
import { getDefaultCostMethod } from '@/lib/settings/default-cost-method';
import { timed } from '@/utils/logging/timed';
import { loadAllocationContextForRequest } from '@/lib/v2/cost-allocation/context';
import { isCostAllocationEnabled } from '@/lib/v2/cost-allocation/flag';
import { summarizeUnallocated } from '@/lib/v2/cost-allocation/unallocated';
import type { NeedsAttentionData } from '@/lib/v2/dashboard/service';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { ReportCard } from '@/components/cards/ReportCard';
import ContractsTable from '@/components/contracts/ContractsTable';
import { DashboardSpendOverview } from '@/components/dashboard/DashboardSpendOverview';
import { SpendQueryHydration } from '@/components/budget/SpendQueryHydration';
import { NeedsAttention } from '@/components/dashboard/NeedsAttention';
import { ReportPreview } from '@/components/dashboard/ReportPreview';
import TopVendorsChart from '@/components/vendors/TopVendorsChart';
import TopVendorsValueLabel from '@/components/vendors/TopVendorsValueLabel';
import VendorIcon from '@/components/vendors/VendorIcon';
import { InvoiceValidationBadge } from '@/components/invoices/InvoicesTable';
import { productNames } from '@/lib/v2/invoices/productNames';
import type { UserMetadata } from '@/constants/types';
import type { InvoicesReportRow } from '@/lib/v2/reports/transforms/invoices';

interface UserSectionProps {
  userMetadata: UserMetadata;
}

interface FullSectionProps {
  userMetadata: UserMetadata;
  fiscalYearStart: number;
  alertRange: number;
}

export async function BudgetSection() {
  const [{ contracts }, userMetadata, oldestFiscalYear] = await Promise.all([
    timed('dashboard.budget.getContractsList', getContractsList),
    timed('dashboard.budget.getUserMetadata', getUserMetadata),
    timed(
      'dashboard.budget.getOldestContractFiscalYear',
      getOldestContractFiscalYear,
    ),
  ]);
  if (!userMetadata) return null;
  const { totalContracts, totalVendors, tcv } = buildBudgetSummary(contracts);
  const defaultCostMethod = await timed(
    'dashboard.budget.getDefaultCostMethod',
    () => getDefaultCostMethod(userMetadata?.organizationId),
  );
  const currentFiscalYear = resolveWindow('currentFY', new Date(), {
    startMonth: userMetadata?.organizationFY || 1,
  }).fyNum;

  return (
    <SpendQueryHydration
      userMetadata={userMetadata}
      method={defaultCostMethod}
      fiscalYear={currentFiscalYear}
      currentFiscalYear={currentFiscalYear}
    >
      <DashboardSpendOverview
        tcv={tcv}
        totalContracts={totalContracts}
        totalVendors={totalVendors}
        defaultMethod={defaultCostMethod}
        currentFiscalYear={currentFiscalYear}
        oldestFiscalYear={oldestFiscalYear}
      />
    </SpendQueryHydration>
  );
}

export async function NeedsAttentionSection() {
  const [{ contracts }, baseCurrency, userMetadata] = await Promise.all([
    getContractsList(),
    getEffectiveBaseCurrency(),
    getUserMetadata(),
  ]);

  // Cost Allocation is a per-org rollout, so the item exists only where the
  // report it links to does.
  const unallocated =
    userMetadata && (await isCostAllocationEnabled(userMetadata))
      ? summarizeUnallocated(
          contracts,
          await loadAllocationContextForRequest(userMetadata.organizationId),
        )
      : undefined;

  const [
    unconfirmedReport,
    contractOmissionsReport,
    doraReport,
    unexecutedReport,
    leaversReport,
  ] = await Promise.all([
    buildReportFromContracts('unconfirmed', contracts),
    buildReportFromContracts('contract-omissions', contracts),
    buildReportFromContracts('dora', contracts),
    buildReportFromContracts('unexecuted', contracts),
    buildReportFromContracts('leavers', contracts),
  ]);

  const needsAttention: NeedsAttentionData = {
    unconfirmed: {
      count: unconfirmedReport.contracts.length,
      totalValueInUSD: unconfirmedReport.totalValueInUSD,
    },
    contractOmissions: {
      count: contractOmissionsReport.contracts.length,
      totalValueInUSD: contractOmissionsReport.totalValueInUSD,
    },
    dora: {
      count: doraReport.contracts.length,
      totalValueInUSD: doraReport.totalValueInUSD,
    },
    unexecuted: {
      count: unexecutedReport.contracts.length,
      totalValueInUSD: unexecutedReport.totalValueInUSD,
    },
    leavers: {
      count: leaversReport.contracts.length,
      totalValueInUSD: leaversReport.totalValueInUSD,
      productCount:
        (leaversReport.metadata?.productCount as number | undefined) ?? 0,
    },
    unallocated,
  };

  return <NeedsAttention data={needsAttention} currency={baseCurrency} />;
}

export async function TopVendorsSection() {
  const [{ contracts: allContracts }, userMetadata, seatSpend] =
    await Promise.all([
      getContractsList(),
      getUserMetadata(),
      getSidVendorTotals(),
    ]);
  // Bloomberg seats stand in for the vendor's invoices here, so those bills
  // leave before anything is counted.
  const contracts = allContracts.filter(
    (ec) => !isSidVendorInvoice(ec, seatSpend.vendorIds),
  );
  // Same stale-invoice cutoff as the budget page and the MCP dashboard: an
  // invoice whose activity ended before this FY is not current spend.
  const budgetSummary = buildBudgetSummary(contracts, {
    staleInvoiceCutoff: resolveWindow('currentFY', new Date(), {
      startMonth: userMetadata?.organizationFY || 1,
    }).start,
  });
  const topVendors = aggregateTopVendors(
    budgetSummary.aggregatableContracts,
    undefined,
    seatSpend,
  );
  const seatTotals = [...seatSpend.byVendorId.values()].reduce(
    (sum, totals) => ({
      current: sum.current + totals.current,
      projected: sum.projected + totals.projected,
    }),
    { current: 0, projected: 0 },
  );
  // Same predicate as totalVendors, so a seat vendor whose contracts are all
  // inactive still counts once.
  const contractVendorIds = new Set(
    contracts.filter(isActiveContract).map((ec) => ec.vendor_id),
  );
  const seatOnlyVendors = [...seatSpend.vendorIds].filter(
    (vendorId) => !contractVendorIds.has(vendorId),
  ).length;

  return (
    <ReportCard
      title="Top Vendors"
      viewMoreHref={`/contracts?sort=totalContractValue&order=desc`}
      viewMoreText="See all vendors"
      customSubheader={
        <TopVendorsValueLabel
          totalVendors={budgetSummary.totalVendors + seatOnlyVendors}
          totalTCV={budgetSummary.tcv}
          currentTotal={budgetSummary.currentSpend + seatTotals.current}
          projectedTotal={budgetSummary.projectedSpend + seatTotals.projected}
        />
      }
    >
      <div className="mt-2">
        <TopVendorsChart vendors={topVendors} />
      </div>
    </ReportCard>
  );
}

export async function MyContractsSection({ userMetadata }: UserSectionProps) {
  const { contracts } = await timed(
    'dashboard.getContractsList',
    getContractsList,
  );
  const myContracts = contracts.filter((c) =>
    isSponsoredBy(contractOwners(c.contract), {
      userId: userMetadata.userId,
      name: userMetadata.userProfile?.name,
      email: userMetadata.userProfile?.email,
    }),
  );
  if (myContracts.length === 0) return null;

  // "worth" on this card is total contract value. Sum it off the same table
  // rows the card renders below, reading the base-currency TCV stamp the
  // contracts table rolls up — so the tile and its rows cannot disagree.
  const myContractsValue = sumValuesInUSD(
    myContracts.map((contract) => buildContractTableRow(contract)),
    (row) =>
      row.effectiveTotalContractValueUSD ??
      row.convertedTotalContractValue ??
      // Last resort is the NATIVE amount, so it may only be counted when the
      // row is already denominated in the base currency. Adding an unconverted
      // foreign amount would inflate the tile silently; contributing 0 leaves
      // it merely incomplete, which the rows below make visible.
      (row.currency === userMetadata.baseCurrency
        ? (row.totalContractValue ?? 0)
        : 0),
  );

  return (
    <ReportCard
      title="My Contracts"
      count={myContracts.length}
      viewMoreHref="/contracts"
      viewMoreText="See all contracts"
      valueLabel="worth"
      totalValue={myContractsValue}
      currency={userMetadata.baseCurrency}
    >
      <ContractsTable
        contracts={myContracts}
        columns={['vendor', 'product', 'termEndDate', 'currentBudget']}
        itemsPerPage={5}
        hidePagination={true}
        compact={true}
        filters={[]}
      />
    </ReportCard>
  );
}

export async function AutoRenewalsSection({
  userMetadata,
  alertRange,
}: FullSectionProps) {
  const { contracts } = await getContractsList();
  const report = await buildReportFromContracts('auto-renewals', contracts, {
    range: alertRange,
    valueField: 'projectedBudget',
  });

  return (
    <ReportPreview
      reportType="auto-renewals"
      data={report}
      columns={[
        'vendorAndProduct',
        'cancelByDate',
        'termEndDate',
        'currentBudget',
        'projectedBudget',
      ]}
      userMetadata={userMetadata}
    />
  );
}

export async function InvoicesSection({ userMetadata }: UserSectionProps) {
  const { contracts } = await getContractsList();
  const report = await buildReportFromContracts('invoices', contracts, {
    valueField: 'discrepancy',
  });

  const typedRows = report.rows as InvoicesReportRow[];
  const filteredRows = typedRows
    .filter((row) => row.difference !== 0 || row.hasUnmatchedProducts)
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

  // Same severity order as filteredRows, and one lookup structure doing
  // double duty — report.contracts isn't guaranteed to already be sorted
  // that way, and this pass also stands in for the id-membership filter.
  const contractsById = new Map(report.contracts.map((c) => [c.id, c]));
  const matchedContracts = filteredRows
    .map((r) => contractsById.get(Number(r.id)))
    .filter((c): c is (typeof report.contracts)[number] => c != null);
  const topRows = matchedContracts.slice(0, 5);

  const filteredReport: typeof report = {
    ...report,
    rows: filteredRows as typeof report.rows,
    contracts: matchedContracts,
  };

  // Real per-invoice validation (for the badge + hover detail) only for the
  // 5 rows actually rendered here, not every flagged invoice — the report
  // pipeline above already ran the expensive discrepancy math for the counts
  // and totals; this only needs to repeat it for what's on screen.
  const validations = await getInvoiceValidations(topRows);

  return (
    <ReportPreview
      reportType="invoices"
      data={filteredReport}
      userMetadata={userMetadata}
    >
      <Table stickyHeader scrollClassName="rounded-md border">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Vendor</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Invoice Validation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {topRows.map((contract) => {
            const row = buildContractTableRow(contract);
            const validation = validations.get(contract.id);
            return (
              <TableRow key={contract.id}>
                <TableCell>
                  <Link
                    href={`/vendors/${row.vendorId}`}
                    prefetch={false}
                    className="flex min-w-0 items-center gap-2"
                  >
                    <VendorIcon
                      name={row.vendor}
                      domain={row.vendorDomain}
                      width={24}
                      height={24}
                      className="shrink-0 rounded-sm"
                    />
                    <span className="truncate font-sans text-sm text-foreground">
                      {row.vendor}
                    </span>
                  </Link>
                </TableCell>
                <TableCell>
                  <Link
                    href={`/contracts/${row.id}`}
                    prefetch={false}
                    className="line-clamp-2 text-balance font-sans text-sm text-muted-foreground underline-offset-2 hover:underline"
                  >
                    {productNames(row)}
                  </Link>
                </TableCell>
                <TableCell>
                  {validation && (
                    <InvoiceValidationBadge
                      validation={validation}
                      currency={row.currency}
                    />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ReportPreview>
  );
}

export async function UtilizationSection({ userMetadata }: UserSectionProps) {
  const { contracts } = await getContractsList();
  const report = await buildReportFromContracts('utilization', contracts, {
    valueField: 'potentialOverage',
  });

  return (
    <ReportPreview
      reportType="utilization"
      data={report}
      columns={['vendorAndProduct', 'seatUsageDisplay', 'potentialOverage']}
      userMetadata={userMetadata}
    />
  );
}

export async function NdaSection({ userMetadata }: UserSectionProps) {
  const { contracts } = await getContractsList();
  const report = await buildReportFromContracts('nda', contracts, {
    valueField: 'totalContractValue',
  });

  return (
    <ReportPreview
      reportType="nda"
      data={report}
      columns={['vendorAndProduct', 'termStartDate', 'ndaRiskLevel']}
      userMetadata={userMetadata}
    />
  );
}

export async function TrialSection({ userMetadata }: UserSectionProps) {
  const { contracts } = await getContractsList();
  const report = await buildReportFromContracts('trial', contracts, {
    valueField: 'totalContractValue',
  });

  return (
    <ReportPreview
      reportType="trial"
      data={report}
      columns={[
        'vendorAndProduct',
        'daysRemaining',
        'termEndDate',
        'businessSponsor',
        'businessGroup',
      ]}
      userMetadata={userMetadata}
    />
  );
}
