'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import type { CoInvestor } from '../../types';
import { cn } from '@/lib/utils';
import { getStageColor } from '@/app/(app)/(investor)/investor/colors';
import { useDateFormat } from '@/hooks/useDateFormat';
import { formatCompactUSD } from './companyDetailsFormat';
import {
  TabHeader,
  BareMetric,
  MetricRow,
  TabEmptyState,
} from './companyDetailsPrimitives';

function CoInvestorStageBadge({
  stageName,
}: {
  stageCode: string | null;
  stageName: string | null;
}) {
  if (!stageName) return <span className="text-muted-foreground">-</span>;
  const color = getStageColor(stageName as any);
  return (
    <Badge
      variant="secondary"
      className="text-xs text-white"
      style={{
        backgroundColor: color,
        borderColor: color,
      }}
    >
      {stageName}
    </Badge>
  );
}

export function CoInvestorsContent({
  coInvestors,
  companyName,
}: {
  coInvestors: CoInvestor[] | undefined;
  companyName: string;
}) {
  const { formatDate } = useDateFormat();
  const totalInvestments = (coInvestors ?? []).reduce(
    (sum, ci) => sum + ci.investments.length,
    0,
  );
  const totalCoInvestment = (coInvestors ?? []).reduce(
    (sum, ci) =>
      sum +
      ci.investments.reduce((s, inv) => s + (inv.totalInvestment ?? 0), 0),
    0,
  );

  if (!coInvestors || coInvestors.length === 0) {
    return (
      <TabEmptyState title="Co-Investors">
        No co-investor data available for this company.
      </TabEmptyState>
    );
  }

  return (
    <div className="space-y-12 pb-12">
      <TabHeader
        title="Co-Investors"
        tooltip={`Other investors who participated in ${companyName}'s rounds. Grouped by co-investor.`}
      />
      <MetricRow columns={3}>
        <BareMetric
          title="Total Co-Investment"
          value={formatCompactUSD(totalCoInvestment)}
        />
        <BareMetric title="Co-Investors" value={String(coInvestors.length)} />
        <BareMetric
          title="Investments Across Rounds"
          value={String(totalInvestments)}
        />
      </MetricRow>

      <div className="space-y-6">
        <div className="overflow-hidden rounded border text-[0.825rem] 3xl:text-[0.85rem]">
          <div className="font-normal grid grid-cols-[2fr_1fr_1fr_1fr] gap-x-8 border-b bg-background px-4 py-[6px] font-sans text-[.8em] leading-tight text-muted-foreground">
            <div>Co-Investor</div>
            <div>Date</div>
            <div>Stage</div>
            <div className="text-right">Total Investment</div>
          </div>
          <div className="divide-y divide-foreground/10">
            {coInvestors.map((ci, idx) => {
              const investments =
                ci.investments.length > 0 ? ci.investments : [null];
              const otherCount = (ci.companiesCoinvested ?? 1) - 1;
              return (
                <div
                  key={`ci-${idx}`}
                  className={cn(
                    'grid grid-cols-[2fr_1fr_1fr_1fr] items-start gap-x-8 gap-y-2 px-4 py-3 text-sm transition-colors hover:bg-muted/40',
                    idx % 2 === 1 && 'bg-muted/20',
                  )}
                >
                  <div
                    className="flex flex-col gap-1.5 self-start"
                    style={{
                      gridColumn: 1,
                      gridRow: `span ${investments.length}`,
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-x-1.5">
                      <span className="font-medium">{ci.investorName}</span>
                      <span className="text-xs text-muted-foreground">
                        · {ci.roundsCount}{' '}
                        {ci.roundsCount === 1 ? 'round' : 'rounds'}
                      </span>

                      {otherCount > 0 && (
                        <>
                          <span className="text-xs text-muted-foreground">
                            ·
                          </span>
                          <HoverCard openDelay={150}>
                            <HoverCardTrigger asChild>
                              <button
                                type="button"
                                className="bg-transparent p-0 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                +{otherCount} other{' '}
                                {otherCount === 1 ? 'portco' : 'portcos'}
                              </button>
                            </HoverCardTrigger>
                            <HoverCardContent
                              side="top"
                              align="start"
                              className="w-auto min-w-40 p-3"
                            >
                              <p className="font-medium mb-1.5 text-xs">
                                Also invested in
                              </p>
                              <div className="space-y-1">
                                {ci.otherCompanyNames.map((name) => (
                                  <div key={name} className="text-xs">
                                    {name}
                                  </div>
                                ))}
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        </>
                      )}
                    </div>
                  </div>
                  {investments.map((inv, jdx) => (
                    <React.Fragment key={jdx}>
                      <div
                        className="font-sans-neue text-sm tabular-nums"
                        style={{ gridColumn: 2, gridRow: jdx + 1 }}
                      >
                        {formatDate(inv?.date, '-')}
                      </div>
                      <div style={{ gridColumn: 3, gridRow: jdx + 1 }}>
                        <CoInvestorStageBadge
                          stageCode={inv?.stageCode ?? null}
                          stageName={inv?.stageName ?? null}
                        />
                      </div>
                      <div
                        className="text-right font-sans-neue text-sm tabular-nums"
                        style={{ gridColumn: 4, gridRow: jdx + 1 }}
                      >
                        {inv?.totalInvestment != null
                          ? formatCompactUSD(inv.totalInvestment)
                          : '-'}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-right text-xs text-muted-foreground">
          <span className="font-medium">Source: </span> Stock Purchase Agreement
          &amp; Schedule of Purchasers for each round.
        </p>
      </div>
    </div>
  );
}
