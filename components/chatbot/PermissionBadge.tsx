'use client';

import type { PermissionLevel } from '@/lib/v2/chat/client';
import { cn } from '@/lib/utils';

interface PermissionBadgeProps {
  level: PermissionLevel;
  className?: string;
}

const PERMISSION_STYLES: Record<PermissionLevel, string> = {
  admin:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  write: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  read: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

/**
 * Renders a permission level badge with consistent styling.
 * Used in group and contract access displays.
 */
export function PermissionBadge({ level, className }: PermissionBadgeProps) {
  return (
    <span
      className={cn(
        'font-medium rounded px-2 py-0.5 text-xs',
        PERMISSION_STYLES[level],
        className,
      )}
    >
      {level}
    </span>
  );
}
