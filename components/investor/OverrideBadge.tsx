'use client';

import {
  createContext,
  useContext,
  useId,
  useState,
  useTransition,
} from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { revertOverride } from '@/app/lib/actions/investor/overrides';
import { cn } from '@/lib/utils';
import { useDateFormat } from '@/hooks/useDateFormat';
import type { AppliedOverrideMeta } from '@/lib/v2/inv/overrides/applyOverrides';

/**
 * Lets an EditableValue nested inside an OverrideBadge report when its edit
 * popover opens, so the badge can suppress its hover tooltip while editing
 * (otherwise the two overlap and the tooltip re-appears over the popover).
 */
const EditingReporterContext = createContext<
  ((editing: boolean) => void) | null
>(null);

export function useReportEditing(): (editing: boolean) => void {
  const report = useContext(EditingReporterContext);
  // No-op when an EditableValue is rendered outside an OverrideBadge.
  return report ?? (() => {});
}

/** Stored override values are raw JSON; format them for the tooltip. */
type OverrideValue = AppliedOverrideMeta['overrideValue'];

interface OverrideBadgeProps {
  meta: AppliedOverrideMeta;
  /** Field label shown as the tooltip heading (e.g. "My Entry Cost"). */
  label: string;
  /** The displayed value; underlined and made the tooltip's hover target. */
  children: React.ReactNode;
  /** Underline/value edge in left- vs right-aligned cells. */
  align?: 'start' | 'end';
  /**
   * Render the raw stored original/new values the same way the cell shows them
   * (e.g. fraction → percent, signed amount → $). Defaults to String().
   */
  formatValue?: (value: OverrideValue) => string;
  onReverted?: () => void;
}

// Shared amber wavy underline used to flag overridden (OverrideBadge) and
// recomputed (RecomputedMarker) values, so both signals read as the same visual
// family. Rendered as its own SVG rule (not a text-decoration) so it shows
// regardless of how the value renders — many values are wrapped in an
// inline-flex EditableValue trigger, which text-decoration can't paint over.
// Tiles a wave via an SVG pattern and colours it with currentColor.
function WavyUnderline() {
  const patternId = useId();
  return (
    <svg
      aria-hidden
      className="pointer-events-none block h-full w-full select-none text-amber-500/60 dark:text-amber-400/60"
    >
      <pattern
        id={patternId}
        width={8}
        height={4}
        patternUnits="userSpaceOnUse"
      >
        <path
          d="M0 2 Q2 0.5 4 2 Q6 3.5 8 2"
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
        />
      </pattern>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}

/**
 * Stacks a value over its override/recomputed underline. Shrinks to the value's
 * width (inline-flex) so the underline spans the value, not the whole cell —
 * `align` sets which edge it hugs in left- vs right-aligned cells.
 */
function OverrideMarker({
  children,
  align = 'start',
}: {
  children: React.ReactNode;
  align?: 'start' | 'end';
}) {
  return (
    <span
      className={cn(
        // Gap in em so it scales with the value's font size — the same marker
        // renders on large metric cards (text-2xl) and small table cells.
        'relative inline-flex flex-col pb-[0.2em]',
        align === 'end' ? 'items-end' : 'items-start',
      )}
    >
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1"
      >
        <WavyUnderline />
      </span>
    </span>
  );
}

export function OverrideBadge({
  meta,
  label,
  children,
  align = 'start',
  formatValue = String,
  onReverted,
}: OverrideBadgeProps) {
  const { formatDate } = useDateFormat();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  // Suppress the hover tooltip entirely while the edit popover is open so the
  // two don't overlap; resume normal hover control once editing closes.
  const tooltipOpen = editing ? false : open;

  function handleRevert() {
    startTransition(async () => {
      const result = await revertOverride(meta.overrideId);
      if ('error' in result) {
        toast({
          title: 'Revert failed',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }
      toast({ title: 'Override reverted' });
      setOpen(false);
      onReverted?.();
    });
  }

  return (
    <EditingReporterContext value={setEditing}>
      <TooltipProvider>
        <Tooltip
          open={tooltipOpen}
          onOpenChange={(next) => {
            // While editing, the tooltip is force-closed; ignore hover-driven
            // opens so it can't reappear over the popover.
            if (editing) return;
            setOpen(next);
          }}
          delayDuration={200}
        >
          <TooltipTrigger asChild>
            <span
              role="note"
              aria-label={`Edited value: ${label}`}
              className="cursor-default"
            >
              <OverrideMarker align={align}>{children}</OverrideMarker>
            </span>
          </TooltipTrigger>

          <TooltipContent side="top" className="w-60 text-left text-xs">
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-px">
                <span className="font-medium leading-tight">{label}</span>
                <span className="text-[0.7rem] text-white/55">
                  Edited as of {formatDate(meta.createdAt)}
                </span>
              </div>

              <div className="flex items-baseline gap-1.5 tabular-nums">
                <span className="text-white/45 line-through">
                  {meta.originalValue == null
                    ? '—'
                    : formatValue(meta.originalValue)}
                </span>
                <span className="text-white/35">→</span>
                <span className="font-semibold text-white">
                  {formatValue(meta.overrideValue)}
                </span>
              </div>

              {meta.reason ? (
                <p className="leading-snug text-white/70">“{meta.reason}”</p>
              ) : null}

              <Button
                size="sm"
                variant="ghost"
                className="font-normal -ml-1.5 h-7 w-fit px-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white"
                disabled={isPending}
                onClick={handleRevert}
              >
                {isPending ? 'Reverting…' : 'Revert to original'}
              </Button>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </EditingReporterContext>
  );
}

/**
 * A displayed value that carries an override badge when one applies, otherwise
 * the bare value. Keeps call sites free of the meta && … ternary.
 */
export function OverridableValue({
  meta,
  label,
  children,
  align = 'start',
  formatValue,
  onReverted,
}: {
  meta: AppliedOverrideMeta | undefined;
  label: string;
  children: React.ReactNode;
  align?: 'start' | 'end';
  formatValue?: (value: OverrideValue) => string;
  onReverted?: () => void;
}) {
  if (!meta) return <>{children}</>;
  return (
    <OverrideBadge
      meta={meta}
      label={label}
      align={align}
      formatValue={formatValue}
      onReverted={onReverted}
    >
      {children}
    </OverrideBadge>
  );
}

/**
 * Marks a computed metric (e.g. My FMV, MOIC) that was recalculated because an
 * underlying input was overridden. Unlike OverrideBadge there is no single
 * original value or revert target — you revert the edited input instead. The
 * value itself is the hover target so the marker is easy to reach.
 */
export function RecomputedMarker({
  children,
  align = 'start',
}: {
  children: React.ReactNode;
  align?: 'start' | 'end';
}) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <span
            role="note"
            aria-label="Recalculated from edited inputs"
            className="cursor-default"
          >
            <OverrideMarker align={align}>{children}</OverrideMarker>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="w-56 text-left text-xs">
          Recalculated from edited inputs.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
