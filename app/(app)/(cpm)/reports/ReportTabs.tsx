'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { tabTriggerVariants } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface ReportTabsProps {
  allReports: Record<
    string,
    {
      title: string;
      description?: string;
    }
  >;
  /** The org's cost-allocation flag, evaluated in the layout — the tab exists only while it is on. */
  costAllocationEnabled?: boolean;
  /** Invoice Cost Allocation shows real invoice data, so it also needs the
   * Invoices module — cost allocation being on doesn't imply that. */
  invoicesEnabled?: boolean;
}

// Static sibling routes beside reports/[type] — not reportConfigs entries
// (the [type] page is hard-wired to ContractsTableClient), so they join the
// tab list here explicitly.
export const INVOICE_COST_ALLOCATION_REPORT = {
  type: 'invoice-cost-allocation',
  title: 'Invoice Cost Allocation',
} as const;

export const ALLOCATION_ROLLUP_REPORT = {
  type: 'allocation-rollup',
  title: 'Cost Allocation Summary',
} as const;

/** Everything through this report stays a tab; whatever follows collapses into More. */
export const LAST_INLINE_REPORT = 'nda';

const TAB_CLASS = 'h-10 whitespace-nowrap text-xs tracking-[0.01rem]';
// Radix owns the trigger's data-state (open/closed), so the tab variant's
// data-[state=active] styling cannot reach it; the active look is set by hand.
const ACTIVE_TAB_CLASS =
  'border-b-blue-950 text-foreground dark:border-b-foreground';

export function ReportTabs({
  allReports,
  costAllocationEnabled = false,
  invoicesEnabled = false,
}: ReportTabsProps) {
  const pathname = usePathname();

  let reports = allReports;
  if (costAllocationEnabled) {
    reports = {
      ...reports,
      [ALLOCATION_ROLLUP_REPORT.type]: {
        title: ALLOCATION_ROLLUP_REPORT.title,
      },
    };
    if (invoicesEnabled) {
      reports = {
        ...reports,
        [INVOICE_COST_ALLOCATION_REPORT.type]: {
          title: INVOICE_COST_ALLOCATION_REPORT.title,
        },
      };
    }
  }

  // Define the renewal report types to exclude from tabs
  const renewalReportTypes = [
    'auto-renewals',
    'manual-renewals',
    'recently-renewed',
    'all-renewals',
  ];

  // Define a custom order for reports
  const customReportOrder = [
    'renewals',
    'invoices',
    INVOICE_COST_ALLOCATION_REPORT.type,
    ALLOCATION_ROLLUP_REPORT.type,
    'utilization',
    'unconfirmed',
    'contract-omissions',
    'dora',
    'unexecuted',
  ];

  // Filter out renewal report types and apply custom order
  const availableReports = Object.keys(reports).filter(
    (type) =>
      !renewalReportTypes.includes(type) &&
      !(process.env.ENV === 'prod' && type === 'utilization'),
  );

  const orderedReports = ['renewals'];
  customReportOrder.slice(1).forEach((reportType) => {
    if (availableReports.includes(reportType)) {
      orderedReports.push(reportType);
    }
  });
  availableReports.forEach((reportType) => {
    if (!orderedReports.includes(reportType)) {
      orderedReports.push(reportType);
    }
  });

  const isActive = (href: string) => {
    if (href === '/reports') {
      return pathname === '/reports';
    }
    return pathname?.startsWith(href);
  };
  const hrefOf = (type: string) =>
    type === 'renewals' ? '/reports' : `/reports/${type}`;
  const titleOf = (type: string) =>
    type === 'renewals' ? 'Renewals' : reports[type]?.title;

  const lastInline = orderedReports.indexOf(LAST_INLINE_REPORT);
  const inlineReports =
    lastInline === -1
      ? orderedReports
      : orderedReports.slice(0, lastInline + 1);
  const overflowReports =
    lastInline === -1 ? [] : orderedReports.slice(lastInline + 1);
  const activeOverflow = overflowReports.find((type) => isActive(hrefOf(type)));

  return (
    <div className="sticky top-14 z-30 -mt-8 mb-6 w-full border-b bg-background">
      <div className="mx-auto w-full overflow-x-auto">
        <div className="flex">
          {inlineReports.map((type) => {
            const href = hrefOf(type);
            const title = titleOf(type);

            if (!title) return null;

            return (
              <Link
                key={type}
                href={href}
                data-state={isActive(href) ? 'active' : 'inactive'}
                className={cn(tabTriggerVariants({ size: 'sm' }), TAB_CLASS)}
              >
                {title}
              </Link>
            );
          })}
          {overflowReports.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  tabTriggerVariants({ size: 'sm' }),
                  TAB_CLASS,
                  'gap-1',
                  activeOverflow && ACTIVE_TAB_CLASS,
                )}
              >
                {/* Named after the open report so the bar always says where
                    you are, even when that report lives behind More. */}
                {activeOverflow ? titleOf(activeOverflow) : 'More'}
                <ChevronDown className="h-3 w-3" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {overflowReports.map((type) => {
                  const title = titleOf(type);
                  if (!title) return null;
                  return (
                    <DropdownMenuItem key={type} asChild>
                      <Link
                        href={hrefOf(type)}
                        className={cn(
                          'cursor-pointer',
                          type === activeOverflow && 'font-medium',
                        )}
                      >
                        {title}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}
