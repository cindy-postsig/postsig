'use client';

import { BarChart, Bar, XAxis, YAxis, Cell, ReferenceLine } from 'recharts';
import Link from 'next/link';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { ChartCard } from '@/components/investor/ChartCard';
import type { PortfolioCompany } from '@/app/(app)/(investor)/investor/types';

const formatSignedCompact = (value: number) => {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const formatted = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
    style: 'currency',
    currency: 'USD',
  }).format(Math.abs(value));
  return `${sign}${formatted}`;
};

interface PerformanceChartProps {
  companies: PortfolioCompany[];
}

export function PerformanceChart({ companies }: PerformanceChartProps) {
  const movers = companies
    // Require a real current valuation: missing FMV (and exited companies, whose
    // FMV is forced to 0) would otherwise show as phantom -100% markdowns.
    .filter((c) => c.myAggregateCost > 0 && c.myTotalFMV > 0)
    .map((c) => ({
      id: c.id,
      name: c.name.length > 22 ? c.name.slice(0, 20) + '…' : c.name,
      fullName: c.name,
      gain: c.myTotalFMV - c.myAggregateCost,
      multiple: c.multiple,
    }))
    .filter((d) => d.gain !== 0)
    .sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain))
    .slice(0, 10)
    .sort((a, b) => b.gain - a.gain);

  return (
    <ChartCard
      title="Markups & Markdowns"
      height={500}
      isEmpty={movers.length === 0}
      emptyMessage="No performance data available"
    >
      <ChartContainer config={{}} className="aspect-auto h-full">
        <BarChart
          layout="vertical"
          data={movers}
          margin={{ top: 5, right: 40, left: 5, bottom: 5 }}
        >
          <XAxis type="number" hide />
          <YAxis
            dataKey="name"
            type="category"
            width={150}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval={0}
            tick={(props) => {
              const { x, y, payload } = props;
              const companyId = movers[payload.index]?.id;
              const text = (
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
              return companyId ? (
                <Link href={`/investor/company/${companyId}`}>{text}</Link>
              ) : (
                text
              );
            }}
          />
          <ReferenceLine x={0} className="stroke-border" />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideIndicator
                hideLabel
                className="w-52"
                formatter={(value, name, item) => {
                  const fullName = item?.payload?.fullName;
                  const multiple = item?.payload?.multiple;
                  if (!fullName) return null;
                  return (
                    <div className="flex w-full flex-col gap-1">
                      <div className="font-medium">{fullName}</div>
                      <div className="flex w-full justify-between">
                        <span>Unrealized</span>
                        <span>{formatSignedCompact(value as number)}</span>
                      </div>
                      {multiple > 0 && (
                        <div className="flex w-full justify-between text-muted-foreground">
                          <span>Multiple</span>
                          <span>{multiple.toFixed(1)}x</span>
                        </div>
                      )}
                    </div>
                  );
                }}
              />
            }
          />
          <Bar dataKey="gain" radius={2} maxBarSize={40}>
            {movers.map((d) => (
              <Cell
                key={d.id}
                className={
                  d.gain >= 0 ? 'fill-emerald-600' : 'fill-destructive'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}
