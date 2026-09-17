import { Suspense } from 'react';
import { ContractsTableClient } from '@/components/contracts/ContractsTableClient';
import Loading from '@/components/Loading';
import { getUserMetadata } from '@/data/users';
import dynamic from 'next/dynamic';
import { formatCurrency } from '@/app/lib/utils';
import { SummaryCard } from '@/components/cards/SummaryCard';
import { getReportData } from '@/lib/v2/reports/service';
import type { ContractTableRow } from '@/lib/v2/core/types';

const ExportReportCSVButton = dynamic(
  () => import('@/components/contracts/ExportReportCSVButton'),
);

export default async function Page({
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
  const user = await getUserMetadata();
  if (!user) {
    return null;
  }
  const searchParams = searchParamsPromise
    ? await searchParamsPromise
    : undefined;
  const range = user.userProfile?.advance_notice_period || 90;

  const currentPage = Number(searchParams?.page) || 1;

  // Fetch all three reports using v2 pipeline
  const [autoRenewalsData, manualRenewalsData, recentlyRenewedData] =
    await Promise.all([
      getReportData('auto-renewals', { range, valueField: 'projectedBudget' }),
      getReportData('manual-renewals', {
        range,
        valueField: 'projectedBudget',
      }),
      getReportData('recently-renewed', { range, valueField: 'currentBudget' }),
    ]);

  // The pipelines' own rows: a report can add rows beyond its contracts
  // (Bloomberg seats renewing), and the totals above already count them.
  const autoRenewalContracts = autoRenewalsData.rows;
  const manualRenewalContracts = manualRenewalsData.rows;
  const recentlyRenewedContracts = recentlyRenewedData.rows;

  const autoRenewalsTCVInUSD = autoRenewalsData.totalValueInUSD;
  const manualRenewalsTCVinUSD = manualRenewalsData.totalValueInUSD;
  const recentlyRenewedTCVinUSD = recentlyRenewedData.totalValueInUSD;

  // The export narrows by contract id, so a row with no contract behind it
  // has nothing to contribute there.
  const contractIdsOf = (rows: ContractTableRow[]): number[] =>
    rows.map((row) => Number(row.id)).filter(Number.isFinite);

  const columns = [
    'expander',
    'vendor',
    'orderNumber',
    'product',
    'type',
    'businessSponsor',
    'businessGroup',
    'renewalType',
    'termStartDate',
    'cancelByDate',
    'termEndDate',
    'currentBudget',
    'projectedBudget',
  ];

  const recentlyRenewedColumns = [
    'expander',
    'vendor',
    'orderNumber',
    'product',
    'type',
    'businessSponsor',
    'businessGroup',
    'renewalType',
    'termStartDate',
    'cancelByDate',
    'termEndDate',
    'currentBudget',
  ];

  return (
    <div>
      <div className="mb-8 mt-8 flex w-full items-start justify-between">
        <div className="items-top flex w-full justify-between">
          <div>
            <h1 className="mb-2 font-serif leading-none">Renewals Report</h1>
          </div>
          <div className="flex gap-4">
            <ExportReportCSVButton
              label="Export"
              reportTitle="renewals"
              contractIds={[]} // Not used in renewals variant
              variant="renewals"
              renewalOptions={[
                {
                  label: 'All Renewals',
                  contractIds: [
                    ...contractIdsOf(autoRenewalContracts),
                    ...contractIdsOf(manualRenewalContracts),
                    ...contractIdsOf(recentlyRenewedContracts),
                  ],
                  reportType: 'all-renewals',
                  fileName: 'all-renewals-report.csv',
                },
                {
                  label: 'Auto-Renewals',
                  contractIds: contractIdsOf(autoRenewalContracts),
                  reportType: 'auto-renewals',
                  fileName: 'auto-renewals-report.csv',
                },
                {
                  label: 'Manual Renewals',
                  contractIds: contractIdsOf(manualRenewalContracts),
                  reportType: 'manual-renewals',
                  fileName: 'manual-renewals-report.csv',
                },
                {
                  label: 'Recently Renewed',
                  contractIds: contractIdsOf(recentlyRenewedContracts),
                  reportType: 'recently-renewed',
                  fileName: 'recently-renewed-report.csv',
                },
              ]}
              disabled={
                autoRenewalContracts.length === 0 &&
                manualRenewalContracts.length === 0 &&
                recentlyRenewedContracts.length === 0
              }
            />
          </div>
        </div>
      </div>

      <div className="mb-10 grid grid-cols-3 gap-4">
        <SummaryCard
          title={'Upcoming Auto-Renewals'}
          description={`Projected spend for auto-renewing contracts within ${range} days`}
          amount={autoRenewalsTCVInUSD}
          currency={user.baseCurrency}
          href="#autoRenewals"
        />
        <SummaryCard
          title={'Upcoming Manual Renewals'}
          description={`Projected spend for manually renewing contracts within ${range} days`}
          amount={manualRenewalsTCVinUSD}
          currency={user.baseCurrency}
          href="#manualRenewals"
        />
        <SummaryCard
          title={'Recently Renewed'}
          description={`Current annual spend for contracts renewed in the last ${range} days`}
          amount={recentlyRenewedTCVinUSD}
          currency={user.baseCurrency}
          href="#recentlyRenewed"
        />
      </div>

      <div className="flex flex-col gap-8">
        {autoRenewalContracts.length > 0 && (
          <div id="autoRenewals">
            <div className="mb-6">
              <div className="font-normal flex items-center gap-2 font-sans text-lg">
                Auto-Renewals
              </div>
              <div className="mb-2 font-sans text-sm text-foreground/70">
                {autoRenewalContracts.length}{' '}
                {autoRenewalContracts.length === 1 ? 'contract' : 'contracts'}{' '}
                with a projected annual spend of{' '}
                {formatCurrency(autoRenewalsTCVInUSD, user.baseCurrency)} will
                auto-renew within {range} days
              </div>
            </div>
            <Suspense
              key={`auto-${currentPage}`}
              fallback={
                <div className="flex w-full items-center justify-center p-12">
                  <Loading />
                </div>
              }
            >
              <ContractsTableClient
                data={autoRenewalContracts}
                columns={columns}
                // No pagination bar, so size the page to the data — a fixed
                // page size would leave rows past it unreachable.
                itemsPerPage={autoRenewalContracts.length}
                hidePagination={true}
                userMetadata={user}
                defaultSortColumn={searchParams?.sort || 'cancelByDate'}
                defaultSortDirection={
                  (searchParams?.order as 'asc' | 'desc') || 'asc'
                }
                filterKeyPrefix="auto"
              />
            </Suspense>
          </div>
        )}

        {manualRenewalContracts.length > 0 && (
          <div id="manualRenewals">
            <div className="mb-6">
              <div className="font-normal flex items-center gap-2 font-sans text-lg">
                Manual Renewals
              </div>
              <div className="mb-2 font-sans text-sm text-foreground/70">
                {manualRenewalContracts.length}{' '}
                {manualRenewalContracts.length === 1 ? 'contract' : 'contracts'}{' '}
                with a projected annual spend of{' '}
                {formatCurrency(manualRenewalsTCVinUSD, user.baseCurrency)} will
                expire within {range} days
              </div>
            </div>
            <Suspense
              key={`manual-${currentPage}`}
              fallback={
                <div className="flex w-full items-center justify-center p-12">
                  <Loading />
                </div>
              }
            >
              <ContractsTableClient
                data={manualRenewalContracts}
                columns={columns}
                itemsPerPage={manualRenewalContracts.length}
                hidePagination={true}
                userMetadata={user}
                defaultSortColumn={searchParams?.sort || 'cancelByDate'}
                defaultSortDirection={
                  (searchParams?.order as 'asc' | 'desc') || 'asc'
                }
                filterKeyPrefix="manual"
              />
            </Suspense>
          </div>
        )}

        {recentlyRenewedContracts.length > 0 && (
          <div id="recentlyRenewed">
            <div className="mb-6">
              <div className="font-normal flex items-center gap-2 font-sans text-lg">
                Recently Renewed
              </div>
              <div className="mb-2 font-sans text-sm text-foreground/70">
                {recentlyRenewedContracts.length}{' '}
                {recentlyRenewedContracts.length === 1
                  ? 'contract'
                  : 'contracts'}{' '}
                with a total annual spend of{' '}
                {formatCurrency(recentlyRenewedTCVinUSD, user.baseCurrency)}{' '}
                renewed in the last {range} days
              </div>
            </div>
            <Suspense
              key={`renewed-${currentPage}`}
              fallback={
                <div className="flex w-full items-center justify-center p-12">
                  <Loading />
                </div>
              }
            >
              <ContractsTableClient
                data={recentlyRenewedContracts}
                columns={recentlyRenewedColumns}
                itemsPerPage={recentlyRenewedContracts.length}
                hidePagination={true}
                userMetadata={user}
                defaultSortColumn={searchParams?.sort || 'termStartDate'}
                defaultSortDirection={
                  (searchParams?.order as 'asc' | 'desc') || 'asc'
                }
                filterKeyPrefix="renewed"
              />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
