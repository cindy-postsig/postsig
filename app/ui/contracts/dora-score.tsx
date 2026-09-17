'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { CheckCircledIcon, CrossCircledIcon } from '@radix-ui/react-icons';

const DORA_COLORS = {
  failBg: 'bg-secondary',
  failBgDark: 'dark:bg-gray-700/30',
  failText: 'text-foreground/80',
  failTextDark: 'dark:text-foreground/80',
  failFill: 'bg-[#BC1E4E]',
  failDot: 'bg-pink-500',
  failBadge: 'bg-pink-100 text-pink-800 border-pink-200',

  successBg: 'bg-[#e2e9e5]',
  successBgDark: 'dark:bg-[#93e07e]/30',
  successText: 'text-[#003408]',
  successTextDark: 'dark:text-foreground',
  successDot: 'bg-[#008831]',
  successFill: 'bg-[#3AB949]',
  perfectDot: 'bg-green-500',
  perfectBadge: 'bg-green-100 text-green-800 border-green-200',

  // Yellow (medium) colors
  mediumFill: 'bg-[#D9BB14]',
  mediumDot: 'bg-yellow-500',
  mediumBadge: 'bg-amber-100 text-amber-800 border-amber-200',

  // Neutral and default colors
  emptyDot: 'bg-foreground/20',
  defaultDot: 'bg-primary',
  defaultBadge: 'bg-blue-100 text-blue-800 border-blue-200',
  defaultText: 'text-blue-800',
  defaultFill: 'bg-gray-700 dark:bg-primary',
};

interface DoraScoreProps {
  score?: number;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'dot' | 'badge' | 'progress';
  showLabel?: boolean;
  details?: Record<string, boolean>;
  showTooltip?: boolean;
}

export const categoryLabels: Record<string, string> = {
  productDescription: 'Product Description',
  vendorLocation: 'Vendor Location',
  dataIntegrity: 'Data Integrity',
  dataRecovery: 'Data Recovery',
  serviceLevelAgreement: 'Service Level Agreement',
  costMitigation: 'Incident Cost Mitigation',
  arbitrationAndConflictResolution: 'Conflict Resolution',
  timelyTermination: 'Timely Termination',
  securityAwareness: 'Security Awareness',
};

export const orderedCategories = [
  'productDescription',
  'vendorLocation',
  'dataIntegrity',
  'dataRecovery',
  'serviceLevelAgreement',
  'costMitigation',
  'arbitrationAndConflictResolution',
  'timelyTermination',
  'securityAwareness',
];

export const categoryDetails: Record<
  string,
  { fields: string[]; label: string }[]
> = {
  productDescription: [
    { fields: ['vendor_products_details'], label: 'Products Listed' },
    { fields: ['end_users'], label: 'End Users' },
    { fields: ['market_data_types'], label: 'Market Data Types' },
    { fields: ['internal_external_users'], label: 'Internal/External Users' },
    { fields: ['exclusivity_terms'], label: 'Exclusivity Terms' },
    { fields: ['activities'], label: 'Activities' },
  ],
  vendorLocation: [{ fields: ['vendor_location'], label: 'Vendor Location' }],
  dataIntegrity: [
    { fields: ['distribution_rights'], label: 'Distribution Rights' },
    { fields: ['geo_restrictions'], label: 'Geographic Restrictions' },
    { fields: ['derivative_works'], label: 'Derivative Works' },
  ],
  dataRecovery: [
    { fields: ['data_disposal_tnc'], label: 'Data Disposal T&C' },
    { fields: ['audit_requirements'], label: 'Audit Requirements' },
    { fields: ['suspension_of_service'], label: 'Suspension of Service' },
    { fields: ['cancellation_process'], label: 'Cancellation Process' },
  ],
  serviceLevelAgreement: [
    { fields: ['service_level_agreements'], label: 'SLA Terms' },
  ],
  costMitigation: [{ fields: ['cost_mitigation'], label: 'Cost Mitigation' }],
  arbitrationAndConflictResolution: [
    {
      fields: ['arbitration_and_conflict_resolution'],
      label: 'Conflict Resolution',
    },
  ],
  timelyTermination: [
    { fields: ['cancel_by_date', 'cancel_date'], label: 'Cancellation Dates' },
  ],
  securityAwareness: [
    { fields: ['security_awareness'], label: 'Security Training' },
  ],
};

export const DoraCategoriesGrid = ({
  details = {},
  className,
  showSubcategories = false,
  contract,
}: {
  details: Record<string, boolean>;
  className?: string;
  showSubcategories?: boolean;
  contract?: any;
}) => (
  <div
    className={cn(
      'grid auto-rows-fr grid-cols-3 gap-[1px] overflow-hidden rounded font-sans',
      className,
    )}
  >
    {orderedCategories.map((category) => {
      const isSatisfied = details[category] || false;
      return (
        <div
          key={category}
          className={cn(
            'flex items-center justify-center p-4 text-center',
            isSatisfied
              ? cn(DORA_COLORS.successBg, DORA_COLORS.successBgDark)
              : cn(DORA_COLORS.failBg, DORA_COLORS.failBgDark),
          )}
        >
          <span
            className={cn(
              'text-xs leading-snug',
              isSatisfied
                ? cn(DORA_COLORS.successText, DORA_COLORS.successTextDark)
                : cn(DORA_COLORS.failText, DORA_COLORS.failTextDark),
            )}
          >
            {categoryLabels[category]}
          </span>
        </div>
      );
    })}
  </div>
);

export const DoraDetailedCategoriesGrid = ({
  details = {},
  contract,
  className,
  isSidePanelOpen = false,
}: {
  details: Record<string, boolean>;
  contract: any;
  className?: string;
  isSidePanelOpen?: boolean;
}) => (
  <div
    className={cn(
      'grid auto-rows-fr grid-cols-3 gap-[1px] overflow-hidden rounded',
      className,
    )}
  >
    {orderedCategories.map((category) => {
      const isSatisfied = details[category] || false;
      const subcategories = categoryDetails[category] || [];

      return (
        <div
          key={category}
          className={cn(
            'flex h-full flex-col p-5 px-6 pb-6',
            isSatisfied
              ? cn(DORA_COLORS.successBg, DORA_COLORS.successBgDark)
              : cn(DORA_COLORS.failBg, DORA_COLORS.failBgDark),
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <h3
              className={cn(
                'text-base',
                isSatisfied
                  ? cn(DORA_COLORS.successText, DORA_COLORS.successTextDark)
                  : cn(DORA_COLORS.failText, DORA_COLORS.failTextDark),
              )}
            >
              {categoryLabels[category]}
            </h3>
          </div>

          {subcategories.length > 0 && (
            <div
              className={`mt-2 grid gap-2 text-xs ${isSidePanelOpen ? 'grid-cols-1' : 'grid-cols-2'}`}
            >
              {subcategories.map((subcat, i) => {
                // Check if any of the fields in this subcategory have values
                const isFieldSatisfied = subcat.fields.some((field) => {
                  if (field === 'vendor_products_details') {
                    return contract?.vendor_products_details?.length > 0;
                  }
                  if (field === 'cancel_by_date' || field === 'cancel_date') {
                    return (
                      contract?.cancel_by_date ||
                      (contract?.cancel_date && contract.cancel_date.length > 0)
                    );
                  }

                  // For most fields, check if they exist and aren't empty
                  return (
                    contract?.[field] && String(contract[field]).trim() !== ''
                  );
                });

                return (
                  <div key={i} className="flex items-center leading-none">
                    {isFieldSatisfied ? (
                      <div
                        className={cn(
                          'mr-2 h-2 min-h-2 w-2 min-w-2 flex-shrink-0 rounded-full',
                          DORA_COLORS.successDot,
                        )}
                      ></div>
                    ) : (
                      <div
                        className={cn(
                          'mr-2 h-2 min-h-2 w-2 min-w-2 flex-shrink-0 rounded-full',
                          DORA_COLORS.emptyDot,
                        )}
                      ></div>
                    )}
                    <span
                      className={
                        isFieldSatisfied
                          ? 'text-foreground'
                          : 'text-foreground/70'
                      }
                    >
                      {subcat.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    })}
  </div>
);

export const DoraScoreIndicator = ({
  score,
  size = 'md',
  variant = 'progress',
  showLabel = true,
  details = {},
  showTooltip = true,
}: DoraScoreProps) => {
  if (score === undefined) return null;

  // Color classes based on score
  // Default to blue for most scores
  let dotColorClass = DORA_COLORS.defaultDot;
  let badgeColorClass = DORA_COLORS.defaultBadge;
  let textColorClass = DORA_COLORS.defaultText;
  let fillColorClass = DORA_COLORS.defaultFill;
  // Use a neutral color for empty bars regardless of score
  const emptyColorClass = DORA_COLORS.emptyDot;

  // Red for poor scores (1-3)
  if (score <= 3) {
    dotColorClass = DORA_COLORS.failDot;
    badgeColorClass = DORA_COLORS.failBadge;
    fillColorClass = DORA_COLORS.failFill;
  }
  // Yellow for medium scores (4-6)
  else if (score <= 7) {
    dotColorClass = DORA_COLORS.mediumDot;
    badgeColorClass = DORA_COLORS.mediumBadge;
    fillColorClass = DORA_COLORS.mediumFill;
  }
  // Green only for perfect scores (9/9)
  else if (score >= 8) {
    dotColorClass = DORA_COLORS.perfectDot;
    badgeColorClass = DORA_COLORS.perfectBadge;
    fillColorClass = DORA_COLORS.successFill;
  }

  // Size classes
  const dotSizes = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };

  const badgeSizes = {
    sm: 'h-6 w-6 text-xs',
    md: 'h-8 w-8 text-sm',
    lg: 'h-10 w-10 text-base',
  };

  const progressSizes = {
    sm: { bar: 'h-2 w-[3px]', text: 'text-xs', gap: 'gap-[1px]' },
    md: { bar: 'h-3 w-[3px]', text: 'text-sm', gap: 'gap-[2px]' },
    lg: { bar: 'h-7 w-1', text: 'text-3xl', gap: 'gap-[3px]' },
  };

  // Wrap indicator with hover card that shows on hover
  const wrapWithHoverCard = (content: React.ReactNode) => {
    if (!showTooltip) return content;

    return (
      <HoverCard openDelay={300} closeDelay={200}>
        <HoverCardTrigger asChild>
          <div>{content}</div>
        </HoverCardTrigger>
        <HoverCardContent className="w-auto max-w-[400px] p-4" side="right">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="font-medium text-base">DORA Score Breakdown</h4>
              <Badge
                variant={
                  score >= 7
                    ? 'outline'
                    : score >= 4
                      ? 'secondary'
                      : 'destructive'
                }
                className="text-xs"
              >
                {score}/9 Categories
              </Badge>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              The Digital Operational Resilience Act (DORA) requires contracts
              with ICT providers to cover these key categories.
            </p>
            <DoraCategoriesGrid details={details} />
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  };

  if (variant === 'dot') {
    const dotIndicator = (
      <div className="flex items-center gap-2">
        <div className={cn(`rounded-full`, dotSizes[size], dotColorClass)} />
        {showLabel && (
          <span className="font-medium text-sm">DORA: {score}/9</span>
        )}
      </div>
    );

    return wrapWithHoverCard(dotIndicator);
  }

  if (variant === 'progress') {
    const MAX_SCORE = 9;
    const progressBars = Array.from({ length: MAX_SCORE }).map((_, index) => {
      const isFilled = index < score;
      return (
        <div
          key={index}
          className={cn(
            progressSizes[size].bar,
            'rounded-[1px] transition-colors',
            isFilled ? fillColorClass : emptyColorClass,
          )}
        />
      );
    });

    const progressIndicator = (
      <div
        className={cn(
          '-ml-2 flex items-center rounded-sm px-2 py-1 font-sans-neue',
          showTooltip && 'hover:bg-hover dark:hover:bg-secondary',
        )}
      >
        <span className={cn('font-medium mr-2', progressSizes[size].text)}>
          {score}
          <span className="text-xs text-foreground/40">/9</span>
        </span>
        <div className={cn('flex', progressSizes[size].gap)}>
          {progressBars}
        </div>
      </div>
    );

    return wrapWithHoverCard(progressIndicator);
  }

  // Badge variant
  const badgeIndicator = (
    <div className="flex items-center gap-2">
      <Badge
        variant="outline"
        className={cn(
          `font-medium flex items-center justify-center px-0 pt-0.5 font-mono`,
          badgeSizes[size],
          badgeColorClass,
        )}
      >
        {score}/9
      </Badge>
      {showLabel && (
        <span className="text-sm text-muted-foreground">
          {score <= 3
            ? 'Low compliance'
            : score <= 6
              ? 'Medium compliance'
              : score === 9
                ? 'Perfect compliance'
                : 'Good compliance'}
        </span>
      )}
    </div>
  );

  return wrapWithHoverCard(badgeIndicator);
};
