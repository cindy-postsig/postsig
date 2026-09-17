'use client';

import { SummaryCard } from '@/components/cards/SummaryCard';
import { useCostMethodTotals } from '@/hooks/api/useCostMethodTotals';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import {
  costMethodLabels,
  costMethodTooltips,
  type CostMethod,
} from './costMethod';

export function SpendMethodCards({
  method,
  fiscalYear,
  currentFiscalYear,
}: {
  method: CostMethod;
  fiscalYear: number;
  currentFiscalYear: number;
}) {
  const { baseCurrency } = useBaseCurrency();
  const {
    isHistorical,
    historicalTotal,
    currentTotal,
    projectedTotal,
    isHistoricalFetching,
    isLoading,
  } = useCostMethodTotals(method, fiscalYear, currentFiscalYear);

  const historicalTitle = `FY${fiscalYear} Spend`;
  const currentTitle = 'Current Estimated Spend';
  const projectedTitle = 'Projected Spend';
  const cardWidth = isHistorical ? 'w-1/3' : 'w-1/2';

  return (
    <div className="mb-4 flex flex-row gap-4">
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
          width={cardWidth}
          className={cardWidth}
          size="lg"
        />
      )}
      <SummaryCard
        title={currentTitle}
        tooltip={{
          title: `${currentTitle} — ${costMethodLabels[method]}`,
          description: costMethodTooltips[method],
        }}
        amount={currentTotal}
        currency={baseCurrency}
        isLoading={isLoading}
        bgColor="from-navy/5 to-navy/15"
        width={cardWidth}
        className={cardWidth}
        size="lg"
      />
      <SummaryCard
        title={projectedTitle}
        tooltip={{
          title: `${projectedTitle} — ${costMethodLabels[method]}`,
          description: costMethodTooltips[method],
        }}
        amount={projectedTotal}
        currency={baseCurrency}
        previousAmount={currentTotal}
        isLoading={isLoading}
        bgColor="from-gray-700/5 to-gray-700/15"
        width={cardWidth}
        className={cardWidth}
        size="lg"
      />
    </div>
  );
}
