import { notFound } from 'next/navigation';

import ContractsTable from '@/components/contracts/ContractsTable';
import { getUserMetadata } from '@/data/users';
import { SpendOverview } from '@/components/budget/SpendOverview';
import { SpendQueryHydration } from '@/components/budget/SpendQueryHydration';
import { getBudgetContracts, getOldestContractFiscalYear } from '@/lib/v2';
import { resolveWindow } from '@/lib/v2/spend';
import { getDefaultCostMethod } from '@/lib/settings/default-cost-method';
import {
  EMPTY_SID_VENDOR_TOTALS,
  getSidVendorTotals,
} from '@/lib/v2/vendors/service';
import { isSidVendorInvoice } from '@/lib/v2/bloomberg-sid/spend';
import { sidBudgetRow } from '@/lib/v2/bloomberg-sid/rows';

export async function BudgetOverviewServer({
  searchParams,
}: {
  searchParams?: {
    page?: string;
    sort?: string;
    order?: string;
    tag?: string;
    renewal?: string;
    tags?: string;
    fy?: string;
  };
}) {
  const [userMetaData, oldestFiscalYear] = await Promise.all([
    getUserMetadata(),
    getOldestContractFiscalYear(),
  ]);

  if (!userMetaData) {
    notFound();
  }

  const currentFiscalYear = resolveWindow('currentFY', new Date(), {
    startMonth: userMetaData.organizationFY || 1,
  }).fyNum;

  const requestedFY = Number(searchParams?.fy);
  const lowerBound = Math.min(
    oldestFiscalYear ?? currentFiscalYear,
    currentFiscalYear,
  );
  const selectedFY = Number.isInteger(requestedFY)
    ? Math.min(Math.max(requestedFY, lowerBound), currentFiscalYear)
    : currentFiscalYear;

  // Seats replace the seat vendor's invoices in the table. The seat population
  // is priced for the current and next fiscal year only, so a historical year
  // lists neither.
  const showSeats = selectedFY === currentFiscalYear;
  const [{ contracts: budgetContracts }, defaultCostMethod, seatSpend] =
    await Promise.all([
      getBudgetContracts(selectedFY),
      getDefaultCostMethod(userMetaData.organizationId),
      showSeats ? getSidVendorTotals() : EMPTY_SID_VENDOR_TOTALS,
    ]);
  const enrichedContracts = showSeats
    ? budgetContracts.filter(
        (ec) => !isSidVendorInvoice(ec, seatSpend.vendorIds),
      )
    : budgetContracts;
  const seatRows = showSeats
    ? [...seatSpend.byVendorId].map(([vendorId, totals]) =>
        sidBudgetRow({
          vendorId,
          name: seatSpend.labels.get(vendorId)?.name ?? String(vendorId),
          domain: seatSpend.labels.get(vendorId)?.domain,
          seats: seatSpend.seatCounts.get(vendorId) ?? 0,
          current: totals.current,
          projected: totals.projected,
          currency: userMetaData.baseCurrency,
        }),
      )
    : [];

  const hasDiscountData = enrichedContracts.some(
    (ec) => ec.contract.discount != null && ec.contract.discount !== 0,
  );

  const columns = [
    'vendor',
    'orderNumber',
    'product',
    'type',
    'renewalType',
    'termStartDate',
    'cancelByDate',
    'termEndDate',
    ...(hasDiscountData ? ['discount'] : []),
    'currentBudget',
    'projectedBudget',
    'annualDifference',
    'tags',
    'businessSponsor',
    'businessGroup',
  ];

  return (
    <div>
      <SpendQueryHydration
        userMetadata={userMetaData}
        method={defaultCostMethod}
        fiscalYear={selectedFY}
        currentFiscalYear={currentFiscalYear}
      >
        <SpendOverview
          heading="Spend Overview"
          currentFiscalYear={currentFiscalYear}
          oldestFiscalYear={oldestFiscalYear}
          defaultMethod={defaultCostMethod}
        />
      </SpendQueryHydration>

      <ContractsTable
        contracts={enrichedContracts}
        columns={columns}
        layoutKey="budget.overview"
        stickyHeader
        defaultSortColumn={searchParams?.sort || 'termEndDate'}
        defaultSortDirection={searchParams?.order === 'desc' ? 'desc' : 'asc'}
        actionType={['export']}
        reportType={'budget'}
        extraRows={seatRows}
      />
    </div>
  );
}
