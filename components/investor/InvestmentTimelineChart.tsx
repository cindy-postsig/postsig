'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { ChartCard } from '@/components/investor/ChartCard';
import { formatCurrency } from '@/app/lib/utils';
import { useMode } from '@/contexts/ModeContext';
import type { InvInvestmentFlow } from '@/lib/v2/inv';

interface FlowItem {
  companyName: string;
  date: string;
  amount: number;
}

interface ChartDataPoint {
  key: string;
  displayDate: string;
  amount: number;
  items: FlowItem[];
}

const QUARTER_COUNT = 4;

const formatCompact = (value: number) =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
    style: 'currency',
    currency: 'USD',
  }).format(value);

export function InvestmentTimelineChart({
  flows,
}: {
  flows: InvInvestmentFlow[];
}) {
  const { selectedFunds } = useMode();

  const chartData = useMemo(() => {
    const includeAll =
      selectedFunds.includes('all') || selectedFunds.length === 0;
    const fundIds = selectedFunds.filter(
      (id): id is number => typeof id === 'number',
    );

    const visibleFlows = includeAll
      ? flows
      : flows.filter((f) => f.fundId != null && fundIds.includes(f.fundId));

    // Group invested transactions per absolute quarter index (year * 4 + quarter).
    const itemsByQuarter = new Map<number, FlowItem[]>();
    for (const flow of visibleFlows) {
      if (!(flow.amount > 0)) continue;
      const date = new Date(flow.date);
      if (Number.isNaN(date.getTime())) continue;
      const index =
        date.getUTCFullYear() * 4 + Math.floor(date.getUTCMonth() / 3);
      const items = itemsByQuarter.get(index) ?? [];
      items.push({
        companyName: flow.companyName,
        date: flow.date,
        amount: flow.amount,
      });
      itemsByQuarter.set(index, items);
    }

    const now = new Date();
    const currentIndex =
      now.getUTCFullYear() * 4 + Math.floor(now.getUTCMonth() / 3);

    const latestActiveIndex = itemsByQuarter.size
      ? Math.max(...itemsByQuarter.keys())
      : currentIndex;
    const anchorIndex = Math.min(latestActiveIndex, currentIndex);

    const buckets: ChartDataPoint[] = [];
    for (let i = QUARTER_COUNT - 1; i >= 0; i--) {
      const index = anchorIndex - i;
      const year = Math.floor(index / 4);
      const quarter = (index % 4) + 1;
      const items = (itemsByQuarter.get(index) ?? []).sort(
        (a, b) => b.amount - a.amount,
      );
      buckets.push({
        key: `${year}-Q${quarter}`,
        displayDate: `Q${quarter} '${String(year).slice(-2)}`,
        amount: items.reduce((sum, t) => sum + t.amount, 0),
        items,
      });
    }

    return buckets;
  }, [flows, selectedFunds]);

  const hasActivity = chartData.some((d) => d.amount > 0);

  const chartConfig = {
    amount: {
      label: 'Invested',
      color: 'hsl(var(--primary))',
    },
  };

  const formatYAxis = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  return (
    <ChartCard
      title="Investments"
      isEmpty={!hasActivity}
      emptyMessage="No investments recorded yet"
    >
      <ChartContainer config={chartConfig} className="aspect-auto h-full">
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 20, left: 10, bottom: 10 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="hsl(var(--muted-foreground))"
            strokeOpacity={0.3}
          />
          <XAxis
            dataKey="displayDate"
            tickLine={false}
            axisLine
            tickMargin={10}
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
          />
          <YAxis
            tickFormatter={formatYAxis}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
            width={60}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideIndicator
                hideLabel
                className="w-64"
                formatter={(value, name, item) => {
                  const payload = item?.payload as ChartDataPoint | undefined;
                  if (!payload) return null;
                  const items = payload.items ?? [];

                  return (
                    <div className="flex w-full flex-col gap-1.5">
                      <div className="font-medium flex w-full justify-between">
                        <span>{payload.displayDate}</span>
                        <span>{formatCurrency(payload.amount)}</span>
                      </div>
                      {items.length > 0 && (
                        <div className="flex flex-col gap-1 border-t border-border/50 pt-1.5">
                          {items.map((t, i) => (
                            <div
                              key={i}
                              className="flex w-full items-baseline justify-between gap-3 text-muted-foreground"
                            >
                              <span className="truncate">{t.companyName}</span>
                              <span className="shrink-0 tabular-nums">
                                {formatCompact(t.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }}
              />
            }
          />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {chartData.map((d, index) => (
              <Cell key={d.key} className={'fill-primary'} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}
