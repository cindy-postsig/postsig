'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { ReportCard } from '@/components/cards/ReportCard';
import { Skeleton } from '@/components/ui/skeleton';

interface CoInvestor {
  investorName: string;
  investorType: string | null;
  roundsParticipated: number;
  companiesCoinvested: number;
  totalCoinvested: number | null;
}

const formatCompact = (value: number) =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
    style: 'currency',
    currency: 'USD',
  }).format(value);

async function fetchCoInvestors(): Promise<CoInvestor[]> {
  const response = await fetch('/api/v2/investor/inv/co-investors');
  if (!response.ok) {
    throw new Error('Failed to fetch co-investors');
  }
  const data = await response.json();
  return data.coInvestors ?? [];
}

export function TopCoInvestorsChart() {
  const {
    data: coInvestors = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['co-investors'],
    queryFn: fetchCoInvestors,
    staleTime: 5 * 60 * 1000,
  });

  const top = coInvestors
    .filter((c) => c.companiesCoinvested > 0)
    .slice(0, 10)
    .map((c) => ({
      name:
        c.investorName.length > 28
          ? c.investorName.slice(0, 26) + '…'
          : c.investorName,
      fullName: c.investorName,
      value: c.companiesCoinvested,
      rounds: c.roundsParticipated,
      type: c.investorType,
      total: c.totalCoinvested,
    }));

  return (
    <ReportCard
      title="Top Co-Investors"
      count={isLoading ? undefined : top.length}
      viewMoreHref="/investor/portfolio"
      viewMoreText="View all"
    >
      <div className="h-[280px]">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : isError ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Failed to load co-investor data
          </div>
        ) : top.length > 0 ? (
          <ChartContainer config={{}} className="aspect-auto h-full">
            <BarChart
              layout="vertical"
              data={top}
              margin={{ top: 5, right: 40, left: 5, bottom: 5 }}
            >
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                dataKey="name"
                type="category"
                width={200}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={0}
                tick={{ fontSize: 12 }}
                className="font-label text-foreground"
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideIndicator
                    hideLabel
                    className="w-56"
                    formatter={(value, name, item) => {
                      const fullName = item?.payload?.fullName;
                      const rounds = item?.payload?.rounds;
                      const type = item?.payload?.type;
                      const total = item?.payload?.total;
                      if (!fullName) return null;
                      return (
                        <div className="flex w-full flex-col gap-1">
                          <div className="font-medium">{fullName}</div>
                          {type && (
                            <div className="capitalize text-muted-foreground">
                              {type}
                            </div>
                          )}
                          <div className="flex w-full justify-between">
                            <span>Shared companies</span>
                            <span>{value as number}</span>
                          </div>
                          <div className="flex w-full justify-between text-muted-foreground">
                            <span>Rounds</span>
                            <span>{rounds}</span>
                          </div>
                          {total != null && total > 0 && (
                            <div className="flex w-full justify-between text-muted-foreground">
                              <span>Co-invested</span>
                              <span>{formatCompact(total)}</span>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                }
              />
              <Bar
                dataKey="value"
                radius={2}
                barSize={14}
                className="fill-[#1F1C41] dark:fill-primary"
                label={{
                  position: 'right',
                  fontSize: 12,
                  fill: 'currentColor',
                  className: 'font-label text-foreground',
                }}
              />
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No co-investor data available
          </div>
        )}
      </div>
    </ReportCard>
  );
}
