'use client';

import { usd } from '@/components/bloomberg-sid/bits';
import { Metric, MetricStrip } from '@/components/bloomberg-sid/MetricStrip';
import type { SidSummary } from '@/lib/v2/bloomberg-sid/transforms';

const CELL = 'px-6 py-5';
const DIVIDED = `${CELL} border-r border-border`;

export function MetricsGrid({ summary }: { summary: SidSummary }) {
  return (
    <MetricStrip className="grid grid-cols-[repeat(4,1fr)_1.3fr] overflow-hidden p-0">
      <Metric
        label="Terminal Products"
        value={summary.productKinds}
        className={`${DIVIDED} border-b`}
      />
      <Metric
        label="Terminal Subscriptions"
        value={summary.baseSubscriptions.toLocaleString()}
        className={`${DIVIDED} border-b`}
      />
      <Metric
        label="Exchange Products"
        value={summary.uniqueExchangeProducts}
        className={`${DIVIDED} border-b`}
      />
      <Metric
        label="Exchange Allocations"
        value={summary.sidAllocationRows.toLocaleString()}
        className={`${DIVIDED} border-b`}
      />
      <Metric
        label="Total Direct Cost"
        value={usd(summary.totalKnownCost)}
        className={`${CELL} row-span-2 justify-center`}
        valueClassName="text-3xl text-primary"
      />
      <Metric
        label="Terminal Cost"
        value={usd(summary.totalBaseSubscriptionPrice)}
        className={`${DIVIDED} col-span-2`}
      />
      <Metric
        label="Exchange Charges"
        value={usd(summary.knownExchangeChargesTotal)}
        className={`${DIVIDED} col-span-2`}
      />
    </MetricStrip>
  );
}
