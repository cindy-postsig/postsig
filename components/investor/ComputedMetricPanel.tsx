'use client';

import { useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EditableValue, fractionToPercentDisplay } from './EditableValue';
import { OverridableValue } from './OverrideBadge';
import { getMetricInputFields } from '@/lib/v2/inv/overrides/registry';
import type { ValuationOverrides } from '@/lib/v2/inv/overrides/mergeValuation';

type FormulaToken =
  | { kind: 'term'; label: string }
  | { kind: 'op'; symbol: string };

type FormulaBody =
  | { type: 'expr'; tokens: FormulaToken[] }
  | {
      type: 'fraction';
      numerator: FormulaToken[];
      denominator: FormulaToken[];
    };

interface MetricFormula {
  result: string;
  body: FormulaBody;
}

// How each computed metric is derived, shown under the panel title so the user
// understands what the editable inputs feed into. Keep in sync with the formulas
// in lib/v2/inv/transforms.ts / overrides/mergeValuation.ts.
const METRIC_FORMULAS: Record<string, MetricFormula> = {
  my_fmv: {
    result: 'My FMV',
    body: {
      type: 'expr',
      tokens: [
        { kind: 'term', label: 'My FD%' },
        { kind: 'op', symbol: '×' },
        { kind: 'term', label: 'Post-Money Valuation' },
      ],
    },
  },
  moic: {
    result: 'MOIC',
    body: {
      type: 'fraction',
      numerator: [
        { kind: 'term', label: 'My FMV' },
        { kind: 'op', symbol: '+' },
        { kind: 'term', label: 'Realized Proceeds' },
      ],
      denominator: [{ kind: 'term', label: 'Aggregate Cost' }],
    },
  },
};

function FormulaBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border border-border bg-background px-1.5 py-1 font-mono text-[11px] leading-none text-foreground">
      {children}
    </span>
  );
}

function FormulaTokenRow({ tokens }: { tokens: FormulaToken[] }) {
  return (
    <span className="flex items-center justify-center gap-1.5">
      {tokens.map((token, i) =>
        token.kind === 'term' ? (
          <FormulaBadge key={i}>{token.label}</FormulaBadge>
        ) : (
          <span key={i} className="font-mono text-base">
            {token.symbol}
          </span>
        ),
      )}
    </span>
  );
}

function MetricFormulaDisplay({ formula }: { formula: MetricFormula }) {
  return (
    <span className="mt-1 flex justify-center rounded bg-muted py-3">
      <span className="flex items-center gap-4">
        <FormulaBadge>{formula.result}</FormulaBadge>
        <span className="font-mono text-base">=</span>
        {formula.body.type === 'expr' ? (
          <FormulaTokenRow tokens={formula.body.tokens} />
        ) : (
          <span className="flex flex-col items-center gap-2">
            <FormulaTokenRow tokens={formula.body.numerator} />
            <span className="h-px w-full bg-foreground" />
            <FormulaTokenRow tokens={formula.body.denominator} />
          </span>
        )}
      </span>
    </span>
  );
}

interface ComputedMetricPanelProps {
  metricKey: string;
  metricLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Snapshot entity id — required so EditableValue can create overrides. */
  snapshotId: number | null;
  /** Current raw values for the input fields (keyed by fieldKey). */
  currentValues: Record<string, number | string>;
  valuationOverrides: ValuationOverrides;
  onSaved?: () => void;
}

export function ComputedMetricPanel({
  metricKey,
  metricLabel,
  open,
  onOpenChange,
  snapshotId,
  currentValues,
  valuationOverrides,
  onSaved,
}: ComputedMetricPanelProps) {
  const inputFields = getMetricInputFields(metricKey);
  // Portal the inner edit popovers into the dialog node so clicking them isn't
  // treated as an interaction outside the modal dialog (which dismisses it).
  // Callback ref + state so children re-render once the node is attached.
  const [dialogNode, setDialogNode] = useState<HTMLDivElement | null>(null);

  if (!inputFields) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={setDialogNode}>
        <DialogHeader>
          <DialogTitle className="font-medium text-base">
            {metricLabel} inputs
          </DialogTitle>
          {METRIC_FORMULAS[metricKey] && (
            <DialogDescription>
              <MetricFormulaDisplay formula={METRIC_FORMULAS[metricKey]} />
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-col divide-y divide-border">
          {inputFields.map((field) => {
            if (field.entityType !== 'inv_cap_table_snapshot' || !snapshotId) {
              return null;
            }
            const raw = currentValues[field.fieldKey];
            const meta =
              valuationOverrides.fields[
                field.fieldKey as keyof typeof valuationOverrides.fields
              ];

            return (
              <div
                key={field.fieldKey}
                className="flex items-center justify-between py-2"
              >
                <span className="text-xs">{field.label}</span>
                <span className="flex items-center gap-1 text-sm tabular-nums">
                  <OverridableValue
                    meta={meta}
                    label={field.label}
                    align="end"
                    formatValue={(v) =>
                      field.displayAsPercent && typeof v === 'number'
                        ? `${fractionToPercentDisplay(v)}%`
                        : String(v)
                    }
                    onReverted={onSaved}
                  >
                    <EditableValue
                      fieldDef={field}
                      entityId={snapshotId}
                      currentRawValue={raw ?? 0}
                      onSaved={onSaved}
                      container={dialogNode}
                      persistentPencil
                    >
                      {raw == null
                        ? '—'
                        : field.displayAsPercent && typeof raw === 'number'
                          ? `${fractionToPercentDisplay(raw)}%`
                          : String(raw)}
                    </EditableValue>
                  </OverridableValue>
                </span>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
