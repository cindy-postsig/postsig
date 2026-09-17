'use client';

import * as React from 'react';
import { useChatStore } from '@/stores/chatStore';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import type {
  AlertBlock,
  Badge as BadgeSpec,
  BarListBlock,
  CardBlock,
  CardGridBlock,
  ChartBlock,
  LineageBlock,
  LineageNode,
  Stat,
  StatGridBlock,
  UIBlock,
} from '@/lib/v2/chat/ui-dsl';

// Mirrors COLORS_INTERLEAVED in VendorTrendChart so multi-series DSL charts
// look at home next to the budget charts. Leads with navy (the app's bar
// color) → bright blue → cobalt, then alternates dark/bright and cool/warm
// for max perceptual distance between adjacent series.
const CHART_COLORS = [
  '#1F1C41', // navy (app theme)
  '#6177D1', // soft blue
  '#242499', // ps primary (cobalt)
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

// Sidebar (default) keeps tiles compact — at most 2 columns so values stay
// readable in ~448px. Fullscreen widens to the declared column count. We
// branch on isFullscreen rather than viewport breakpoints because the chat
// can be narrow even on a wide desktop.
const STAT_GRID_COLS_SIDEBAR: Record<2 | 3 | 4, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2',
  4: 'grid-cols-2',
};
const STAT_GRID_COLS_FULLSCREEN: Record<2 | 3 | 4, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-4',
};

const CARD_GRID_COLS: Record<2 | 3, string> = {
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
};

const ALERT_VARIANT_BY_LEVEL = {
  info: 'info',
  warn: 'warning',
  critical: 'destructive',
} as const;

const BADGE_VARIANT_BY_TONE = {
  neutral: 'secondary',
  positive: 'default',
  warning: 'notice',
  critical: 'destructive',
} as const;

/**
 * Allowlist for which DSL primitives actually render. Anything not in this
 * set is treated as if it failed to parse — the caller (AssistantMessage)
 * falls back to rendering the raw JSON in a <pre> code block.
 *
 * To disable a primitive while testing, remove its `type` from the set.
 */
export const ENABLED_UI_BLOCKS = new Set<UIBlock['type']>([
  'lineage',
  'stat-grid',
  'chart',
  'alert',
  'bar-list',
  'card',
  'card-grid',
]);

export function isUIBlockEnabled(block: UIBlock): boolean {
  return ENABLED_UI_BLOCKS.has(block.type);
}

function safeRender(
  node: () => React.ReactElement,
  block: UIBlock,
): React.ReactElement {
  try {
    return node();
  } catch {
    return (
      <pre className="my-2 overflow-x-auto rounded bg-muted p-3 text-xs">
        {JSON.stringify(block, null, 2)}
      </pre>
    );
  }
}

function DSLRendererInner({ block }: { block: UIBlock }) {
  if (!isUIBlockEnabled(block)) {
    return (
      <pre className="my-2 overflow-x-auto rounded bg-muted p-3 text-xs">
        {JSON.stringify(block, null, 2)}
      </pre>
    );
  }
  switch (block.type) {
    case 'stat-grid':
      return safeRender(() => <StatGrid block={block} />, block);
    case 'chart':
      return safeRender(() => <ChartRenderer block={block} />, block);
    case 'alert':
      return safeRender(() => <AlertRenderer block={block} />, block);
    case 'bar-list':
      return safeRender(() => <BarListRenderer block={block} />, block);
    case 'card':
      return safeRender(() => <CardRenderer block={block} />, block);
    case 'card-grid':
      return safeRender(() => <CardGridRenderer block={block} />, block);
    case 'lineage':
      return safeRender(() => <LineageRenderer block={block} />, block);
  }
}

/**
 * Memoized so a streamed message — where the parent markdown re-evaluates on
 * every token — doesn't tear down and re-mount the rendered DSL component
 * once the block is complete. Identity equality on `block` is intentional:
 * the caller passes a `useMemo`'d parsed object so a stable raw JSON string
 * means a stable `block` reference.
 */
export const DSLRenderer = React.memo(DSLRendererInner);

function StatGrid({ block }: { block: StatGridBlock }) {
  const cols = block.columns ?? 3;
  const isFullscreen = useChatStore((s) => s.isFullscreen);
  const grid = isFullscreen
    ? STAT_GRID_COLS_FULLSCREEN[cols]
    : STAT_GRID_COLS_SIDEBAR[cols];
  return (
    <div className={cn('my-3 grid gap-2', grid)}>
      {block.items.map((stat, i) => (
        <StatTile key={i} stat={stat} />
      ))}
    </div>
  );
}

// Matches SummaryCard's serif aesthetic (neutral gray-700 gradient, the most
// muted of the dashboard's variants) but sized down for chat —
// dashboard-size numbers (text-[1.75rem]) cause "Oct 2, 2026" to wrap onto two
// lines in a 4-up grid even at fullscreen-chat widths. text-base for the value
// keeps single-line dates and dollar amounts readable in both sidebar and
// fullscreen.
function StatTile({ stat }: { stat: Stat }) {
  return (
    <div
      className={cn(
        'flex h-full flex-col justify-between gap-1 rounded border border-border/30 p-2.5',
        'bg-gradient-to-tr from-gray-700/5 from-20% to-gray-700/15',
        'dark:from-accent dark:to-secondary',
      )}
    >
      <div className="font-sans text-[0.7rem] leading-tight text-foreground/80">
        {stat.label}
      </div>
      <div className="mt-[1px] flex items-end gap-1.5 font-sans-neue text-lg leading-tight">
        <span className="truncate">{stat.value}</span>
        {stat.delta && (
          <span
            className={cn(
              'flex shrink-0 items-center gap-0.5 text-[0.65rem]',
              stat.trend === 'up' && 'text-emerald-600 dark:text-emerald-400',
              stat.trend === 'down' && 'text-red-600 dark:text-red-400',
              stat.trend === 'flat' && 'text-muted-foreground',
            )}
          >
            {stat.trend === 'up' && <ArrowUp className="h-3 w-3" />}
            {stat.trend === 'down' && <ArrowDown className="h-3 w-3" />}
            {stat.trend === 'flat' && <Minus className="h-3 w-3" />}
            <span>{stat.delta}</span>
          </span>
        )}
      </div>
    </div>
  );
}

// Cap rotated x-axis labels so they don't visually overflow the chart on the
// leftmost tick (where the diagonal text extends past x=0). Tooltips still
// show the full label, so truncation here is purely visual.
function truncateChars(value: unknown, max: number): string {
  const s = String(value ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const MAX_X_LABEL_CHARS = 16;
function truncateLabel(value: unknown): string {
  return truncateChars(value, MAX_X_LABEL_CHARS);
}

// Generic abbreviator so a chart of dollars, counts, or percentages all read
// cleanly on the left Y axis. Mirrors PriceHistoryChart's $K/$M style but
// without forcing a currency symbol — the DSL chart is domain-neutral.
function abbreviateAxisNumber(value: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return String(value);
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const m = value / 1_000_000;
    return `${m % 1 === 0 ? m : m.toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    const k = value / 1_000;
    return `${k % 1 === 0 ? k : k.toFixed(1)}K`;
  }
  return String(value);
}

// "annualSpend" / "annual_spend" / "annual-spend" → "Annual Spend".
// LLM-generated keys arrive in arbitrary cases; the tooltip shouldn't surface
// the raw identifier.
function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Recharts has no auto-rotate. With long vendor names or many ticks the
// horizontal labels stack on top of each other. Heuristic: rotate when labels
// won't comfortably fit horizontally. The axis height grows with label length
// since rotated labels project diagonally below the axis.
function getXAxisLayout(
  data: Array<Record<string, unknown>>,
  xKey: string,
): { rotate: boolean; height: number } {
  const labels = data.map((d) => String(d[xKey] ?? ''));
  const maxLen = labels.reduce((m, l) => Math.max(m, l.length), 0);
  const rotate = labels.length > 6 || maxLen > 8;
  const height = rotate ? Math.min(110, Math.max(60, maxLen * 5)) : 30;
  return { rotate, height };
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    dataKey?: string | number;
    value?: unknown;
    name?: string;
  }>;
  label?: unknown;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="grid min-w-[10rem] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium text-foreground">{String(label ?? '')}</div>
      <div className="grid gap-1">
        {payload.map((item, i) => {
          const key = String(item.dataKey ?? item.name ?? i);
          const value =
            typeof item.value === 'number'
              ? item.value.toLocaleString()
              : String(item.value ?? '');
          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{humanizeKey(key)}</span>
              <span className="font-medium tabular-nums text-foreground">
                {value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChartRenderer({ block }: { block: ChartBlock }) {
  const chartConfig = React.useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        block.yKeys.map((key, i) => [
          key,
          {
            label: humanizeKey(key),
            color: CHART_COLORS[i % CHART_COLORS.length],
          },
        ]),
      ),
    [block.yKeys],
  );

  return (
    <div className="my-4">
      <div className="h-96">
        <ChartContainer config={chartConfig} className="aspect-auto h-full">
          {renderChartByKind(block)}
        </ChartContainer>
      </div>
    </div>
  );
}

// Recharts' default category tick wraps long labels onto multiple lines to fit
// the axis width. For the horizontal bar chart we want one truncated line, so
// render a single <text> ourselves (inline fontSize beats the .font-label CSS).
function HorizontalYAxisTick(props: {
  x?: number;
  y?: number;
  payload?: { value?: unknown };
}) {
  return (
    <text
      x={props.x}
      y={props.y}
      dy="0.32em"
      textAnchor="end"
      fill="currentColor"
      className="font-label"
      style={{ fontSize: 11 }}
    >
      {truncateChars(props.payload?.value, 26)}
    </text>
  );
}

function renderChartByKind(block: ChartBlock): React.ReactElement {
  if (block.kind === 'bar') {
    const singleSeries = block.yKeys.length === 1;
    const makeBars = (maxBarSize?: number) =>
      block.yKeys.map((key, i) => (
        <Bar
          key={key}
          dataKey={key}
          name={humanizeKey(key)}
          radius={1}
          maxBarSize={maxBarSize}
          className={
            singleSeries ? 'fill-[#1F1C41] dark:fill-primary' : undefined
          }
          fill={
            singleSeries ? undefined : CHART_COLORS[i % CHART_COLORS.length]
          }
        />
      ));

    // Horizontal bars (recharts calls this layout="vertical"): category labels
    // run down the y-axis, values extend rightward. Better for ranking many
    // items or long category labels (vendor names) than rotated x-axis ticks.
    if (block.orientation === 'horizontal') {
      const maxLabelLen = block.data.reduce(
        (m, d) => Math.max(m, String(d[block.xKey] ?? '').length),
        0,
      );
      const yWidth = Math.min(
        220,
        Math.max(110, Math.min(maxLabelLen, 26) * 7.5 + 12),
      );
      return (
        <BarChart
          layout="vertical"
          data={block.data}
          margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
          barGap={0}
          barSize={16}
        >
          <CartesianGrid
            strokeDasharray="1 2"
            horizontal={false}
            stroke="hsl(var(--muted-foreground))"
            opacity={0.6}
          />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: 'currentColor' }}
            className="font-label uppercase"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickCount={4}
            tickFormatter={abbreviateAxisNumber}
          />
          <YAxis
            dataKey={block.xKey}
            type="category"
            width={yWidth}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            interval={0}
            tick={<HorizontalYAxisTick />}
          />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
            content={<ChartTooltip />}
          />
          {!singleSeries && (
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          )}
          {makeBars(20)}
        </BarChart>
      );
    }

    const xAxis = getXAxisLayout(block.data, block.xKey);
    return (
      <BarChart
        data={block.data}
        margin={{ top: 40, right: 8, left: 12, bottom: 20 }}
        barGap={0}
        barSize={24}
      >
        <CartesianGrid
          strokeDasharray="1 2"
          vertical={false}
          stroke="hsl(var(--muted-foreground))"
          opacity={0.6}
        />
        <XAxis
          dataKey={block.xKey}
          type="category"
          height={xAxis.height}
          tick={{ fontSize: 11, fill: 'currentColor' }}
          className="font-label"
          tickLine={false}
          axisLine={false}
          tickMargin={12}
          interval={0}
          angle={xAxis.rotate ? -30 : 0}
          textAnchor={xAxis.rotate ? 'end' : 'middle'}
          tickFormatter={truncateLabel}
        />
        <YAxis
          type="number"
          width={48}
          tick={{ fontSize: 11, fill: 'currentColor' }}
          className="font-label uppercase"
          orientation="left"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickCount={4}
          tickFormatter={abbreviateAxisNumber}
        />
        <Tooltip
          cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
          content={<ChartTooltip />}
        />
        {!singleSeries && (
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        )}
        {makeBars()}
      </BarChart>
    );
  }
  if (block.kind === 'line') {
    const xAxis = getXAxisLayout(block.data, block.xKey);
    return (
      <LineChart
        data={block.data}
        margin={{ top: 40, right: 8, left: 12, bottom: 20 }}
      >
        <CartesianGrid
          strokeDasharray="1 2"
          vertical={false}
          stroke="hsl(var(--muted-foreground))"
          opacity={0.6}
        />
        <XAxis
          dataKey={block.xKey}
          type="category"
          height={xAxis.height}
          tick={{ fontSize: 11, fill: 'currentColor' }}
          className="font-label"
          tickLine={false}
          axisLine={false}
          tickMargin={12}
          interval={0}
          angle={xAxis.rotate ? -30 : 0}
          textAnchor={xAxis.rotate ? 'end' : 'middle'}
          tickFormatter={truncateLabel}
        />
        <YAxis
          type="number"
          width={48}
          tick={{ fontSize: 11, fill: 'currentColor' }}
          className="font-label uppercase"
          orientation="left"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickCount={4}
          tickFormatter={abbreviateAxisNumber}
        />
        <Tooltip content={<ChartTooltip />} />
        {block.yKeys.length > 1 && (
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        )}
        {block.yKeys.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            name={humanizeKey(key)}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    );
  }
  // pie — uses first yKey only
  const pieKey = block.yKeys[0];
  return (
    <PieChart>
      <Tooltip content={<ChartTooltip />} />
      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
      <Pie
        data={block.data}
        dataKey={pieKey}
        nameKey={block.xKey}
        cx="50%"
        cy="50%"
        outerRadius={90}
        label
      >
        {block.data.map((_, i) => (
          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
        ))}
      </Pie>
    </PieChart>
  );
}

function AlertRenderer({ block }: { block: AlertBlock }) {
  return (
    <Alert variant={ALERT_VARIANT_BY_LEVEL[block.level]} className="my-3">
      {block.title && <AlertTitle>{block.title}</AlertTitle>}
      <AlertDescription>{block.body}</AlertDescription>
    </Alert>
  );
}

const BAR_TONE_FILL = {
  neutral: 'bg-foreground/40',
  positive: 'bg-emerald-500 dark:bg-emerald-400',
  warning: 'bg-amber-500 dark:bg-amber-400',
  critical: 'bg-red-500 dark:bg-red-400',
} as const;

// Ranked horizontal bars (label · bar · value). For share-of-total and
// concentration views where a per-row magnitude reads faster than a column of
// numbers. Bars scale against `max`; when no `max` is given, we peg the scale
// just above the largest value so the top bar fills LARGEST_BAR_FILL of the
// track (not flush at 100%) — the headroom reads as "part of a whole".
const LARGEST_BAR_FILL = 0.8;
function BarListRenderer({ block }: { block: BarListBlock }) {
  const largest = Math.max(...block.items.map((i) => i.value), 0);
  const max = block.max ?? (largest > 0 ? largest / LARGEST_BAR_FILL : 1);
  // One grid so columns align across every row. The bar and its primary value
  // (values[0] — the bar's readout) share one cell so they read as a coupled
  // unit; remaining values become their own right-aligned columns, set apart by
  // the larger grid gap. restCols adapts to the trailing values rows carry.
  const valueCols = Math.max(
    1,
    ...block.items.map((it) => it.values?.length ?? 1),
  );
  const restCols = valueCols - 1;
  return (
    <div className="my-4">
      {block.title && (
        <div className="font-medium mb-4 text-sm text-foreground">
          {block.title}
        </div>
      )}
      <div
        className="grid items-center gap-x-6 gap-y-2 text-sm"
        style={{
          gridTemplateColumns: `minmax(0, 1fr) auto${restCols > 0 ? ` repeat(${restCols}, auto)` : ''}`,
        }}
      >
        {block.items.map((item, i) => {
          const pct = Math.max(0, Math.min(100, (item.value / max) * 100));
          const cells = item.values?.length
            ? item.values
            : [String(item.value)];
          return (
            <div key={i} className="contents">
              <span className="flex min-w-0 items-center gap-1.5">
                {item.href?.startsWith('/') ? (
                  <Link
                    href={item.href}
                    className="truncate no-underline hover:text-primary"
                    title={item.label}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className="truncate" title={item.label}>
                    {item.label}
                  </span>
                )}
                {item.badge && (
                  <Badge
                    variant="secondary"
                    size="sm"
                    className="shrink-0 font-mono"
                  >
                    {item.badge}
                  </Badge>
                )}
              </span>
              <span className="flex items-center gap-2.5">
                <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted sm:w-36">
                  <span
                    className={cn(
                      'block h-full rounded-full',
                      BAR_TONE_FILL[item.tone ?? 'neutral'],
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="font-medium shrink-0">{cells[0]}</span>
              </span>
              {Array.from({ length: restCols }, (_, ri) => (
                <span key={ri} className="text-right text-muted-foreground">
                  {cells[ri + 1] ?? ''}
                </span>
              ))}
              {i < block.items.length - 1 && (
                <span className="col-span-full h-px bg-border/60" aria-hidden />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardRenderer({ block }: { block: CardBlock }) {
  const hasHeader = block.title || block.subtitle || block.badges?.length;
  return (
    <Card className="my-3">
      {hasHeader && (
        <CardHeader>
          {block.title && (
            <CardTitle className="text-xl leading-tight">
              {block.title}
            </CardTitle>
          )}
          {block.subtitle && (
            <CardDescription>{block.subtitle}</CardDescription>
          )}
          {block.badges && block.badges.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {block.badges.map((b, i) => (
                <BadgeRenderer key={i} badge={b} />
              ))}
            </div>
          )}
        </CardHeader>
      )}
      <CardContent className={hasHeader ? undefined : 'pt-6'}>
        {block.children.map((child, i) => (
          <DSLRenderer key={i} block={child} />
        ))}
      </CardContent>
    </Card>
  );
}

function CardGridRenderer({ block }: { block: CardGridBlock }) {
  const cols = block.columns ?? 2;
  return (
    <div className={cn('my-3 grid gap-3', CARD_GRID_COLS[cols])}>
      {block.cards.map((card, i) => (
        <CardRenderer key={i} block={card} />
      ))}
    </div>
  );
}

function BadgeRenderer({ badge }: { badge: BadgeSpec }) {
  const variant = BADGE_VARIANT_BY_TONE[badge.tone ?? 'neutral'];
  return (
    <Badge variant={variant} size="sm">
      {badge.label}
    </Badge>
  );
}

// Vertical indented tree. Cards inherit the SummaryCard gradient aesthetic so
// each row reads as a real surface, not a list item. Connectors are drawn by
// the parent <ul>: a vertical spine from each child + a short horizontal stub
// into the card. Pure CSS, no layout libs — predictable at any width.
function LineageRenderer({ block }: { block: LineageBlock }) {
  return (
    <div className="my-3">
      {block.title && (
        <div className="font-medium mb-3 text-sm text-foreground">
          {block.title}
        </div>
      )}
      <LineageList nodes={[block.root]} isRoot />
    </div>
  );
}

function LineageList({
  nodes,
  isRoot = false,
}: {
  nodes: LineageNode[];
  isRoot?: boolean;
}) {
  return (
    <ul
      className={cn(
        'flex list-none flex-col gap-2 pl-0',
        // children get an indent + a vertical spine drawn with a left border
        !isRoot && 'ml-3 border-l border-foreground/15 pl-4',
      )}
    >
      {nodes.map((node) => (
        <LineageItem key={node.id} node={node} isRoot={isRoot} />
      ))}
    </ul>
  );
}

function LineageItem({ node, isRoot }: { node: LineageNode; isRoot: boolean }) {
  const children = node.children ?? [];
  return (
    <li className="relative">
      {/* horizontal stub from the parent spine into this card */}
      {!isRoot && (
        <span
          aria-hidden
          className="absolute -left-4 top-5 h-px w-3 bg-foreground/15"
        />
      )}
      <LineageCard node={node} />
      {children.length > 0 && (
        <div className="mt-2">
          <LineageList nodes={children} />
        </div>
      )}
    </li>
  );
}

function LineageCard({ node }: { node: LineageNode }) {
  // Mirror ContractLineageMap.getProductInfo: show products when they exist,
  // fall back to contract type. An explicit `title` (e.g. a custom contract
  // name) wins over both.
  const products = node.products ?? [];
  const display =
    node.title ??
    (products.length > 0 ? products.join(', ') : node.contractType) ??
    `Contract #${node.id}`;
  return (
    <div className="flex items-center gap-3 rounded border border-border/50 bg-card px-3 py-2">
      {node.localId && (
        <Badge variant="secondary" size="sm" className="shrink-0 font-mono">
          {node.localId}
        </Badge>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          href={`/contracts/${node.id}`}
          className="font-normal truncate font-sans text-sm no-underline hover:text-primary"
          title={display}
        >
          {display}
        </Link>
        {node.subtitle && (
          <span className="truncate text-xs text-muted-foreground">
            {node.subtitle}
          </span>
        )}
      </div>
      {node.dateRange && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {node.dateRange}
        </span>
      )}
    </div>
  );
}
