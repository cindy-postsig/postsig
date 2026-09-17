'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, HelpCircle, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  customDisplayValue,
  formatKpiDisplay,
  formatMonthLabel,
  resolveAnnualKpi,
  resolveQuarterKpi,
} from '@/lib/v2/kpis/transforms';
import type {
  EditableKpi,
  KpiPeriod,
  KpiScalar,
  KpiValueType,
} from '@/lib/v2/kpis/types';
import { apiClient, ApiRequestError } from '@/lib/api/v2-client';

export const bandClasses = (band: boolean) => ({
  cellBg: band ? 'bg-band' : 'bg-background',
  rowHover: band ? 'hover:!bg-band' : 'hover:!bg-background',
});

export const STICKY_METRIC_COLUMN =
  'sticky left-0 z-[2] shadow-[1px_0_0_0_hsl(var(--border))]';

export function KpiCategoryHeaderRow({
  category,
  isCollapsed,
  colSpan,
  onToggle,
}: {
  category: string;
  isCollapsed: boolean;
  colSpan: number;
  onToggle: () => void;
}) {
  return (
    <TableRow
      role="button"
      tabIndex={0}
      aria-expanded={!isCollapsed}
      className="cursor-pointer"
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <TableCell
        colSpan={colSpan}
        className="border-y border-foreground/15 bg-blue-600/5 p-0"
      >
        <div className="font-medium sticky left-0 flex w-fit items-center gap-1.5 px-3 py-1.5 text-sm text-foreground/85">
          {isCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          {category}
        </div>
      </TableCell>
    </TableRow>
  );
}

// The KPI's own label plus an optional info tooltip carrying its catalog
// description. Standard narrative fields have no description and render bare.
function KpiLabel({
  label,
  description,
}: {
  label: string;
  description: string | null;
}) {
  if (!description) return <>{label}</>;
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <TooltipProvider>
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              aria-label={`${label} info`}
              className="inline-flex cursor-default items-center justify-center text-muted-foreground hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/60"
            >
              <HelpCircle className="h-3 w-3" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p>{description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
}

// Tooltip for a marked cell. Carries any combination of an investor-over-portco
// correction (submitted → yours) and an out-of-sync note (a directly-entered
// value disagreeing with the roll-up of its sub-periods); a cell with both shows
// one merged tooltip. Echoes the OverrideBadge visual language without coupling
// to the inv-overrides system.
function EditedTooltipContent({
  heading,
  original,
  current,
  computed,
  grain,
}: {
  heading: string;
  original?: string;
  current?: string;
  computed?: string;
  grain: 'annual' | 'quarterly';
}) {
  const hasCorrection = original != null && current != null;
  return (
    <TooltipContent side="top" className="max-w-64 text-left text-xs">
      <div className="flex flex-col gap-1">
        <span className="font-medium leading-tight">{heading}</span>
        {hasCorrection && (
          <>
            <div className="flex items-baseline gap-1.5 tabular-nums">
              <span className="text-white/45 line-through">{original}</span>
              <span className="text-white/35">→</span>
              <span className="font-semibold text-white">{current}</span>
            </div>
            <span className="text-[0.7rem] text-white/55">
              Your value replaces the submitted one.
            </span>
          </>
        )}
        {computed != null && (
          <span className="text-[0.7rem] text-white/55">
            Entered {grain === 'annual' ? 'annual' : 'quarterly'} value —{' '}
            {grain === 'annual' ? 'quarterly' : 'monthly'} data computes to{' '}
            {computed}. Consider updating the{' '}
            {grain === 'annual' ? 'quarterly' : 'monthly'} values.
          </span>
        )}
      </div>
    </TooltipContent>
  );
}

const isTextType = (valueType: KpiValueType): boolean =>
  valueType === 'text' || valueType === 'textarea';

// Drafts keep their unit adornments ($, %, commas) even while editing — the
// cell never swaps between raw and formatted text, and the retained symbols
// teach the expected format. Parsing strips them the same way the server does.
const draftNumber = (draft: string): number | null => {
  const cleaned = draft.replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

// Focused empty cells hint the expected unit; idle empty cells keep the dash
// (a resting "$0" would read as an actual zero value).
const unitPlaceholder = (valueType: KpiValueType): string => {
  if (valueType === 'currency') return '$0';
  if (valueType === 'percent') return '0%';
  if (valueType === 'number') return '0';
  return '–';
};

// The editable cell shows the display value (investor correction, else the
// portco-submitted value), so editing a submitted value starts from it and
// layers the investor's correction on top. Clearing only removes the investor
// row — a portco-backed cell falls back to the submitted value.
function scalarEditString(
  shown: KpiScalar | undefined,
  valueType: KpiValueType,
): string {
  if (!shown) return '';
  if (shown.numeric != null) {
    return formatKpiDisplay(valueType, shown.numeric, null);
  }
  return shown.text ?? '';
}

const scalarHasValue = (scalar: {
  numeric: number | null;
  text: string | null;
}): boolean => scalar.numeric != null || !!scalar.text?.trim();

// Normalizes a numeric draft back to full display formatting on blur (e.g.
// "1400000" → "$1,400,000"); unparseable drafts pass through for the server to
// reject with a message.
const formatDraft = (valueType: KpiValueType, draft: string): string => {
  if (!draft || isTextType(valueType)) return draft;
  const n = draftNumber(draft);
  return n == null ? draft : formatKpiDisplay(valueType, n, null);
};

// Investor-authored value cell (standard or custom KPI): types the value inline
// and persists on blur via setKpiValue. Marks the cell when it overrides a
// portco-submitted value.
function KpiValueCell({
  kpi,
  companyId,
  year,
  quarter,
  month,
  onSaved,
}: {
  kpi: EditableKpi;
  companyId: number;
  year: number;
  quarter: number | null;
  month: number | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const cell = kpi.values.find(
    (v) =>
      v.periodYear === year &&
      v.periodQuarter === quarter &&
      v.periodMonth === month,
  );
  const isFy = quarter == null && month == null;
  // Quarters and fiscal years display the recency-resolved reading (direct
  // value, or the roll-up of their sub-periods) — a computed roll-up renders
  // exactly like a value, not as empty. A month is the finest grain, so it has
  // nothing to roll up and reads its own cell.
  const resolved =
    month != null
      ? null
      : isFy
        ? resolveAnnualKpi(kpi, year)
        : resolveQuarterKpi(kpi, year, quarter as number);
  const initial = scalarEditString(
    month != null ? cell?.displayValue : resolved?.displayValue,
    kpi.valueType,
  );
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hovering, setHovering] = useState(false);

  useEffect(() => setDraft(initial), [initial]);

  const commit = async () => {
    if (draft === initial || saving) return;
    setSaving(true);
    try {
      await apiClient.reporting.setKpiValue({
        companyId,
        publicId: kpi.publicId,
        periodYear: year,
        periodQuarter: quarter,
        periodMonth: month,
        value: draft,
      });
      onSaved();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not save value',
        description:
          err instanceof ApiRequestError
            ? err.message
            : 'Something went wrong. Please try again.',
      });
      setDraft(initial);
    } finally {
      setSaving(false);
    }
  };

  const periodLabel =
    month != null
      ? formatMonthLabel(month, year)
      : quarter != null
        ? `Q${quarter} ${year}`
        : `FY ${year}`;
  const investorOverPortco =
    !!cell?.edited &&
    !!cell.portcoValue &&
    scalarHasValue(cell.portcoValue) &&
    !!cell.investorValue;
  // A computed roll-up is never marked, even when an older investor row exists;
  // only a displayed direct value flags an override and/or an out-of-sync
  // roll-up.
  const direct = resolved?.source === 'direct' ? resolved : null;
  const showMarker = !!direct && (investorOverPortco || direct.outOfSync);
  const correction =
    investorOverPortco && cell?.portcoValue && cell.investorValue
      ? {
          original: formatKpiDisplay(
            kpi.valueType,
            cell.portcoValue.numeric,
            cell.portcoValue.text,
          ),
          current: formatKpiDisplay(
            kpi.valueType,
            cell.investorValue.numeric,
            cell.investorValue.text,
          ),
        }
      : null;
  const outOfSyncComputed =
    direct?.outOfSync && direct.computedValue
      ? formatKpiDisplay(
          kpi.valueType,
          direct.computedValue.numeric,
          direct.computedValue.text,
        )
      : undefined;

  return (
    <TooltipProvider>
      <Tooltip open={showMarker && hovering && !focused}>
        <span className="relative block">
          <span
            aria-hidden
            className="invisible block whitespace-pre px-3 py-3 text-right font-sans-neue text-[0.8125rem] tabular-nums"
          >
            {initial || '–'}
          </span>
          <TooltipTrigger asChild>
            <input
              aria-label={`${kpi.label} — ${periodLabel}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                setDraft((d) => formatDraft(kpi.valueType, d));
                void commit();
              }}
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  setDraft(initial);
                  e.currentTarget.blur();
                }
              }}
              inputMode={kpi.valueType === 'text' ? 'text' : 'decimal'}
              placeholder={focused ? unitPlaceholder(kpi.valueType) : '–'}
              className={cn(
                'absolute inset-0 cursor-text appearance-none border-0 bg-transparent px-3 py-3 text-right font-sans-neue text-[0.8125rem] tabular-nums shadow-none outline-none ring-0 transition-colors placeholder:text-muted-foreground hover:bg-foreground/[0.04] focus:bg-foreground/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                'decoration-amber-500/60 decoration-wavy underline-offset-4 dark:decoration-amber-400/60',
                showMarker && !focused && 'underline',
              )}
            />
          </TooltipTrigger>
        </span>
        {showMarker && (
          <EditedTooltipContent
            heading={`${kpi.label} — ${periodLabel}`}
            original={correction?.original}
            current={correction?.current}
            computed={outOfSyncComputed}
            grain={isFy ? 'annual' : 'quarterly'}
          />
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

// One KPI across the table's columns. Inline-editable cells when `edit` is
// given, read-only display otherwise. Custom KPIs carry a badge and (for
// managers) a remove affordance.
export function EditableKpiRow({
  kpi,
  columns,
  band,
  edit,
  onRemove,
}: {
  kpi: EditableKpi;
  columns: KpiPeriod[];
  band: boolean;
  edit?: {
    companyId: number;
    onSaved: () => void;
  };
  onRemove?: (kpi: EditableKpi) => void;
}) {
  const { cellBg, rowHover } = bandClasses(band);
  return (
    <TableRow className={cn(onRemove && 'group', cellBg, rowHover)}>
      <TableCell
        className={cn(
          STICKY_METRIC_COLUMN,
          'whitespace-nowrap pl-8 text-sm text-foreground/85',
          cellBg,
        )}
      >
        <span className="flex items-center gap-1.5">
          <KpiLabel label={kpi.label} description={kpi.description} />
          {kpi.isCustom && (
            <Badge variant="secondary" size="xs" className="font-normal">
              Custom
            </Badge>
          )}
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove ${kpi.label}`}
              onClick={() => onRemove(kpi)}
              className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </TableCell>
      {columns.map((col) =>
        edit ? (
          <TableCell key={col.key} className={cn('relative p-0', cellBg)}>
            <KpiValueCell
              kpi={kpi}
              companyId={edit.companyId}
              year={col.year}
              quarter={col.quarter}
              month={col.month}
              onSaved={edit.onSaved}
            />
          </TableCell>
        ) : (
          <TableCell
            key={col.key}
            className="whitespace-nowrap text-right font-sans-neue text-[0.8125rem] tabular-nums"
          >
            {(() => {
              const dv = customDisplayValue(
                kpi,
                col.year,
                col.quarter,
                col.month,
              );
              return dv ? (
                formatKpiDisplay(kpi.valueType, dv.numeric, dv.text)
              ) : (
                <span className="text-muted-foreground">–</span>
              );
            })()}
          </TableCell>
        ),
      )}
    </TableRow>
  );
}
