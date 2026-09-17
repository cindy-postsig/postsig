'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Rectangle,
} from 'recharts';
import Link from 'next/link';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { ChartCard } from '@/components/investor/ChartCard';
import { formatCurrency } from '@/app/lib/utils';
import type { PortfolioCompany } from '@/app/(app)/(investor)/investor/types';

type HoldingMetric = 'fmv' | 'cost';

interface TopInvestmentsChartProps {
  companies: PortfolioCompany[];
  metric?: HoldingMetric;
}

const METRIC_CONFIG: Record<
  HoldingMetric,
  { title: string; label: string; select: (c: PortfolioCompany) => number }
> = {
  fmv: {
    title: 'Top Holdings by FMV',
    label: 'FMV',
    select: (c) => c.myTotalFMV,
  },
  cost: {
    title: 'Top Holdings by Cost',
    label: 'Cost',
    select: (c) => c.myAggregateCost,
  },
};

export function TopInvestmentsChart({
  companies,
  metric = 'fmv',
}: TopInvestmentsChartProps) {
  const { title, label, select } = METRIC_CONFIG[metric];

  const topCompanies = [...companies]
    .filter((c) => select(c) > 0)
    .sort((a, b) => select(b) - select(a))
    .slice(0, 10)
    .map((company) => {
      const companyName =
        company.name.length > 25
          ? company.name.substring(0, 22) + '...'
          : company.name;

      return {
        id: company.id,
        name: companyName,
        fullName: company.name,
        value: select(company),
        stage: company.stage,
        multiple: company.multiple,
      };
    });

  const chartConfig = {
    value: {
      label,
    },
  };

  return (
    <ChartCard
      title={title}
      isEmpty={topCompanies.length === 0}
      emptyMessage="No investment data available"
    >
      <ChartContainer config={chartConfig} className="aspect-auto h-full">
        <BarChart
          layout="vertical"
          data={topCompanies}
          margin={{ top: 5, right: 12, left: 5, bottom: 5 }}
          barGap={0}
        >
          <CartesianGrid
            horizontal={false}
            strokeDasharray="3 3"
            stroke="hsl(var(--muted-foreground))"
            strokeOpacity={0.3}
          />
          <XAxis
            type="number"
            tickFormatter={(v) =>
              '$' +
              new Intl.NumberFormat('en-US', {
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(v as number)
            }
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
          />
          <YAxis
            dataKey="name"
            type="category"
            width={180}
            tick={(props) => {
              const { x, y, payload } = props;
              const companyId = topCompanies[payload.index]?.id;

              if (!companyId) {
                return (
                  <text
                    x={x}
                    y={y}
                    dy={3}
                    fontSize={12}
                    textAnchor="end"
                    fill="currentColor"
                    className="text-foreground"
                  >
                    {payload.value}
                  </text>
                );
              }

              return (
                <Link href={`/investor/company/${companyId}`}>
                  <text
                    x={x}
                    y={y}
                    dy={3}
                    fontSize={12}
                    textAnchor="end"
                    fill="currentColor"
                    className="cursor-pointer text-foreground hover:underline"
                  >
                    {payload.value}
                  </text>
                </Link>
              );
            }}
            tickLine={false}
            axisLine
            tickMargin={10}
            interval={0}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideIndicator
                hideLabel
                className="w-52"
                formatter={(value, name, item) => {
                  const fullName = item?.payload?.fullName;
                  const stage = item?.payload?.stage;
                  const multiple = item?.payload?.multiple;

                  if (fullName) {
                    return (
                      <div className="flex w-full flex-col gap-1">
                        <div className="font-medium">{fullName}</div>
                        <div className="flex w-full justify-between">
                          <span>{label}</span>
                          <span>{formatCurrency(value as number)}</span>
                        </div>
                        <div className="flex w-full justify-between text-muted-foreground">
                          <span>Stage</span>
                          <span>{stage}</span>
                        </div>
                        {multiple > 0 && (
                          <div className="flex w-full justify-between text-muted-foreground">
                            <span>Multiple</span>
                            <span>{multiple.toFixed(1)}x</span>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
            }
          />
          <Bar
            dataKey="value"
            radius={2}
            barSize={14}
            className="fill-primary"
            shape={(props: unknown) => {
              const { x, y, width, height, index } = props as {
                x: number;
                y: number;
                width: number;
                height: number;
                index: number;
              };
              const opacity = 1 - index * 0.08;

              return (
                <Rectangle
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  radius={[0, 2, 2, 0]}
                  className="fill-primary"
                  fillOpacity={opacity}
                />
              );
            }}
          />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}
