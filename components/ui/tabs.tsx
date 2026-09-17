'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

type TabsSize = 'default' | 'sm' | 'md';

// Create context to share size between Tabs and its children
const TabsSizeContext = React.createContext<TabsSize>('default');

const tabTriggerVariants = cva(
  'font-normal inline-flex items-center justify-center whitespace-nowrap border-b-transparent text-muted-foreground transition-all data-[state=active]:text-foreground hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      size: {
        default:
          'border-b-1.5 px-2 py-2 text-sm data-[state=active]:border-b-blue-950 data-[state=active]:hover:border-b-blue-950 dark:data-[state=active]:border-b-foreground',
        sm: 'border-b px-2 py-1.5 text-xs data-[state=active]:border-b-blue-950 data-[state=active]:hover:border-b-blue-950 dark:data-[state=active]:border-b-foreground',
        md: 'border-b-2 px-4 py-1.5 text-[0.825rem] data-[state=active]:border-b-blue-950 data-[state=active]:hover:border-b-blue-950 dark:data-[state=active]:border-b-foreground',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> & {
    size?: TabsSize;
  }
>(({ size = 'default', ...props }, ref) => (
  <TabsSizeContext.Provider value={size}>
    <TabsPrimitive.Root ref={ref} {...props} />
  </TabsSizeContext.Provider>
));
Tabs.displayName = 'Tabs';

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center gap-2 font-sans',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const size = React.useContext(TabsSizeContext);

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(tabTriggerVariants({ size, className }))}
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

export { Tabs, TabsList, TabsTrigger, TabsContent, tabTriggerVariants };
