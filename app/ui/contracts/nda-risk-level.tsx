'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

// Using the same color scheme as DORA score for consistency
const NDA_RISK_COLORS = {
  // Green (low risk - 0 flags)
  greenFill: 'bg-[#3AB949]',

  // Amber (medium risk - 1-3 flags)
  amberFill: 'bg-[#D9BB14]',

  // Red (high risk - 4+ flags)
  redFill: 'bg-[#BC1E4E]',

  // Neutral colors
  emptyDot: 'bg-foreground/20',
};

interface NdaRiskLevelProps {
  riskLevel?: 1 | 2 | 3;
  riskFlags?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  ndaInsights?: Record<string, boolean>;
  showTooltip?: boolean;
}

const riskFlagLabels: Record<string, string> = {
  broad_confidentiality_definition: 'Broad Confidentiality Definition',
  no_time_limit: 'No Time Limit on Confidentiality',
  excessive_scope: 'Excessive Scope of Confidential Information',
  inadequate_return_destruction: 'Inadequate Return/Destruction Clause',
  unilateral_obligations: 'Unilateral Obligations',
  broad_injunctive_relief: 'Broad Injunctive Relief',
  unlimited_liability: 'Unlimited Liability Exposure',
  perpetual_nda: 'Perpetual NDA',
  unilateral_nda: 'Unilateral NDA',
  non_solicitation: 'Non-Solicitation',
  'non-solicitation': 'Non-Solicitation',
  uncapped_liability: 'Uncapped Liability',
  foreign_jurisdiction: 'Foreign Jurisdiction',
  no_carve_out_provisions: 'No Carve-Out Provisions',
  post_end_of_term_obligations: 'Post-Term Obligations',
};

export const NdaRiskLevelIndicator = ({
  riskLevel = 1,
  riskFlags = 0,
  size = 'md',
  showLabel = true,
  ndaInsights = {},
  showTooltip = true,
}: NdaRiskLevelProps) => {
  // Determine colors based on risk level
  let fillColorClass = NDA_RISK_COLORS.greenFill;

  if (riskLevel === 3) {
    fillColorClass = NDA_RISK_COLORS.redFill;
  } else if (riskLevel === 2) {
    fillColorClass = NDA_RISK_COLORS.amberFill;
  }

  // Size classes
  const circlesSizes = {
    sm: { circle: 'h-2 w-2', text: 'text-xs', gap: 'gap-1' },
    md: { circle: 'h-[10px] w-[10px]', text: 'text-sm', gap: 'gap-1' },
    lg: { circle: 'h-4 w-4', text: 'text-base', gap: 'gap-2' },
  };

  // Determine number of circles to show based on risk level (1, 2, or 3)
  const circleCount = riskLevel;

  // Wrap indicator with hover card that shows risk flags
  const wrapWithHoverCard = (content: React.ReactNode) => {
    if (!showTooltip) return content;

    const riskFlagsList = Object.entries(ndaInsights || {})
      .filter(([_, value]) => value === true)
      .map(([key, _]) => riskFlagLabels[key] || key);

    return (
      <HoverCard openDelay={300} closeDelay={200}>
        <HoverCardTrigger asChild>
          <div>{content}</div>
        </HoverCardTrigger>
        <HoverCardContent className="w-auto max-w-[400px] p-4" side="right">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="font-medium text-base">
                {riskLevel === 1 && 'Low Risk'}
                {riskLevel === 2 && 'Medium Risk'}
                {riskLevel === 3 && 'High Risk'}
              </h4>
              <Badge
                variant={
                  riskLevel === 1
                    ? 'outline'
                    : riskLevel === 2
                      ? 'secondary'
                      : 'destructive'
                }
                className="text-xs"
              >
                {riskFlags}
              </Badge>
            </div>

            {riskFlagsList.length > 0 && (
              <div>
                <h5 className="font-medium mb-2 text-xs">Identified Risks</h5>
                <ul className="space-y-1">
                  {riskFlagsList.map((flag, index) => (
                    <li key={index} className="flex items-center text-xs">
                      <div
                        className={cn(
                          'mr-2 h-1.5 w-1.5 rounded-full',
                          fillColorClass,
                        )}
                      />
                      {flag}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {riskFlagsList.length === 0 && riskLevel === 1 && (
              <p className="text-xs text-muted-foreground">
                No issues identified in this NDA.
              </p>
            )}
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  };

  // Default to circles variant
  const circles = Array.from({ length: 3 }).map((_, index) => {
    const isFilled = index < circleCount;
    return (
      <div
        key={index}
        className={cn(
          circlesSizes[size].circle,
          'rounded-full transition-colors',
          isFilled ? fillColorClass : NDA_RISK_COLORS.emptyDot,
        )}
      />
    );
  });

  const circlesIndicator = (
    <div
      className={cn(
        '-ml-2 flex items-center rounded-sm px-2 py-1 font-sans-neue',
        showTooltip && 'hover:bg-hover dark:hover:bg-secondary',
      )}
    >
      {showLabel && (
        <span className={cn('font-medium mr-2', circlesSizes[size].text)}>
          {riskLevel === 1 && 'Low'}
          {riskLevel === 2 && 'Med'}
          {riskLevel === 3 && 'High'}
        </span>
      )}
      <div className={cn('flex', circlesSizes[size].gap)}>{circles}</div>
    </div>
  );

  return wrapWithHoverCard(circlesIndicator);
};
