import { QuestionMarkCircledIcon } from '@radix-ui/react-icons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string;
  /**
   * Optional rich value content (e.g. an inline-editable value with a badge).
   * When provided it replaces the plain `value` text; `value` is still used as
   * the fallback when this is absent.
   */
  valueContent?: React.ReactNode;
  tooltip?: {
    title: string;
    description: string;
  };
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function MetricCard({
  title,
  value,
  valueContent,
  tooltip,
  size = 'md',
  className,
}: MetricCardProps) {
  const sizeStyles = {
    sm: {
      container: 'p-3 gap-2',
      title: 'text-[0.65rem]',
      value: 'text-lg',
    },
    md: {
      container: 'p-4 gap-3',
      title: 'text-[0.7rem]',
      value: 'text-xl',
    },
    lg: {
      container: 'p-4 gap-3',
      title: 'text-[0.75rem]',
      value: 'text-2xl',
    },
  };

  const styles = sizeStyles[size];

  return (
    <div
      className={cn(
        'flex flex-col justify-between rounded border border-border/30',
        'bg-gradient-to-tr from-primary/5 from-20% to-primary/15 dark:from-accent dark:to-secondary',
        styles.container,
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center gap-1 font-label uppercase tracking-wider',
          styles.title,
        )}
      >
        {title}
        {tooltip && (
          <TooltipProvider>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <QuestionMarkCircledIcon className="h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent side="top" className="w-72">
                <p className="font-semibold">{tooltip.title}</p>
                <p>{tooltip.description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <p className={cn('font-sans-neue !leading-none', styles.value)}>
        {valueContent ?? (value || '-')}
      </p>
    </div>
  );
}
