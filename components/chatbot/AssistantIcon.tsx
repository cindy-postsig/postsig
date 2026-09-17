import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The assistant's app icon. Single source of truth for the launcher / header
 * mark so swapping the artwork is a one-file change. Fills its parent, so the
 * surrounding button/span controls the size.
 */
export function AssistantIcon({
  alt,
  className,
}: {
  alt: string;
  className?: string;
}) {
  return (
    <Image
      src="/sigpilot_1.png"
      alt={alt}
      width={120}
      height={120}
      className={cn('h-full w-full object-cover', className)}
      priority
    />
  );
}
