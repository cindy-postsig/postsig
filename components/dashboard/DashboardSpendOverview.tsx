'use client';

import { useState } from 'react';
import { ReportCard } from '@/components/cards/ReportCard';
import { SummaryCard } from '@/components/cards/SummaryCard';
import { SpendChart } from '@/components/budget/SpendChart';
import { CostMethodSelect } from '@/components/budget/CostMethodSelect';
import {
  FiscalYearSelect,
  fiscalYearOptions,
} from '@/components/budget/FiscalYearSelect';
import { useCostMethodTotals } from '@/hooks/api/useCostMethodTotals';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import {
  costMethodLabels,
  costMethodTooltips,
  type CostMethod,
} from '@/components/budget/costMethod';

/**
 * The dashboard's Spend Overview card on the engine: one cost-method state
 * and one fiscal-year state drive the summary cards AND the chart (same
 * principle as the budget overview — the surfaces cannot describe different
 * bases or years). TCV is method- and window-independent and stays the
 * server-computed legacy scalar.
 * `defaultMethod` is the org-level setting (psk-1877), resolved server-side.
 */
export function DashboardSpendOverview({
  tcv,
  totalContracts,
  totalVendors,
  defaultMethod,
  currentFiscalYear,
  oldestFiscalYear,
}: {
  tcv: number;
  totalContracts: number;
  totalVendors: number;
  defaultMethod: CostMethod;
  currentFiscalYear: number;
  oldestFiscalYear: number | null;
}) {
  const { baseCurrency } = useBaseCurrency();
  const [method, setMethod] = useState<CostMethod>(defaultMethod);
  const [fiscalYear, setFiscalYear] = useState(currentFiscalYear);

  const years = fiscalYearOptions(oldestFiscalYear, currentFiscalYear);

  // Same card shape as the budget overview (product request 2026-08-04); a
  // historical selection also re-windows the chart below.
  const {
    isHistorical,
    historicalTotal,
    currentTotal,
    projectedTotal,
    isHistoricalFetching,
    isLoading,
  } = useCostMethodTotals(method, fiscalYear, currentFiscalYear);

  const historicalTitle = `FY${fiscalYear} Spend`;

  return (
    <ReportCard
      title="Spend Overview"
      viewMoreHref="/budget"
      viewMoreText="See spend"
      className="col-span-2"
      headerAction={
        <div className="flex items-center gap-3">
          <FiscalYearSelect
            fiscalYear={fiscalYear}
            years={years}
            onChange={setFiscalYear}
          />
          <CostMethodSelect method={method} onChange={setMethod} />
        </div>
      }
    >
      <div className="space-y-6">
        <div
          className={`mt-1 grid grid-cols-1 gap-3 ${
            isHistorical ? 'md:grid-cols-4' : 'md:grid-cols-3'
          }`}
        >
          {isHistorical && (
            <SummaryCard
              title={historicalTitle}
              tooltip={{
                title: `${historicalTitle} — ${costMethodLabels[method]}`,
                description: `${costMethodTooltips[method]} Modeled from contract terms for FY${fiscalYear}.`,
              }}
              amount={historicalTotal}
              currency={baseCurrency}
              isLoading={isHistoricalFetching}
              bgColor="from-gray-500/5 to-gray-500/15"
              size="sm"
            />
          )}
          <SummaryCard
            title="Total Contract Value (TCV)"
            amount={tcv}
            currency={baseCurrency}
            secondaryText={`${totalContracts} contracts`}
            href="/contracts?sort=totalContractValue&order=desc"
            bgColor="from-primary/5 to-primary/15"
            size="sm"
          />
          <SummaryCard
            title="Current Estimated Spend"
            tooltip={{
              title: `Current Estimated Spend — ${costMethodLabels[method]}`,
              description: costMethodTooltips[method],
            }}
            amount={currentTotal}
            currency={baseCurrency}
            isLoading={isLoading}
            secondaryText={`${totalVendors} vendors`}
            href="/budget"
            bgColor="from-navy/5 to-navy/15"
            size="sm"
          />
          <SummaryCard
            title="Projected Spend"
            tooltip={{
              title: `Projected Spend — ${costMethodLabels[method]}`,
              description: costMethodTooltips[method],
            }}
            amount={projectedTotal}
            currency={baseCurrency}
            previousAmount={currentTotal}
            isLoading={isLoading}
            href="/budget/monthly-report"
            bgColor="from-gray-700/5 to-gray-700/15"
            size="sm"
          />
        </div>

        <div className="mt-4">
          <SpendChart
            method={method}
            fiscalYear={fiscalYear}
            currentFiscalYear={currentFiscalYear}
          />
        </div>
      </div>
    </ReportCard>
  );
}
