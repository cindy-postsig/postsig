'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
  CartesianGrid,
} from 'recharts';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';

interface ChartData {
  name: string;
  spend: number;
}

interface MonthlyReportChartProps {
  data: ChartData[];
  className?: string;
}

function formatCompact(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export default function MonthlyReportChart({
  data,
  className = '',
}: MonthlyReportChartProps) {
  const { baseCurrency, formatBaseCurrency } = useBaseCurrency();
  const dynamicHeight = Math.max(250, data.length * 30);

  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div className={className} style={{ width: '100%', height: dynamicHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 5, right: 28, left: 0, bottom: 5 }}
          barGap={4}
        >
          <CartesianGrid
            horizontal={false}
            strokeDasharray="3 3"
            stroke="hsl(var(--muted-foreground))"
            strokeOpacity={0.3}
          />
          <XAxis
            type="number"
            tickFormatter={(v) => formatCompact(v as number, baseCurrency)}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
          />
          <YAxis
            dataKey="name"
            type="category"
            width={190}
            tick={(props) => {
              const { x, y, payload } = props;
              return (
                <text
                  x={x}
                  y={y}
                  dy={3}
                  fontSize={12}
                  textAnchor="end"
                  fill="currentColor"
                  className="font-label text-foreground"
                >
                  {payload.value}
                </text>
              );
            }}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            interval={0}
          />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const { name, spend } = payload[0].payload;
              return (
                <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                  <div className="font-medium">{name}</div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Spend</span>
                    <span>{formatBaseCurrency(spend)}</span>
                  </div>
                </div>
              );
            }}
          />
          <Bar
            dataKey="spend"
            fill="#1F1C41"
            radius={[0, 2, 2, 0]}
            barSize={20}
          >
            {data.map((_, index) => (
              <Cell
                key={index}
                fillOpacity={1 - index * 0.08}
                className="dark:fill-primary"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
