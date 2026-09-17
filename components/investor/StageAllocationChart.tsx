'use client';

import { PieChart, Pie, Cell } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { ChartCard } from '@/components/investor/ChartCard';
import { getStageColor } from '@/app/(app)/(investor)/investor/colors';
import type {
  PortfolioCompany,
  InvestmentStage,
} from '@/app/(app)/(investor)/investor/types';

const formatCompact = (value: number) =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
    style: 'currency',
    currency: 'USD',
  }).format(value);

interface StageAllocationChartProps {
  companies: PortfolioCompany[];
}

export function StageAllocationChart({ companies }: StageAllocationChartProps) {
  const byStage = new Map<InvestmentStage, number>();
  for (const company of companies) {
    if (!company.stage || company.myTotalFMV <= 0) continue;
    byStage.set(
      company.stage,
      (byStage.get(company.stage) ?? 0) + company.myTotalFMV,
    );
  }

  const data = [...byStage.entries()]
    .map(([stage, value]) => ({ stage, value, fill: getStageColor(stage) }))
    .sort((a, b) => b.value - a.value);

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <ChartCard
      title="Allocation by Stage"
      isEmpty={data.length === 0}
      emptyMessage="No allocation data available"
    >
      <div className="flex h-full items-center justify-center gap-12 pr-6">
        <ChartContainer
          config={{}}
          className="aspect-square h-[220px] shrink-0"
        >
          <PieChart>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideLabel
                  className="w-44"
                  formatter={(value, name) => (
                    <div className="flex w-full justify-between gap-4">
                      <span className="capitalize">{name}</span>
                      <span className="font-medium tabular-nums">
                        {formatCompact(value as number)}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="stage"
              innerRadius={62}
              outerRadius={92}
              paddingAngle={1}
              strokeWidth={0}
            >
              {data.map((d) => (
                <Cell key={d.stage} fill={d.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="flex w-48 flex-col gap-2 font-sans-neue">
          {data.map((d) => (
            <div key={d.stage} className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: d.fill }}
              />
              <span className="truncate text-foreground">{d.stage}</span>
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                {total > 0 ? `${Math.round((d.value / total) * 100)}%` : '-'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}
