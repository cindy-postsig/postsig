import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '../ui/badge';
import { generateShortLabel } from '@/lib/amendments/hierarchyUtils';

interface ContractLabelProps {
  name: string | undefined;
  shorten?: boolean;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  size?: 'xs' | 'sm';
  showTooltip?: boolean;
  /**
   * Replaces the rendered text while keeping `name` as the tooltip — used to
   * show the sibling-indexed local id (`SO-1`) instead of the bare type
   * shorthand (`SO`).
   */
  labelOverride?: string;
}

const ContractLabel: React.FC<ContractLabelProps> = ({
  name,
  shorten = false,
  variant = 'outline',
  size = 'sm',
  showTooltip = true,
  labelOverride,
}) => {
  if (!name) {
    return null;
  }

  const label = labelOverride || (shorten ? generateShortLabel(name) : name);

  const sizeClasses = {
    xs: 'text-[0.625rem]',
    sm: 'text-[0.7rem]',
  };

  const badge = (
    <Badge variant={variant} className={`${sizeClasses[size]} leading-tight`}>
      {label}
    </Badge>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={100}>
        <TooltipTrigger>{badge}</TooltipTrigger>
        <TooltipContent>
          <p>{name}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ContractLabel;
