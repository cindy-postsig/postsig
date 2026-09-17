import {
  QuestionMarkCircledIcon,
  ChevronRightIcon,
} from '@radix-ui/react-icons';
import { formatCurrency } from '@/app/lib/utils';
import Link from 'next/link';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ChangeDisplay } from '@/app/ui/budget/ChangeDisplay';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * The gradient shell the summary-style cards share. Exported so a card that is
 * not a title-and-amount — a scrolling list, say — sits in the same chrome
 * without restating it.
 */
export const SUMMARY_CARD_SHELL =
  'flex h-full flex-col rounded border border-border/30 bg-gradient-to-tr from-primary/5 from-20% to-primary/15 dark:from-accent dark:to-secondary';

interface SummaryCardProps {
  title: string;
  description?: string;
  /** Omit when passing `value`. */
  amount?: number;
  /** A non-currency headline (a count, a ratio) in place of the formatted amount. */
  value?: React.ReactNode;
  /** Org base display currency for the amount; defaults to USD. */
  currency?: string;
  previousAmount?: number;
  tooltip?: {
    title: string;
    description: string;
  };
  href?: string;
  moreText?: string;
  isDarkBackground?: boolean;
  bgColor?: string;
  textColor?: string;
  width?: string;
  className?: string;
  secondaryText?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Renders a skeleton in place of the amount — a real 0 and a not-yet-loaded
   *  value both render as $0 otherwise, which reads as data rather than delay. */
  isLoading?: boolean;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({
  title,
  description,
  amount,
  value,
  currency,
  previousAmount,
  tooltip,
  href,
  moreText,
  isDarkBackground = false,
  bgColor = 'from-primary/5 to-primary/15',
  textColor = '',
  className = '',
  secondaryText,
  size = 'md',
  isLoading = false,
}) => {
  // Determine size-based styles
  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return {
          container: 'p-3',
          title: 'text-xs',
          amount: 'text-lg md:text-2xl',
          description: 'text-xs',
          iconSize: 'h-3 w-3',
          gap: 'gap-1',
          skeleton: 'h-6 w-24',
        };
      case 'lg':
        return {
          container: 'p-4',
          title: 'text-[0.8rem]',
          amount: 'text-[1.75rem] 3xl:text-[1.75rem] leading-[2rem]',
          description: 'text-[0.8rem]',
          iconSize: 'h-3 w-3',
          gap: 'gap-5',
          skeleton: 'h-7 w-40',
        };
      case 'md':
      default:
        return {
          container: 'p-4',
          title: 'text-[0.8rem]',
          amount: 'text-[1.75rem] 3xl:text-[1.75rem] leading-[2rem]',
          description: 'text-[0.8rem]',
          iconSize: 'h-3 w-3',
          gap: 'gap-2',
          skeleton: 'h-7 w-40',
        };
    }
  };

  const sizeStyles = getSizeStyles();

  // cn, not concatenation: bgColor repeats the shell's own tint by default, and
  // a caller passing a different one has to actually win.
  const cardClassName = cn(
    SUMMARY_CARD_SHELL,
    sizeStyles.container,
    bgColor,
    textColor,
    className,
  );

  const content = (
    <div className={`flex h-full flex-col justify-between ${sizeStyles.gap}`}>
      {/* Title and headline stay one block: in a grid row stretched by a
          taller sibling, justify-between would otherwise sink the headline. */}
      <div className={`flex flex-col ${sizeStyles.gap}`}>
        <div
          className={`flex items-end gap-1 font-sans ${sizeStyles.title} leading-none`}
        >
          {title}
          {tooltip && (
            <TooltipProvider>
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <QuestionMarkCircledIcon className={sizeStyles.iconSize} />
                </TooltipTrigger>
                <TooltipContent side="right" className="w-72">
                  <p>
                    <strong>{tooltip.title}</strong>
                  </p>
                  <p>{tooltip.description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <div
          className={`font-extralight mt-[1px] flex items-end font-serif ${sizeStyles.amount}`}
        >
          {isLoading ? (
            // Skeleton's default bg-muted disappears into the card's tinted
            // gradient, so tint from the foreground instead — same light/dark
            // split the $0 fallback below uses.
            <Skeleton
              className={`${sizeStyles.skeleton} ${
                isDarkBackground ? 'bg-white/25' : 'bg-gray-700/20'
              }`}
            />
          ) : value !== undefined ? (
            value
          ) : amount ? (
            <>
              {formatCurrency(amount, currency)}
              {previousAmount !== undefined &&
                previousAmount !== 0 &&
                amount !== undefined &&
                amount !== previousAmount &&
                size !== 'sm' && (
                  <ChangeDisplay
                    currentValue={previousAmount}
                    newValue={amount}
                    currency={currency}
                    size="md"
                    showArrow={true}
                    showAmount={true}
                    inline={true}
                    isDarkBackground={isDarkBackground}
                    className="ml-2"
                  />
                )}
            </>
          ) : (
            <span
              className={
                isDarkBackground ? 'text-white/30' : 'text-gray-700/50'
              }
            >
              {formatCurrency(0, currency)}
            </span>
          )}
        </div>
      </div>

      {description && (
        <div
          className={`w-full font-sans-neue ${sizeStyles.description} leading-none ${isDarkBackground ? 'text-white/80' : 'text-gray-700'}`}
        >
          {description}
        </div>
      )}

      {secondaryText && (
        <div
          className={`mt-[2px] w-full font-sans text-xs leading-none ${isDarkBackground ? 'text-white/60' : 'text-gray-500'}`}
        >
          {secondaryText}
        </div>
      )}

      {previousAmount !== undefined &&
        previousAmount !== 0 &&
        amount !== undefined &&
        amount !== previousAmount &&
        size === 'sm' && (
          <div
            className={`flex w-full items-center text-xs ${isDarkBackground ? 'text-white/70' : 'text-gray-500'}`}
          >
            <ChangeDisplay
              currentValue={previousAmount}
              newValue={amount}
              currency={currency}
              size="sm"
              showArrow={true}
              showAmount={true}
              inline={false}
              isDarkBackground={isDarkBackground}
            />
          </div>
        )}

      {/* {moreText && (
        <div
          className={`font-normal mt-4 flex items-center border-t pt-2 text-xs ${isDarkBackground ? 'text-white/70' : 'text-gray-600'}`}
        >
          {moreText}
          <ChevronRightIcon className="ml-1" />
        </div>
      )} */}
    </div>
  );

  return href ? (
    <Link href={href} className={cardClassName}>
      {content}
    </Link>
  ) : (
    <div className={cardClassName}>{content}</div>
  );
};
