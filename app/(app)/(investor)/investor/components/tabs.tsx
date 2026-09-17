'use client';

// Investor-scoped copy of shadcn/ui tabs. The shared `@/components/ui/tabs`
// was rewritten for the CPM app; this fork lets the investor UI evolve its tab
// styling independently. Supports `variant="line"` (underline) and the default
// segmented/pill style, matching shadcn's Tabs variants. Restyle freely.

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

type TabsVariant = 'default' | 'line';

const TabsVariantContext = React.createContext<TabsVariant>('default');

const Tabs = TabsPrimitive.Root;

const tabsListVariants = cva('text-muted-foreground', {
  variants: {
    variant: {
      default:
        'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1',
      line: 'inline-flex w-full items-center justify-start gap-4 border-b border-border',
    },
  },
  defaultVariants: { variant: 'default' },
});

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> &
    VariantProps<typeof tabsListVariants>
>(({ className, variant = 'default', ...props }, ref) => (
  <TabsVariantContext.Provider value={variant ?? 'default'}>
    <TabsPrimitive.List
      ref={ref}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  </TabsVariantContext.Provider>
));
TabsList.displayName = TabsPrimitive.List.displayName;

const tabsTriggerVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap text-sm font-normal ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'rounded-sm px-3 py-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        line: '-mb-px rounded-none border-b-2 border-transparent px-2 py-2 hover:text-foreground/80 data-[state=active]:border-foreground data-[state=active]:text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsTriggerVariants };
