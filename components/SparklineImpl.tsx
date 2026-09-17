'use client';

import { LineChart, Line } from 'recharts';
import { cn } from '@/lib/utils';

interface Props {
  data: number[];
  onClick?: () => void;
}

// Increase = red, decrease = green. Shared with ProductDetailSheet.tsx, which
// draws the same trend over a longer history and needs the identical color
// rule to stay visually consistent with this row-level chart.
export function trendColor(first: number | null, last: number | null): string {
  if (first == null || last == null || last === first) return '#9ca3af';
  return last > first ? '#ef4444' : '#22c55e';
}

export function Sparkline({ data, onClick }: Props) {
  if (data.length < 2) return onClick ? <div className="h-10" /> : null;
  const chartData = data.map((value) => ({ value }));
  const color = trendColor(data[0], data[data.length - 1]);

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-md px-2 py-2',
        onClick && 'cursor-pointer hover:bg-muted',
      )}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
    >
      <LineChart
        width={72}
        height={24}
        data={chartData}
        margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
        style={{ pointerEvents: 'none' }}
      >
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}
