'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { InvestorNeedsAttention } from '@/components/investor/InvestorNeedsAttention';
import { useMode } from '@/contexts/ModeContext';
import { MetricRow, BareMetric } from '@/components/investor/metric-row';
import { formatCompactUSD } from './company/[id]/companyDetailsFormat';
import type { PortfolioCompany } from './types';
import type { InvInvestmentFlow, InvCashFlow } from '@/lib/v2/inv';
import { computePortfolioMetrics } from '@/lib/v2/inv/metrics';

const InvestmentTimelineChart = dynamic(
  () =>
    import('@/components/investor/InvestmentTimelineChart').then(
      (mod) => mod.InvestmentTimelineChart,
    ),
  { ssr: false },
);

const TopInvestmentsChart = dynamic(
  () =>
    import('@/components/investor/TopInvestmentsChart').then(
      (mod) => mod.TopInvestmentsChart,
    ),
  { ssr: false },
);

const StageAllocationChart = dynamic(
  () =>
    import('@/components/investor/StageAllocationChart').then(
      (mod) => mod.StageAllocationChart,
    ),
  { ssr: false },
);

const PerformanceChart = dynamic(
  () =>
    import('@/components/investor/PerformanceChart').then(
      (mod) => mod.PerformanceChart,
    ),
  { ssr: false },
);

interface InvestorDashboardProps {
  companies: PortfolioCompany[];
  flows: InvInvestmentFlow[];
  cashFlows: InvCashFlow[];
  missingDocsCount: number;
}

export function InvestorDashboard({
  companies,
  flows,
  cashFlows,
  missingDocsCount,
}: InvestorDashboardProps) {
  const { selectedFunds } = useMode();

  const filteredCompanies = useMemo(() => {
    if (selectedFunds.includes('all') || selectedFunds.length === 0) {
      return companies;
    }

    const numericFundIds = selectedFunds.filter(
      (id): id is number => typeof id === 'number',
    );

    return companies.filter((company) => {
      const companyFundIds = company.fundIds || [];
      return numericFundIds.some((fundId) => companyFundIds.includes(fundId));
    });
  }, [companies, selectedFunds]);

  const { companyCount, totalInvested, totalFMV, tvpi, dpi, grossIrr } =
    useMemo(
      () => computePortfolioMetrics(filteredCompanies, cashFlows, new Date()),
      [filteredCompanies, cashFlows],
    );

  return (
    <div className="space-y-16">
      <MetricRow columns={5}>
        <BareMetric
          title="Companies"
          value={companyCount.toString()}
          tooltip={{
            title: 'Portfolio Companies',
            description:
              'Total number of active companies in your investment portfolio',
          }}
        />
        <BareMetric
          title="Total Invested"
          value={formatCompactUSD(totalInvested)}
          tooltip={{
            title: 'Total Investment',
            description:
              'Sum of all capital invested across your portfolio companies',
          }}
        />
        <BareMetric
          title="Total FMV"
          value={formatCompactUSD(totalFMV)}
          tooltip={{
            title: 'Fair Market Value',
            description:
              'Total fair market value of all portfolio companies based on current valuations',
          }}
        />
        <BareMetric
          title="TVPI"
          value={tvpi == null ? '-' : `${tvpi.toFixed(2)}x`}
          tooltip={{
            title: 'Total Value to Paid-In',
            description:
              'Current fair market value plus distributions, divided by total capital invested',
          }}
        />
        <BareMetric
          title="DPI"
          value={dpi == null ? '-' : `${dpi.toFixed(2)}x`}
          tooltip={{
            title: 'Distributions to Paid-In',
            description:
              'Total distributions received divided by total capital invested',
          }}
        />
        {/* <BareMetric
          title="Gross IRR"
          value={grossIrr == null ? '-' : `${(grossIrr * 100).toFixed(1)}%`}
          tooltip={{
            title: 'Gross IRR',
            description:
              'Money-weighted (XIRR) annualized return on invested capital before fees, expenses, and carried interest',
          }}
        /> */}
      </MetricRow>

      {/* Charts */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <InvestmentTimelineChart flows={flows} />
          <StageAllocationChart companies={filteredCompanies} />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <TopInvestmentsChart companies={filteredCompanies} metric="cost" />
          <TopInvestmentsChart companies={filteredCompanies} metric="fmv" />
        </div>

        {/* <PerformanceChart companies={filteredCompanies} /> */}
      </div>

      {/* Needs Attention */}
      <InvestorNeedsAttention
        missingDocuments={{
          title: 'Missing Documents',
          count: missingDocsCount,
          description: 'portfolio companies',
          href: '/investor/missing-documents',
        }}
      />
    </div>
  );
}
