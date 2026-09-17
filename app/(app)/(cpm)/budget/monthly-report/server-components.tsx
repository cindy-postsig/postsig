import MonthlyReportClient from '@/components/budget/MonthlyReportClient';
import { getUserMetadata } from '@/data/users';
import { getMonthlyReportData } from '@/lib/v2/reports/monthly-report/service';
import { buildContractTableRow } from '@/lib/v2/contracts/transforms';

export async function MonthlyReportServer() {
  const userMetadata = await getUserMetadata();

  if (!userMetadata) {
    throw new Error('User metadata not found');
  }

  const alertRange = userMetadata.userProfile?.advance_notice_period ?? 90;

  const reportData = await getMonthlyReportData(alertRange, userMetadata);

  if (!reportData) {
    throw new Error('Failed to load monthly report data');
  }

  const {
    amortizedData,
    actualCostData,
    contracts,
    enrichedContracts,
    priceHistories,
    upcomingRenewals,
    fxRates,
  } = reportData;

  const upcomingRenewalsRows = upcomingRenewals.map(buildContractTableRow);

  return (
    <MonthlyReportClient
      amortizedData={amortizedData}
      actualCostData={actualCostData}
      alertRange={alertRange}
      contracts={contracts}
      enrichedContracts={enrichedContracts}
      priceHistories={priceHistories}
      upcomingRenewalsContracts={upcomingRenewalsRows}
      userMetadata={userMetadata}
      fxRates={fxRates}
    />
  );
}
