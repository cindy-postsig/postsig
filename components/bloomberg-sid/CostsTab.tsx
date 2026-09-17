'use client';

import { formatCurrency } from '@/app/lib/utils';
import { usd } from '@/components/bloomberg-sid/bits';
import { CostRollupExplorer } from '@/components/bloomberg-sid/CostRollupExplorer';
import { Metric, MetricStrip } from '@/components/bloomberg-sid/MetricStrip';
import { useDateFormat } from '@/hooks/useDateFormat';
import type {
  SidAccount,
  SidHrMatch,
  SidKey,
  SidSubscription,
} from '@/lib/v2/bloomberg-sid/report';
import type {
  SidAllocation,
  SidSummary,
} from '@/lib/v2/bloomberg-sid/transforms';

const DIVIDED = 'border-l border-border pl-10';

export function CostsTab({
  summary,
  reportMonth,
  subscriptions,
  accountsByCustNum,
  allocationsBySid,
  hrMatches,
}: {
  summary: SidSummary;
  /** `yyyy-MM-dd` of the selected report month. */
  reportMonth: string;
  subscriptions: SidSubscription[];
  accountsByCustNum: Map<number, SidAccount>;
  allocationsBySid: Map<SidKey, SidAllocation[]>;
  hrMatches: Record<string, SidHrMatch>;
}) {
  const { formatDate } = useDateFormat();
  const averageBaseCost =
    summary.baseSubscriptions > 0
      ? summary.totalBaseSubscriptionPrice / summary.baseSubscriptions
      : 0;

  return (
    <div className="flex flex-col gap-10">
      <MetricStrip className="grid grid-cols-4 gap-10">
        <Metric
          label="Terminal Cost"
          value={usd(summary.totalBaseSubscriptionPrice)}
          note={`${formatCurrency(averageBaseCost, 'USD', true)} average per subscription`}
        />
        <Metric
          label="Exchange Charges"
          value={usd(summary.knownExchangeChargesTotal)}
          note={`direct charges for ${formatDate(reportMonth)}`}
          className={DIVIDED}
        />
        <Metric
          label="Masked Allocation Rows"
          value={summary.maskedSidAllocationRows.toLocaleString()}
          note="require a price"
          className={DIVIDED}
        />
        <Metric
          label="Masked Aggregate Rows"
          value={summary.maskedAggregateRows.toLocaleString()}
          note="require a price"
          className={DIVIDED}
        />
      </MetricStrip>

      <CostRollupExplorer
        subscriptions={subscriptions}
        accountsByCustNum={accountsByCustNum}
        allocationsBySid={allocationsBySid}
        hrMatches={hrMatches}
      />
    </div>
  );
}
