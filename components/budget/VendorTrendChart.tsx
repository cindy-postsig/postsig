'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import { X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import type { VendorPriceSummary } from './VendorPriceTable';

function ChartTooltip({
  active,
  payload,
  label,
}: TooltipProps<number, string>) {
  const { baseCurrency } = useBaseCurrency();
  if (!active || !payload?.length) return null;

  const sorted = [...payload]
    .filter((entry) => entry.value != null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return (
    <div
      className="rounded-lg border bg-popover p-3 shadow-md"
      style={{ minWidth: 200 }}
    >
      <p className="font-medium mb-1.5 text-sm text-foreground">{label}</p>
      <table className="w-full">
        <tbody>
          {sorted.map((entry) => (
            <tr key={entry.dataKey}>
              <td className="py-px pr-4">
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-xs text-foreground">
                    {entry.dataKey}
                  </span>
                </div>
              </td>
              <td className="py-px text-right text-xs tabular-nums text-foreground">
                {formatCurrency(entry.value ?? 0, baseCurrency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Set A — grouped by hue family (blues → purples → yellows → greens → oranges → reds/pinks → neutral)
const COLORS_BY_FAMILY = [
  '#1F1C41', // navy (app theme)
  '#6177D1', // soft blue (blue-500)
  '#242499', // ps primary (app theme, cobalt-leaning)
  '#2E5198', // royal blue
  '#6889BB', // sky blue
  '#2986B1', // light blue
  '#01637D', // teal
  '#5545AE', // purple
  '#A6871D', // gold
  '#C3A749', // mustard
  '#636D2A', // olive green
  '#828F3A', // yellow green
  '#424832', // dark green
  '#CB5724', // burnt orange
  '#CC7736', // orange
  '#86182A', // burgundy
  '#A71A45', // crimson
  '#C5577D', // pink
  '#BE6B79', // mauve
  '#8C877F', // warm gray
];

// Set B — interleaved for max perceptual distance between adjacent slots.
// Navy → soft blue → ps primary leads as the app-theme intro: very dark,
// then bright, then deep saturated cobalt. Pink sits between purple and
// dark green as a warm light transition. Then alternates dark/bright
// and cool/warm.
const COLORS_INTERLEAVED = [
  '#1F1C41', // navy (app theme)
  '#6177D1', // soft blue (blue-500) — bright contrast between navy and cobalt
  '#242499', // ps primary (app theme, cobalt-leaning)
  '#A6871D', // gold
  '#01637D', // teal
  '#86182A', // burgundy
  '#2986B1', // light blue
  '#636D2A', // olive green
  '#5545AE', // purple
  '#C5577D', // pink
  '#424832', // dark green
  '#CC7736', // orange
  '#C3A749', // mustard
  '#2E5198', // royal blue
  '#CB5724', // burnt orange
  '#828F3A', // yellow green
  '#A71A45', // crimson
  '#6889BB', // sky blue
  '#BE6B79', // mauve
  '#8C877F', // warm gray
];

// Active palette — switch between COLORS_BY_FAMILY and COLORS_INTERLEAVED to compare
const COLORS = COLORS_INTERLEAVED;

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

interface Props {
  vendor: VendorPriceSummary;
  periodLabels: string[];
  focusProductId?: number;
  focusContractId?: number;
  onBack: () => void;
  onDrilldown?: (focus: { productId?: number; contractId?: number }) => void;
}

interface Series {
  key: string;
  label: string;
  periods: { label: string; fees: number }[];
  drilldown?: { productId?: number; contractId?: number };
}

export function VendorProductChart({
  vendor,
  periodLabels,
  focusProductId,
  focusContractId,
  onBack,
  onDrilldown,
}: Props) {
  const { baseCurrency } = useBaseCurrency();
  // Build the series to render based on focus level:
  // - vendor only         → one series per product (stacked)
  // - product             → one series per contract under that product
  // - product + contract  → one series for that contract
  const focusedProduct =
    focusProductId != null
      ? vendor.products.find((p) => Number(p.productId) === focusProductId)
      : null;
  const focusedContract =
    focusedProduct && focusContractId != null
      ? focusedProduct.contracts.find((c) => c.contractId === focusContractId)
      : null;

  type Crumb = {
    label: string;
    target?: { productId?: number; contractId?: number };
  };
  let series: Series[];
  const crumbs: Crumb[] = [
    {
      label: vendor.vendorName,
      target: focusedProduct ? {} : undefined,
    },
  ];
  if (focusedContract && focusedProduct) {
    series = [
      {
        key: `c-${focusedContract.contractId}`,
        label: `${focusedContract.contractType || 'Contract'} ${focusedContract.contractId}`,
        periods: focusedContract.periods,
      },
    ];
    crumbs.push({
      label: focusedProduct.productName,
      target: { productId: Number(focusedProduct.productId) },
    });
    crumbs.push({
      label: `${focusedContract.contractType || 'Contract'} ${focusedContract.contractId}`,
    });
  } else if (focusedProduct) {
    series = focusedProduct.contracts.map((c) => ({
      key: `c-${c.contractId}`,
      label: `${c.contractType || 'Contract'} ${c.contractId}`,
      periods: c.periods,
      drilldown: {
        productId: Number(focusedProduct.productId),
        contractId: c.contractId,
      },
    }));
    crumbs.push({ label: focusedProduct.productName });
  } else {
    series = vendor.products.map((p) => ({
      key: `p-${p.productId}`,
      label: p.productName,
      periods: p.periods,
      drilldown: { productId: Number(p.productId) },
    }));
  }

  const seriesYears = new Set<string>();
  for (const s of series) {
    for (const period of s.periods) seriesYears.add(period.label);
  }
  const visiblePeriodLabels = periodLabels.filter((y) => seriesYears.has(y));

  const chartData = visiblePeriodLabels.map((year) => {
    const point: Record<string, string | number> = { year };
    for (const s of series) {
      const period = s.periods.find((p) => p.label === year);
      if (period) {
        point[s.label] = period.fees;
      }
    }
    return point;
  });

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-start justify-between gap-4">
        <nav className="flex flex-wrap items-center gap-1.5 font-label uppercase">
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            const canNavigate = !isLast && crumb.target && onDrilldown;
            return (
              <span key={i} className="flex items-center gap-1.5">
                {canNavigate ? (
                  <button
                    type="button"
                    onClick={() => onDrilldown!(crumb.target!)}
                    className="font-medium rounded-sm px-1 text-[15px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span
                    className={cn(
                      'font-medium px-1 text-[15px]',
                      isLast ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {crumb.label}
                  </span>
                )}
                {!isLast && (
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                )}
              </span>
            );
          })}
        </nav>
        <button
          onClick={onBack}
          className="rounded-sm p-1.5 text-foreground hover:bg-muted"
        >
          <X className="h-6 w-6" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 20, left: 20, bottom: 20 }}
          >
            <CartesianGrid
              strokeDasharray="1 2"
              vertical={false}
              stroke="hsl(var(--muted-foreground))"
              opacity={0.6}
            />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 12, fill: 'currentColor' }}
              className="font-label uppercase"
              tickLine={false}
              axisLine={false}
              tickMargin={12}
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 12, fill: 'currentColor' }}
              className="font-label uppercase"
              orientation="right"
              tickLine={false}
              axisLine={false}
              tickMargin={12}
              interval={0}
              tickFormatter={(value) => formatCurrency(value, baseCurrency)}
              width={60}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
              content={<ChartTooltip />}
            />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.label}
                stackId="vendor"
                fill={COLORS[i % COLORS.length]}
                maxBarSize={32}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {series.length > 1 && (
        <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-1.5 font-label">
          {series.map((s, i) => {
            const canDrill = !!(onDrilldown && s.drilldown);
            const Tag = canDrill ? 'button' : 'div';
            return (
              <Tag
                key={s.key}
                type={canDrill ? 'button' : undefined}
                onClick={
                  canDrill ? () => onDrilldown!(s.drilldown!) : undefined
                }
                className={cn(
                  'flex items-center gap-1.5',
                  canDrill && 'cursor-pointer rounded-sm px-1 hover:bg-muted',
                )}
              >
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="truncate text-xs text-foreground">
                  {s.label}
                </span>
              </Tag>
            );
          })}
        </div>
      )}
    </div>
  );
}
