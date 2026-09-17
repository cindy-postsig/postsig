import { cn } from '@/lib/utils';
import { getColor } from '@/utils/avatarColor3';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface UserAvatarProps {
  name?: string | null;
  email?: string | null;
  userId?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  initialsCount?: 1 | 2;
  className?: string;
}

const sizeClasses = {
  xs: 'h-5 w-5 text-[0.6rem]',
  sm: 'h-6 w-6 text-xs',
  md: 'h-8 w-8 text-xs',
  lg: 'h-9 w-9 text-xs',
  xl: 'h-10 w-10 text-sm',
};

const defaultInitialsCount = {
  xs: 1,
  sm: 1,
  md: 1,
  lg: 1,
  xl: 2,
} as const;

function getInitials(
  name: string | null | undefined,
  email: string | null | undefined,
  count: 1 | 2,
): string {
  if (name && name.trim()) {
    const cleanedName = name.trim();
    const nameParts = cleanedName.split(' ');
    if (count === 2) {
      if (nameParts.length >= 2) {
        return (
          nameParts[0][0] + nameParts[nameParts.length - 1][0]
        ).toUpperCase();
      }
      return cleanedName.slice(0, count).toUpperCase();
    } else {
      return nameParts[0][0].toUpperCase();
    }
  }
  if (email) {
    const localPart = email.split('@')[0];
    const cleanedLocal = localPart.replace(/[^a-z0-9]/gi, '');
    if (cleanedLocal.length >= count) {
      return cleanedLocal.slice(0, count).toUpperCase();
    }
    return cleanedLocal.toUpperCase().padEnd(count, '?');
  }
  return '?';
}

export function UserAvatar({
  name,
  email,
  userId,
  size = 'sm',
  initialsCount,
  className,
}: UserAvatarProps) {
  // Use userId for color generation, fallback to email or name if userId not provided
  const seed = userId || email || name || 'default';
  const { color, derived, palette, harmonic } = getColor(seed);

  // Use provided initialsCount or default based on size
  const count = initialsCount ?? defaultInitialsCount[size];

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      <AvatarFallback
        className="font-medium leading-[normal] text-white"
        style={{ backgroundColor: color }}
      >
        {getInitials(name, email, count)}
      </AvatarFallback>
    </Avatar>
  );
}
