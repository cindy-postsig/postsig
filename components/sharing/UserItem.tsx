'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/ui/user-avatar';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BadgeConfig {
  label: string;
  variant?:
    | 'outline'
    | 'default'
    | 'secondary'
    | 'destructive'
    | 'notice'
    | 'user';
  className?: string;
}

interface UserItemProps {
  user: {
    id: string;
    name: string;
    email?: string;
    signedUp?: boolean;
  };
  avatarSize?: 'xs' | 'sm' | 'md' | 'lg';
  showEmail?: boolean;
  badges?: BadgeConfig[];
  onRemove?: (userId: string) => void;
  className?: string;
  containerClassName?: string;
  // Style variants for different contexts
  variant?: 'default' | 'compact' | 'search';
}

export function UserItem({
  user,
  avatarSize = 'sm',
  showEmail = false,
  badges = [],
  onRemove,
  className,
  containerClassName,
  variant = 'default',
}: UserItemProps) {
  const isPending = user.signedUp === false;

  // Auto-add Pending badge if user hasn't signed up
  const allBadges: BadgeConfig[] = isPending
    ? [{ label: 'Pending', variant: 'notice' }, ...badges]
    : badges;

  // Variant-specific styling
  const getContainerClasses = () => {
    if (containerClassName) return containerClassName;

    switch (variant) {
      case 'compact':
        return 'flex items-center justify-between gap-2 rounded-sm px-1.5 py-1.5 transition-colors duration-200 hover:bg-hover';
      case 'search':
        return 'flex items-center gap-2 cursor-pointer';
      case 'default':
      default:
        return 'flex items-center justify-between py-2';
    }
  };

  const getTextClasses = () => {
    const hasTextSize =
      className && /text-(xs|sm|base|lg|xl|2xl|3xl)/.test(className);
    return cn(!hasTextSize && 'text-sm', className);
  };

  const getBadgeClasses = () => {
    switch (variant) {
      case 'compact':
        return 'h-4 p-0 px-1.5 text-[0.65rem]';
      case 'search':
        return 'p-0 px-2 text-[0.7rem]';
      case 'default':
      default:
        return 'p-0 px-2 text-[0.7rem]';
    }
  };

  const getButtonSize = () => {
    switch (variant) {
      case 'compact':
        return 'h-5 w-5';
      case 'default':
      default:
        return 'mr-1.5 h-6 w-6';
    }
  };

  const getIconSize = () => {
    switch (variant) {
      case 'compact':
        return 'h-3 w-3';
      case 'default':
      default:
        return 'h-4 w-4';
    }
  };

  return (
    <div className={getContainerClasses()}>
      <div className="flex flex-1 items-center gap-2">
        <UserAvatar
          name={user.name || user.email || 'Unknown'}
          userId={user.id}
          size={avatarSize}
        />
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <p className={getTextClasses()}>
              {user.name || user.email || 'Unknown'}
            </p>
            {allBadges.map((badge, idx) => (
              <Badge
                key={idx}
                variant={badge.variant || 'outline'}
                className={cn(getBadgeClasses(), badge.className)}
              >
                {badge.label}
              </Badge>
            ))}
          </div>
          {showEmail && user.email && (
            <div className="text-xs text-muted-foreground">{user.email}</div>
          )}
        </div>
      </div>
      {onRemove && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className={getButtonSize()}>
              <MoreHorizontal className={getIconSize()} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onRemove(user.id)}
            >
              Remove Access
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
