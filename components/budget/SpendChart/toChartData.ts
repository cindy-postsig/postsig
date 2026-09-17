import type {
  SpendQueryResponse,
  SpendRef,
} from '@/app/api/v2/handlers/spend/query';
import type { SpendLineItem } from '@/lib/v2/spend';

export interface SpendChartSlice {
  groupKey: string;
  label: string;
  vendorDomain?: string;
  productName?: string;
  value: number;
  /**
   * The slice's amount in the contract's own currency, straight from the
   * engine item. A slice is one contract, so the popover row renders this;
   * the bar and its header total are aggregates and stay in `value`'s
   * target currency (PSK-1796).
   */
  nativeValue?: number;
  nativeCurrency?: string;
  kind?: 'new' | 'multi-year' | 'renewal';
}

export interface SpendChartPoint {
  key: string;
  label: string;
  value: number;
  slices: SpendChartSlice[];
}

export interface SpendChartData {
  points: SpendChartPoint[];
  isMonthly: boolean;
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function formatPeriodLabel(key: string): string {
  const quarterMatch = key.match(/^(\d{4})-Q([1-4])$/);
  if (quarterMatch) {
    return `Q${quarterMatch[2]} '${quarterMatch[1].slice(-2)}`;
  }
  const monthMatch = key.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    return `${MONTH_LABELS[Number(monthMatch[2]) - 1]} '${monthMatch[1].slice(-2)}`;
  }
  return key;
}

function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function sliceOf(
  groupKey: string,
  ref: SpendRef | undefined,
  item: Pick<SpendLineItem, 'value' | 'nativeValue' | 'nativeCurrency'>,
) {
  return {
    groupKey,
    label: ref?.label ?? groupKey,
    vendorDomain: ref?.vendorDomain,
    productName: ref?.productName,
    value: item.value,
    nativeValue: item.nativeValue,
    nativeCurrency: item.nativeCurrency,
  };
}

/**
 * SpendQueryResponse -> renderable points: the response's `periods` array is
 * the zero-filled axis, items accumulate into per-period totals plus a
 * per-groupKey breakdown (the bar popover), refs supply display labels.
 * Purely presentational — every number is the engine's.
 */
export function toChartData(response: SpendQueryResponse): SpendChartData {
  const byPeriod = new Map<string, SpendChartPoint>();
  for (const period of response.periods) {
    byPeriod.set(period, {
      key: period,
      label: formatPeriodLabel(period),
      value: 0,
      slices: [],
    });
  }

  for (const item of response.items) {
    const point = byPeriod.get(item.period);
    if (!point) continue;
    point.value = toCents(point.value + item.value);
    point.slices.push(
      sliceOf(item.groupKey, response.refs[item.groupKey], item),
    );
  }

  for (const point of byPeriod.values()) {
    point.slices.sort((a, b) => b.value - a.value);
  }

  return { points: [...byPeriod.values()], isMonthly: true };
}

export interface CommitmentChartPoint extends SpendChartPoint {
  newValue: number;
  renewalValue: number;
}

/**
 * Commitments variant: kind-tagged items split into stacked series
 * (newValue/renewalValue; value stays the total for the Y axis and popover).
 * 'multi-year' slices — later years of a signed multi-year term — stack with
 * renewals: both are recurring years, and only the popover badge tells
 * pre-committed from projected. Zero-value events are dropped — zeroed fee
 * shells are intentional CS practice and would render empty popover rows.
 */
export function toCommitmentChartData(response: SpendQueryResponse): {
  points: CommitmentChartPoint[];
  isMonthly: boolean;
} {
  const byPeriod = new Map<string, CommitmentChartPoint>();
  for (const period of response.periods) {
    byPeriod.set(period, {
      key: period,
      label: formatPeriodLabel(period),
      value: 0,
      newValue: 0,
      renewalValue: 0,
      slices: [],
    });
  }

  for (const item of response.items) {
    if (item.value === 0) continue;
    const point = byPeriod.get(item.period);
    if (!point) continue;
    point.value = toCents(point.value + item.value);
    if (item.kind === 'new') {
      point.newValue = toCents(point.newValue + item.value);
    } else {
      point.renewalValue = toCents(point.renewalValue + item.value);
    }
    point.slices.push({
      ...sliceOf(item.groupKey, response.refs[item.groupKey], item),
      kind: item.kind,
    });
  }

  for (const point of byPeriod.values()) {
    point.slices.sort((a, b) => b.value - a.value);
  }

  return { points: [...byPeriod.values()], isMonthly: true };
}

const TCV_QUARTERLY_THRESHOLD_MONTHS = 15;

function calendarQuarterKey(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  return `${year}-Q${Math.floor((Number(month) - 1) / 3) + 1}`;
}

function trimEmptyEnds(points: SpendChartPoint[]): SpendChartPoint[] {
  const first = points.findIndex((p) => p.value > 0);
  if (first === -1) return points;
  let last = points.length - 1;
  while (points[last].value === 0) last--;
  return points.slice(first, last + 1);
}

/**
 * TCV variant: the query runs over a wide monthly window, so trim empty
 * leading/trailing periods and — matching the legacy chart's readability
 * rule — collapse to CALENDAR quarters when the populated span exceeds 15
 * months. (Legacy TCV always bucketed by calendar quarter, not fiscal.)
 */
export function toTcvChartData(response: SpendQueryResponse): SpendChartData {
  const monthly = trimEmptyEnds(toChartData(response).points);
  if (monthly.length <= TCV_QUARTERLY_THRESHOLD_MONTHS) {
    return { points: monthly, isMonthly: true };
  }

  const byQuarter = new Map<string, SpendChartPoint>();
  for (const point of monthly) {
    const key = calendarQuarterKey(point.key);
    let quarter = byQuarter.get(key);
    if (!quarter) {
      quarter = { key, label: formatPeriodLabel(key), value: 0, slices: [] };
      byQuarter.set(key, quarter);
    }
    quarter.value = toCents(quarter.value + point.value);
    quarter.slices.push(...point.slices);
  }

  for (const quarter of byQuarter.values()) {
    quarter.slices.sort((a, b) => b.value - a.value);
  }

  return { points: [...byQuarter.values()], isMonthly: false };
}
