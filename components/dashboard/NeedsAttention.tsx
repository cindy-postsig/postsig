import { formatCurrency } from '@/app/lib/utils';
import { ReportCard } from '@/components/cards/ReportCard';
import { ComplianceReviewItem } from '@/components/contracts/ComplianceReviewItem';
import type { NeedsAttentionData } from '@/lib/v2/dashboard/service';

interface NeedsAttentionProps {
  data: NeedsAttentionData;
  currency?: string;
}

export function NeedsAttention({ data, currency }: NeedsAttentionProps) {
  const {
    unconfirmed,
    contractOmissions,
    dora,
    unexecuted,
    leavers,
    unallocated,
  } = data;

  const hasAnyItems =
    unconfirmed.count > 0 ||
    contractOmissions.count > 0 ||
    dora.count > 0 ||
    unexecuted.count > 0 ||
    leavers.count > 0 ||
    (unallocated?.count ?? 0) > 0;

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
      <div className="mt-1 space-y-3">
        {unconfirmed.count > 0 && (
          <ComplianceReviewItem
            title="Unconfirmed Renewals"
            count={unconfirmed.count}
            value={unconfirmed.totalValueInUSD}
            currency={currency}
            description="require confirmation"
            href="/reports/unconfirmed"
          />
        )}

        {contractOmissions.count > 0 && (
          <ComplianceReviewItem
            title="Contract Omissions"
            count={contractOmissions.count}
            value={contractOmissions.totalValueInUSD}
            currency={currency}
            description="with omitted clauses"
            href="/reports/contract-omissions"
          />
        )}

        {dora.count > 0 && (
          <ComplianceReviewItem
            title="DORA Analysis"
            count={dora.count}
            value={dora.totalValueInUSD}
            currency={currency}
            description="with DORA analysis"
            href="/reports/dora"
          />
        )}

        {unexecuted.count > 0 && (
          <ComplianceReviewItem
            title="Unexecuted Contracts"
            count={unexecuted.count}
            value={unexecuted.totalValueInUSD}
            currency={currency}
            description="are missing signatures"
            href="/reports/unexecuted"
          />
        )}

        {unallocated !== undefined && unallocated.count > 0 && (
          <ComplianceReviewItem
            title="Cost Allocations"
            count={unallocated.count}
            value={unallocated.totalValueInUSD}
            currency={currency}
            description=""
            href="/reports/allocation-rollup?filter=unallocated"
            buttonText="Set up"
            subtitle={
              <>
                Set up cost allocations —{' '}
                <span className="font-medium">{unallocated.count}</span>{' '}
                {unallocated.count === 1 ? 'contract' : 'contracts'} worth{' '}
                <span className="font-medium">
                  {formatCurrency(unallocated.totalValueInUSD, currency)}
                </span>{' '}
                {unallocated.count === 1 ? 'is' : 'are'} unallocated
              </>
            }
          />
        )}

        {leavers.count > 0 && (
          <ComplianceReviewItem
            title="Employee Departures (Leavers)"
            count={leavers.count}
            value={leavers.totalValueInUSD}
            description=""
            href="/reports/leavers"
            subtitle={
              <>
                <span className="font-medium">{leavers.totalValueInUSD}</span>{' '}
                {leavers.totalValueInUSD === 1 ? 'license' : 'licenses'} across{' '}
                <span className="font-medium">{leavers.productCount}</span>{' '}
                {leavers.productCount === 1 ? 'product' : 'products'}{' '}
                {leavers.totalValueInUSD === 1 ? 'is' : 'are'} available for
                reassignment
              </>
            }
          />
        )}
      </div>
    </ReportCard>
  );
}
