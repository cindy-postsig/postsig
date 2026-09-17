import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { InfoCircledIcon } from '@radix-ui/react-icons';
import { ViewMode } from '@/app/lib/budget/priceHistoryChartUtils';

interface ViewModeTooltipProps {
  viewMode: ViewMode;
}

const tooltipContent: Record<ViewMode, string> = {
  renewals:
    'Displays contracts renewing or starting in the selected fiscal year. Auto renewals use cancel-by date when available.',
  actualCost:
    'Actual Cost View displays the costs of the contract when they are due per the billing terms of each contract.',
  amortized:
    'Amortized View displays the cost of the contract broken out in even amounts for each month during the term of a contract.',
};

export function ViewModeTooltip({ viewMode }: ViewModeTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <InfoCircledIcon className="ml-1 h-4 w-4 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          {tooltipContent[viewMode]}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
