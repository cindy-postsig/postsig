import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border border-muted-foreground/30 px-2.5 pt-[3px] pb-0.5 text-xs font-label tracking-normal font-normal transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-primary/10 text-foreground hover:bg-primary/10',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
        user: 'border-transparent bg-primary-2 text-foreground hover:bg-primary-2',
        notice:
          'border-amber-400 bg-amber-100 text-amber-700 dark:border-0 dark:bg-amber-200 dark:text-amber-950',
      },
      size: {
        default: '',
        sm: 'px-2 py-0 text-[0.7rem] leading-tight',
        xs: 'px-1.5 py-0 pt-[1px] text-[0.65rem] leading-tight',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
