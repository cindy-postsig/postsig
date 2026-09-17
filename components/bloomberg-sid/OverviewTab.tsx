'use client';

import type { ReactNode } from 'react';
import { usd } from '@/components/bloomberg-sid/bits';
import { MetricsGrid } from '@/components/bloomberg-sid/MetricsGrid';
import { Progress } from '@/components/ui/progress';
import { useDateFormat } from '@/hooks/useDateFormat';
import type { SidSummary } from '@/lib/v2/bloomberg-sid/transforms';

const LABEL_CLASS = 'font-bold font-label text-xs uppercase tracking-wide';

const percent = (value: number, total: number) =>
  total > 0 ? (value / total) * 100 : 0;
const formatCount = (value: number) => value.toLocaleString();

function Bar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-4 text-sm">
        <span className="truncate">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {formatCount(value)}
        </span>
      </div>
      <Progress className="h-2" value={percent(value, max)} />
    </div>
  );
}

function BarList({
  label,
  entries,
}: {
  label: string;
  entries: Array<[string, number]>;
}) {
  const max = Math.max(0, ...entries.map(([, count]) => count));
  return (
    <div className="flex flex-col gap-4">
      <h2 className={LABEL_CLASS}>{label}</h2>
      <div className="flex flex-col gap-3">
        {entries.map(([name, count]) => (
          <Bar key={name} label={name} value={count} max={max} />
        ))}
      </div>
    </div>
  );
}

function Share({
  label,
  current,
  total,
  headline,
  countLabel,
  restLabel,
  note,
}: {
  label: string;
  current: number;
  total: number;
  headline: ReactNode;
  countLabel: string;
  restLabel: string;
  note?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className={LABEL_CLASS}>{label}</h2>
      <div className="flex flex-col gap-1">
        <p className="font-serif text-3xl leading-none">
          {formatCount(current)}{' '}
          <span className="text-muted-foreground">of</span> {formatCount(total)}
        </p>
        <p className="text-sm text-muted-foreground">{headline}</p>
      </div>
      <Progress className="h-2" value={percent(current, total)} />
      <div className="flex justify-between gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-primary" aria-hidden />
          <span className="font-medium tabular-nums text-foreground">
            {formatCount(current)}
          </span>
          {countLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-secondary" aria-hidden />
          <span className="font-medium tabular-nums text-foreground">
            {formatCount(total - current)}
          </span>
          {restLabel}
        </span>
      </div>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export function OverviewTab({
  summary,
  reportMonth,
}: {
  summary: SidSummary;
  /** `yyyy-MM-dd` of the selected report month. */
  reportMonth: string;
}) {
  const { formatDate } = useDateFormat();

  const productMix = Object.entries(summary.productMix).sort(
    ([, a], [, b]) => b - a,
  );
  const priceDistribution = Object.entries(summary.priceDistribution).map(
    ([price, count]): [string, number] => [
      `$${Number(price).toLocaleString()}`,
      count,
    ],
  );

  const entitledSubs = summary.baseSubscriptions - summary.baseOnlySubs;
  const allocatedSidsMissingFromInventory =
    summary.uniqueSidsWithAllocations - entitledSubs;
  const pricedAllocationRows =
    summary.sidAllocationRows - summary.maskedSidAllocationRows;

  return (
    <div className="flex flex-col gap-12">
      <MetricsGrid summary={summary} />

      <section className="flex flex-col gap-6">
        <h3>Terminals</h3>
        <div className="grid grid-cols-2 gap-16">
          <BarList label="Product mix" entries={productMix} />
          <BarList label="Price distribution" entries={priceDistribution} />
        </div>
      </section>

      <section className="flex flex-col gap-6 border-t border-border pt-10">
        <h3>Exchanges</h3>
        <div className="grid grid-cols-2 gap-16">
          <Share
            label="Entitlement coverage"
            current={entitledSubs}
            total={summary.baseSubscriptions}
            headline="terminals carry exchange entitlements"
            countLabel="with entitlements"
            restLabel="terminal only"
            note={
              allocatedSidsMissingFromInventory > 0
                ? `${formatCount(allocatedSidsMissingFromInventory)} allocated SIDs are not in this month's terminal inventory.`
                : undefined
            }
          />
          <Share
            label={`Charges · ${formatDate(reportMonth)}`}
            current={pricedAllocationRows}
            total={summary.sidAllocationRows}
            headline={
              <>
                allocation rows priced,{' '}
                <span className="font-medium text-foreground">
                  {usd(summary.knownExchangeChargesTotal)}
                </span>{' '}
                in direct charges
              </>
            }
            countLabel="priced"
            restLabel="masked"
            note={
              summary.maskedAggregateRows > 0
                ? `${formatCount(summary.maskedAggregateRows)} aggregate rows are masked and require a price.`
                : undefined
            }
          />
        </div>
      </section>
    </div>
  );
}
