import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center font-sans justify-center gap-2 font-medium whitespace-nowrap rounded-sm text-sm transition-colors focus-visible:outline-none focus-visible:ring-[4px] focus-visible:ring-ring/15 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&[aria-haspopup=menu]]:px-2 [&[role=combobox]]:px-2',
  {
    variants: {
      variant: {
        default:
          'bg-blue-950 dark:bg-primary dark:text-primary-foreground text-white hover:bg-navy disabled:hover:bg-blue-950 dark:disabled:hover:bg-white',
        accent:
          'bg-blue-700 text-white hover:bg-blue-800 disabled:hover:bg-primary dark:disabled:hover:bg-white',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:hover:bg-destructive',
        outline:
          'border border-input hover:bg-secondary/25 hover:text-accent-foreground disabled:bg-secondary disabled:opacity-30 disabled:hover:bg-secondary disabled:hover:text-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:hover:bg-secondary',
        ghost:
          'hover:bg-secondary/80 hover:text-accent-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-foreground',
        link: 'text-foreground underline-offset-2 hover:underline disabled:hover:no-underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        xs: 'h-6 px-2 text-[.7rem] leading-none',
        sm: 'h-8 px-4 text-[.825rem]',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
