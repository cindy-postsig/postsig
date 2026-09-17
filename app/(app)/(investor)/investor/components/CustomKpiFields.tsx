'use client';

import { HelpCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  CUSTOM_KPI_VALUE_TYPES,
  type CustomKpiValueType,
} from '@/lib/v2/kpis/types';

const VALUE_TYPE_LABELS: Record<CustomKpiValueType, string> = {
  currency: 'Currency',
  number: 'Number',
  percent: 'Percent',
  text: 'Text',
};

export interface CustomKpiDraft {
  label: string;
  valueType: CustomKpiValueType;
  isFlow: boolean;
}

export const emptyCustomKpiDraft = (): CustomKpiDraft => ({
  label: '',
  valueType: 'number',
  isFlow: false,
});

// Text KPIs have no annual roll-up, so the flow choice doesn't apply to them.
export const customKpiDraftPayload = (draft: CustomKpiDraft) => ({
  label: draft.label.trim(),
  valueType: draft.valueType,
  isFlow: draft.valueType === 'text' ? false : draft.isFlow,
});

// The name / type / roll-up controls for a new custom KPI, shared by the
// company KPIs tab (as a table row) and the KPI settings page (as a card row)
// so the roll-up explanation is written once.
export function CustomKpiFields({
  draft,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: CustomKpiDraft;
  onChange: (draft: CustomKpiDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <Input
        autoFocus
        value={draft.label}
        onChange={(e) => onChange({ ...draft, label: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Metric name…"
        className="h-8 w-56"
      />
      <Select
        value={draft.valueType}
        onValueChange={(v) =>
          onChange({ ...draft, valueType: v as CustomKpiValueType })
        }
      >
        <SelectTrigger className="h-8 w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CUSTOM_KPI_VALUE_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {VALUE_TYPE_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {draft.valueType !== 'text' && (
        <div className="flex items-center gap-1.5">
          <Select
            value={draft.isFlow ? 'flow' : 'point'}
            onValueChange={(v) => onChange({ ...draft, isFlow: v === 'flow' })}
          >
            <SelectTrigger className="h-8 w-36" aria-label="Annual rollup">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="point">Point-in-time</SelectItem>
              <SelectItem value="flow">Cumulative</SelectItem>
            </SelectContent>
          </Select>
          <TooltipProvider>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="How the annual column is calculated"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p>
                  How the annual column is calculated. Cumulative adds up each
                  quarter (e.g. revenue, bookings); Point-in-time shows the
                  latest quarter (e.g. headcount, cash).
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </>
  );
}
