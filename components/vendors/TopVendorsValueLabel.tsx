'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/app/lib/utils';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';

type ChartType = 'tcv' | 'currentBudget' | 'projectedBudget';

export default function TopVendorsValueLabel({
  totalVendors,
  totalTCV,
  currentTotal,
  projectedTotal,
}: {
  totalVendors: number;
  totalTCV: number;
  currentTotal: number;
  projectedTotal: number;
}) {
  // We need to use client-side state
  const [chartType, setChartType] = useState<ChartType>('tcv');
  const { baseCurrency } = useBaseCurrency();

  // Subscribe to changes in the chart type
  useEffect(() => {
    const handleChartTypeChange = (e: CustomEvent) => {
      if (e.detail?.chartType) {
        setChartType(e.detail.chartType);
      }
    };

    // Listen for custom event from the chart component
    window.addEventListener(
      'chartTypeChange',
      handleChartTypeChange as EventListener,
    );

    return () => {
      window.removeEventListener(
        'chartTypeChange',
        handleChartTypeChange as EventListener,
      );
    };
  }, []);

  if (chartType === 'tcv') {
    return (
      <>
        {totalVendors} vendors with TCV {formatCurrency(totalTCV, baseCurrency)}
      </>
    );
  } else if (chartType === 'currentBudget') {
    return (
      <>
        {totalVendors} vendors with a current annual spend of{' '}
        {formatCurrency(currentTotal, baseCurrency)}
      </>
    );
  } else {
    return (
      <>
        {totalVendors} vendors with a projected annual spend of{' '}
        {formatCurrency(projectedTotal, baseCurrency)}
      </>
    );
  }
}
