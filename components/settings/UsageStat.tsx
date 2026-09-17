import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { QuestionMarkCircledIcon } from '@radix-ui/react-icons';
import { ReactNode } from 'react';

interface UsageStatProps {
  label: string;
  value: number | string;
  tooltip?: string;
  badge?: {
    label: string;
    variant?:
      | 'outline'
      | 'default'
      | 'secondary'
      | 'destructive'
      | 'notice'
      | 'user';
    size?: 'default' | 'sm';
  };
  suffix?: ReactNode;
  valueClassName?: string;
}

export function UsageStat({
  label,
  value,
  tooltip,
  badge,
  suffix,
  valueClassName,
}: UsageStatProps) {
  return (
    <Card className="p-4">
      <div className="flex flex-col space-y-2">
        <div className="-mt-0.5 flex h-4 items-center gap-2 text-xs leading-none">
          {label}
          {tooltip && (
            <TooltipProvider>
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <QuestionMarkCircledIcon className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent side="right" className="w-72">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {badge && (
            <Badge variant={badge.variant} size={badge.size}>
              {badge.label}
            </Badge>
          )}
        </div>
        <span className="!-mb-0.5 font-serif text-2xl leading-none">
          <span className={`${valueClassName || ''}`}>{value}</span>
          <span className="text-muted-foreground">{suffix}</span>
        </span>
      </div>
    </Card>
  );
}
