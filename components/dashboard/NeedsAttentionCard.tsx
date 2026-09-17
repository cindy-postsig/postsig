'use client';

import { ReportCard } from '@/components/cards/ReportCard';
import { ComplianceReviewItem } from '@/components/contracts/ComplianceReviewItem';
import {
  useNeedsAttention,
  type NeedsAttentionData,
} from '@/hooks/api/useNeedsAttention';
import { Skeleton } from '@/components/ui/skeleton';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';

interface NeedsAttentionCardProps {
  initialData?: NeedsAttentionData;
}

export function NeedsAttentionCard({ initialData }: NeedsAttentionCardProps) {
  const { data, isLoading, error } = useNeedsAttention(initialData);
  const { baseCurrency } = useBaseCurrency();

  if (isLoading) {
    return (
      <ReportCard
        title="Needs Attention"
        viewMoreHref="/reports"
        className="col-span-1"
      >
        <div className="mt-1 space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </ReportCard>
    );
  }

  if (error || !data) {
    return (
      <ReportCard
        title="Needs Attention"
        viewMoreHref="/reports"
        className="col-span-1"
      >
        <div className="mt-1 text-sm text-muted-foreground">
          Unable to load data
        </div>
      </ReportCard>
    );
  }

  const unconfirmed = data['unconfirmed'];
  const contractOmissions = data['contract-omissions'];
  const dora = data['dora'];
  const unexecuted = data['unexecuted'];

  const hasAnyItems =
    (unconfirmed?.count ?? 0) > 0 ||
    (contractOmissions?.count ?? 0) > 0 ||
    (dora?.count ?? 0) > 0 ||
    (unexecuted?.count ?? 0) > 0;

  if (!hasAnyItems) {
    return (
      <ReportCard
        title="Needs Attention"
        viewMoreHref="/reports"
        className="col-span-1"
      >
        <div className="mt-1 text-sm text-muted-foreground">
          No items need attention
        </div>
      </ReportCard>
    );
  }

  return (
    <ReportCard
      title="Needs Attention"
      viewMoreHref="/reports"
      className="col-span-1"
    >
      <div className="mt-1 space-y-4">
        {unconfirmed && unconfirmed.count > 0 && (
          <ComplianceReviewItem
            title="Unconfirmed Renewals"
            count={unconfirmed.count}
            value={unconfirmed.totalValueInUSD}
            currency={baseCurrency}
            description="require confirmation"
            href="/reports/unconfirmed"
          />
        )}

        {contractOmissions && contractOmissions.count > 0 && (
          <ComplianceReviewItem
            title="Contract Omissions"
            count={contractOmissions.count}
            value={contractOmissions.totalValueInUSD}
            currency={baseCurrency}
            description="with omitted clauses"
            href="/reports/contract-omissions"
          />
        )}

        {dora && dora.count > 0 && (
          <ComplianceReviewItem
            title="DORA Analysis"
            count={dora.count}
            value={dora.totalValueInUSD}
            currency={baseCurrency}
            description="with DORA analysis"
            href="/reports/dora"
          />
        )}

        {unexecuted && unexecuted.count > 0 && (
          <ComplianceReviewItem
            title="Unexecuted Contracts"
            count={unexecuted.count}
            value={unexecuted.totalValueInUSD}
            currency={baseCurrency}
            description="are missing signatures"
            href="/reports/unexecuted"
          />
        )}
      </div>
    </ReportCard>
  );
}
