'use client';

import * as React from 'react';
import { formatCurrency } from '@/app/lib/utils';
import { ChangeDisplay } from '@/app/ui/budget/ChangeDisplay';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';

interface BudgetChartProps {
  currentTotal: number;
  projectedTotal: number;
}

export default function BudgetChart({
  currentTotal,
  projectedTotal,
}: BudgetChartProps) {
  const { baseCurrency } = useBaseCurrency();
  // Calculate the percentage for the width of bars based on the larger value
  const maxValue = Math.max(currentTotal, projectedTotal);
  const currentPercentage = (currentTotal / maxValue) * 100;
  const projectedPercentage = (projectedTotal / maxValue) * 100;

  return (
    <div className="mt-2 space-y-8 p-3">
      {/* Current Spend Section */}
      <div className="space-y-2">
        <div className="text-xs">Current Estimated Spend</div>
        <div className="pb-1 font-serif text-2xl">
          {formatCurrency(currentTotal, baseCurrency)}
        </div>
        <div className="h-1 w-full rounded-sm bg-muted">
          <div
            className="h-full rounded-sm bg-blue-950"
            style={{ width: `${currentPercentage}%` }}
          />
        </div>
      </div>

      {/* Projected Spend Section */}
      <div className="space-y-2">
        <div className="text-xs">Projected Spend</div>
        <div className="pb-1 font-serif text-2xl">
          {formatCurrency(projectedTotal, baseCurrency)}
          <ChangeDisplay
            currentValue={currentTotal}
            newValue={projectedTotal}
            currency={baseCurrency}
            size="sm"
          />
        </div>
        <div className="h-1 w-full rounded-sm">
          <div
            className="h-full rounded-sm bg-blue-950/70"
            style={{ width: `${projectedPercentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
