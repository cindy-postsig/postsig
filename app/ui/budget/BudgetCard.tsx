import { QuestionMarkCircledIcon } from '@radix-ui/react-icons';
import { formatCurrency } from '@/app/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ChangeDisplay } from './ChangeDisplay';

interface BudgetCardProps {
  title: string;
  tooltipTitle: string;
  tooltipDescription: string;
  amount: number;
  previousAmount?: number; // New prop to calculate change
  className?: string;
}

export const BudgetCard: React.FC<BudgetCardProps> = ({
  title,
  tooltipTitle,
  tooltipDescription,
  amount,
  previousAmount,
  className = 'bg-navy',
}) => {
  // Determine whether to use ChangeDisplay or legacy display method
  const useChangeDisplay = previousAmount !== undefined;

  return (
    <div
      className={`w-1/2 rounded border border-border/50 bg-gradient-to-tr from-0% p-5 text-foreground dark:from-accent dark:to-secondary ${className}`}
    >
      <div className="flex items-end gap-1 font-sans text-sm leading-none">
        {title}
        <TooltipProvider>
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <QuestionMarkCircledIcon />
            </TooltipTrigger>
            <TooltipContent side="right" className="w-72">
              <p>
                <strong>{tooltipTitle}</strong>
              </p>
              <p>{tooltipDescription}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="font-extralight mt-6 font-serif text-3xl">
        {amount ? (
          formatCurrency(amount)
        ) : (
          <span className="text-white text-opacity-30">$0</span>
        )}

        {/* Use ChangeDisplay component when previousAmount is provided */}
        {useChangeDisplay && previousAmount !== undefined && (
          <ChangeDisplay
            currentValue={previousAmount}
            newValue={amount}
            size="md"
          />
        )}
      </div>
    </div>
  );
};
