'use client';

import { useContext, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { UserContext } from '@/app/userProvider';
import {
  ReceiptText,
  CalendarClock,
  TrendingUp,
  PieChart,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';

interface WelcomeMessageProps {
  onSelectPrompt: (prompt: string) => void;
  isFullscreen: boolean;
  /** Composer slot rendered under the greeting, above the suggested prompts. */
  composer?: ReactNode;
}

interface SuggestedPrompt {
  label: string;
  prompt: string;
  subtext: string;
  icon: LucideIcon;
}

const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  {
    label: 'Budget Management',
    prompt: 'What is my total [tag] spend?',
    subtext: 'Track spend by function, business sponsor, department, etc.',
    icon: ReceiptText,
  },
  {
    label: 'Renewal Control & Leverage',
    prompt: 'Which renewals require action?',
    subtext: 'Prevent lock-in before negotiating leverage disappears.',
    icon: CalendarClock,
  },
  {
    label: 'Budget Drift Detection',
    prompt: 'Which contracts have annual increases?',
    subtext: 'Surface hidden budget drift before it compounds.',
    icon: TrendingUp,
  },
  {
    label: 'Spend Concentration',
    prompt: 'Analyze vendor concentration risk',
    subtext: 'Understand financial dependency and negotiation exposure.',
    icon: PieChart,
  },
  {
    label: 'Compliance Risks',
    prompt: 'Which contracts have AI related restrictions?',
    subtext: 'Understand usage restrictions for compliance.',
    icon: ShieldAlert,
  },
];

function PromptCard({
  item,
  onSelect,
  compact,
}: {
  item: SuggestedPrompt;
  onSelect: (prompt: string) => void;
  compact?: boolean;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={() => onSelect(item.prompt)}
      className={cn(
        'group flex w-full items-center gap-2 rounded border border-border/70 bg-card/60 text-left font-sans transition-colors hover:bg-card/30 dark:bg-gray-700/10 dark:hover:bg-secondary/50',
        compact ? 'p-2' : 'p-2',
      )}
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-[#2296F3]/10 text-[#2296F3]">
        <Icon className="size-4" />
      </span>
      <span
        className={cn(
          'font-normal text-foreground opacity-80 transition-opacity group-hover:opacity-100',
          compact ? 'text-sm leading-tight' : 'text-[0.85rem] leading-tight',
        )}
      >
        {item.prompt}
      </span>
    </button>
  );
}

export function WelcomeMessage({
  onSelectPrompt,
  isFullscreen,
  composer,
}: WelcomeMessageProps) {
  const userContext = useContext(UserContext);
  const firstName = userContext?.userMetadata?.userProfile?.name
    ?.trim()
    .split(/\s+/)[0];
  return (
    <div className="flex flex-1 items-center justify-center">
      <div
        className={cn(
          'space-y-10 text-center',
          isFullscreen ? 'max-w-3xl min-[1920px]:max-w-5xl' : 'max-w-md',
        )}
      >
        {/* Header */}
        <div className="space-y-4">
          <div className="space-y-2">
            <h1 className={cn('font-normal', isFullscreen ? '' : 'text-2xl')}>
              Hi, {firstName || 'there'}
            </h1>
            <h3
              className={cn(
                'text-balance font-serif text-foreground/80',
                isFullscreen ? 'text-xl' : 'max-w-sm text-xl',
              )}
            >
              Explore your contracts with LineageAI
              <sup className="-top-2 text-xs">TM</sup> Assistant.
              {isFullscreen && <br />} Get Insights, Reports, Navigation, and
              more.
            </h3>
          </div>
        </div>

        {composer && <div className="text-left">{composer}</div>}

        {/* Suggested Prompts */}
        <div className="space-y-3">
          <div
            className={cn(
              'grid gap-2',
              isFullscreen
                ? 'grid-cols-2 min-[1920px]:grid-cols-3'
                : 'grid-cols-1',
            )}
          >
            {SUGGESTED_PROMPTS.map((item, idx) => (
              <PromptCard
                key={idx}
                item={item}
                onSelect={onSelectPrompt}
                compact={!isFullscreen}
              />
            ))}
          </div>
        </div>
        {isFullscreen && (
          <div className="space-x-6 text-[10px] text-muted-foreground opacity-85">
            <span className="space-x-1.5">
              <span className="rounded-sm border border-foreground/30 px-1">
                ESC
              </span>
              <span>close</span>
            </span>
            <span className="space-x-1.5">
              <span className="rounded-sm border border-foreground/30 px-1">
                ⌘K
              </span>
              <span>sidebar</span>
            </span>
            <span className="space-x-1.5">
              <span className="rounded-sm border border-foreground/30 px-1">
                ⌘⇧K
              </span>
              <span>fullscreen</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
