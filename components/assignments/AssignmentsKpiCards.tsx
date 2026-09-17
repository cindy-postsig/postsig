'use client';

import { SummaryCard } from '@/components/cards/SummaryCard';
import { formatCurrency } from '@/app/lib/utils';
import type { ScopeMetrics } from '@/lib/v2/assignments/types';

const count = (value: number): string => value.toLocaleString('en-US');

/**
 * The figures at the selected scope. Counts roll up because they are counted
 * off the same seat and roster lists at every scope; cost rolls up because it
 * is the allocation rollup's own node total.
 */
export function AssignmentsKpiCards({
  metrics,
  baseCurrency,
  windowLabel,
}: {
  metrics: ScopeMetrics;
  baseCurrency: string;
  /** The month the cost is for, e.g. `April 2026`. */
  windowLabel: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <SummaryCard
        bgColor="from-gray-700/5 to-gray-700/15"
        title="People in scope"
        value={count(metrics.peopleInScope)}
      />
      <SummaryCard
        bgColor="from-gray-700/5 to-gray-700/15"
        title="Assigned users"
        value={count(metrics.assignedUsers)}
        description={
          metrics.unassigned > 0
            ? `${count(metrics.unassigned)} with no seat`
            : undefined
        }
      />
      <SummaryCard
        bgColor="from-gray-700/5 to-gray-700/15"
        title="Assignments"
        value={count(metrics.assignments)}
        description={
          metrics.unlinkedSeats > 0
            ? `${count(metrics.unlinkedSeats)} not linked to an employee`
            : undefined
        }
      />
      <SummaryCard
        bgColor="from-gray-700/5 to-gray-700/15"
        title="Monthly cost"
        value={formatCurrency(metrics.monthlyCost, baseCurrency, true)}
        description={windowLabel}
      />
      <SummaryCard
        bgColor="from-gray-700/5 to-gray-700/15"
        title="Underutilized licences"
        value={count(metrics.underusedLicences)}
        tooltip={{
          title: 'Underutilized licences',
          description:
            'Seats whose holder is not an active employee (a leaver or someone on leave), seats whose holder is not in the HR roster, and Bloomberg terminals the vendor flags as unused for the last 90 days.',
        }}
      />
    </div>
  );
}
