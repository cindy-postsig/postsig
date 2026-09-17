import React from 'react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/date-format';

type DateDisplayVariant = 'date' | 'daysRemaining';

interface DateDisplayProps {
  date: string | Date | null;
  variant?: DateDisplayVariant;
  alertRange?: number;
  className?: string;
  /** date-fns pattern used to render the displayed date. */
  formatPattern?: string;
}

/**
 * Calculates days remaining until a date
 */
export function calculateDaysRemaining(
  date: string | Date | null,
): number | null {
  if (!date) return null;

  const parsedDate = date instanceof Date ? date : new Date(date);
  if (isNaN(parsedDate.getTime())) return null;

  return Math.ceil(
    (parsedDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
  );
}

/**
 * Unified component for displaying dates with warning colors
 * @param date - The date to display
 * @param variant - 'date' shows formatted date, 'daysRemaining' shows "X days" text
 * @param alertRange - Number of days threshold for warning color (default: 90 for date, 7 for daysRemaining)
 */
export function DateDisplay({
  date,
  variant = 'date',
  alertRange,
  className,
  formatPattern,
}: DateDisplayProps): React.JSX.Element | null {
  if (!date) return null;

  const parsedDate = date instanceof Date ? date : new Date(date);

  // Check if date is valid
  if (isNaN(parsedDate.getTime())) {
    return <>{date.toString()}</>;
  }

  const daysRemaining = calculateDaysRemaining(date);
  if (daysRemaining === null) return null;

  // Set default alert range based on variant
  const threshold = alertRange ?? (variant === 'daysRemaining' ? 7 : 90);
  const isWarning = daysRemaining <= threshold;
  const isExpired = daysRemaining < 0;

  // Render based on variant
  if (variant === 'daysRemaining') {
    if (isExpired) {
      return (
        <span className={cn('text-muted-foreground', className)}>Expired</span>
      );
    }

    const displayText = daysRemaining === 1 ? '1 day' : `${daysRemaining} days`;

    return (
      <span
        className={cn(isWarning && 'font-medium text-[#B90C41]', className)}
      >
        {displayText}
      </span>
    );
  }

  // Default 'date' variant
  const displayText = formatPattern
    ? formatDate(date, formatPattern, date.toString())
    : date.toString();

  return (
    <span
      className={cn(
        isWarning && 'text-[#c52e50]',
        'whitespace-nowrap',
        className,
      )}
    >
      {displayText}
    </span>
  );
}

/**
 * @deprecated Use DateDisplay component with variant="date" instead
 * Kept for backwards compatibility
 */
export function getWarningDate(
  date: string | Date | null,
  alertRange = 90,
): React.JSX.Element | null {
  return <DateDisplay date={date} variant="date" alertRange={alertRange} />;
}
