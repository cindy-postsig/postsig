'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Star, ExternalLink } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { StatCard } from './StatCard';
import { trendColor } from '@/components/SparklineImpl';
import {
  changeColorClass,
  formatFeeAmount,
  formatFeeChange,
  formatShortMonthYear,
} from '@/lib/exchange-agreement/format';
import { useExchangeAgreementMyList } from '@/hooks/useExchangeAgreementMyList';
import type { ProductHistory } from '@/lib/exchange-agreement/feeScheduleQueries';

interface Props {
  history: ProductHistory | null;
  isOpen: boolean;
  onClose: () => void;
}

// Versions land at irregular calendar gaps, so recharts' default index-based
// auto-fit keeps whichever ticks happen not to collide -- producing runs of
// adjacent months right next to year-wide gaps. Striding evenly through the
// *indices* instead always reads as deliberate, and the last value is
// force-included so the range always ends on the latest checkpoint even
// when the stride doesn't land on it exactly. A list no longer than
// maxTicks passes through unchanged (its own first/last are already kept).
export function selectEvenlyStridedTicks<T>(
  values: T[],
  maxTicks: number,
): T[] {
  if (values.length === 0) return [];
  const stride = Math.max(1, Math.ceil((values.length - 1) / (maxTicks - 1)));
  const ticks = values.filter((_, index) => index % stride === 0);
  const last = values[values.length - 1];
  if (ticks[ticks.length - 1] !== last) ticks.push(last);
  return ticks;
}

function HistoryTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ payload: { effectiveDate: string; fee: number | null } }>;
  currency: string | null;
}) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  if (point.fee == null) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 shadow-md">
      <p className="text-xs text-muted-foreground">
        {formatShortMonthYear(point.effectiveDate)}
      </p>
      <p className="font-medium">{formatFeeAmount(point.fee, currency)}</p>
    </div>
  );
}

export default function ProductDetailSheet({
  history,
  isOpen,
  onClose,
}: Props) {
  const { isSaved, toggle } = useExchangeAgreementMyList();

  if (!history) {
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent className="w-[560px] sm:max-w-[560px]" />
      </Sheet>
    );
  }

  const pricedPoints = history.points.filter((point) => point.fee != null);
  const latest = pricedPoints[pricedPoints.length - 1] ?? null;
  const previous = pricedPoints[pricedPoints.length - 2] ?? null;
  const lastChange =
    latest?.fee != null && previous?.fee != null
      ? latest.fee - previous.fee
      : null;
  const saved = isSaved(history.productId);
  // The line's color reflects the overall trend across the full history
  // (first priced point vs. last), same as the row-level Sparkline -- not
  // lastChange, which is specifically latest-vs-previous and can be zero
  // while the chart still shows a clear rise or fall over time.
  const lineColor = trendColor(
    pricedPoints[0]?.fee ?? null,
    latest?.fee ?? null,
  );

  // Recharts has no <YAxis> to infer a domain from, so it falls back to
  // anchoring at 0 -- fine for values that start near zero, but it crushes a
  // flat-ish, non-zero-based series (e.g. 1300-1500) into a thin band near
  // the top of the chart. Padding the actual min/max instead centers any
  // series, flat or not; the fallback covers a fully flat line (min===max),
  // where a range-based padding would otherwise be zero.
  const fees = pricedPoints
    .map((point) => point.fee)
    .filter((fee): fee is number => fee != null);
  const feeMin = fees.length ? Math.min(...fees) : 0;
  const feeMax = fees.length ? Math.max(...fees) : 0;
  const feeRange = feeMax - feeMin;
  const yPadding =
    feeRange > 0 ? feeRange * 0.15 : Math.max(Math.abs(feeMax) * 0.1, 1);
  const yDomain: [number, number] = [feeMin - yPadding, feeMax + yPadding];

  const xTicks = selectEvenlyStridedTicks(
    pricedPoints.map((point) => point.effectiveDate),
    6,
  );

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[640px] overflow-y-auto sm:max-w-[640px]">
        <SheetHeader className="space-y-2 pb-2 pt-4">
          <SheetTitle className="font-medium text-balance text-lg leading-snug">
            {history.title}
          </SheetTitle>
          <SheetDescription>{history.productLine}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <StatCard
            label="Latest Price"
            value={formatFeeAmount(latest?.fee ?? null, history.currency)}
          />
          <StatCard
            label="Last Change"
            value={formatFeeChange(lastChange, history.currency)}
            valueClassName={changeColorClass(lastChange)}
          />
        </div>

        <div className="mt-6 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={pricedPoints}
              // The first/last ticks are now always shown (see xTicks
              // above) and sit exactly at the plot's edges, where their
              // center-anchored text would otherwise get cut off by
              // SheetContent's overflow-y-auto (which clips overflow-x too).
              margin={{ top: 5, right: 24, bottom: 5, left: 24 }}
            >
              <XAxis
                dataKey="effectiveDate"
                tickFormatter={formatShortMonthYear}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                // Explicit, evenly-strided ticks (computed above) instead of
                // recharts' default auto-fit, which keeps whichever indices
                // happen not to collide -- on an irregularly-spaced series
                // that reads as arbitrary (and can drop the first tick
                // entirely). interval={0} stops it from thinning further.
                ticks={xTicks}
                interval={0}
              />
              <YAxis hide domain={yDomain} />
              <Tooltip
                content={<HistoryTooltip currency={history.currency} />}
                cursor={{ stroke: 'currentColor', strokeWidth: 1 }}
              />
              <Line
                type="monotone"
                dataKey="fee"
                stroke={lineColor}
                strokeWidth={2}
                dot={false}
                activeDot={{
                  r: 3,
                  fill: '#fff',
                  stroke: lineColor,
                  strokeWidth: 1,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-6 flex divide-x divide-border rounded-md border border-border">
          <Button
            variant="ghost"
            className="flex-1 rounded-r-none"
            onClick={() => toggle(history.productId)}
          >
            <Star
              className="mr-2 h-4 w-4"
              fill={saved ? 'currentColor' : 'none'}
            />
            {saved ? 'Saved to My List' : 'Add to List'}
          </Button>
          <Button
            variant="ghost"
            className="flex-1 rounded-l-none"
            disabled={!history.sourceDocumentUrl}
            onClick={() => {
              if (!history.sourceDocumentUrl) return;
              // #page is a PDF open-parameter fragment (native browser
              // viewers honor it), not a query param -- safe to append
              // after the signed URL's own ?token=... query string.
              const url = history.sourcePage
                ? `${history.sourceDocumentUrl}#page=${history.sourcePage}`
                : history.sourceDocumentUrl;
              window.open(url, '_blank', 'noopener,noreferrer');
            }}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            View Source
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
