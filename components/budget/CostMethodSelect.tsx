'use client';

import { InfoCircledIcon } from '@radix-ui/react-icons';
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
  COST_METHODS,
  costMethodLabels,
  costMethodTooltips,
  type CostMethod,
} from './costMethod';

export function CostMethodSelect({
  method,
  onChange,
}: {
  method: CostMethod;
  onChange: (method: CostMethod) => void;
}) {
  // No label — the tooltip on the info icon names the control instead.
  return (
    <div className="flex items-center gap-2">
      <Select
        value={method}
        onValueChange={(value) => onChange(value as CostMethod)}
      >
        <SelectTrigger className="h-8 w-[150px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COST_METHODS.map((key) => (
            <SelectItem key={key} value={key} className="text-xs">
              {costMethodLabels[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <TooltipProvider>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <InfoCircledIcon className="h-4 w-4 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            <p className="font-medium mb-1">Cost Calculation Method</p>
            <p>
              <span className="font-medium">{costMethodLabels[method]}:</span>{' '}
              {costMethodTooltips[method]}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
