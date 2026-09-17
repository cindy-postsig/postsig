'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { InfoCircledIcon } from '@radix-ui/react-icons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/app/lib/utils';
import { computeInvoiceStats } from '@/lib/v2/invoices/folders';
import type { InvoiceFolder } from '@/lib/v2/invoices/service';
import type { InvoiceRow } from '@/components/invoices/InvoicesTable';

// Matches the Invoice Management prototype's StatCard (postsig-proto,
// exchange-agreements-v2 branch): active state border/background, and the
// red/green highlight colors used for the discrepancy badge everywhere else
// in this module (see components/invoices/columns.tsx).
function StatCard({
  href,
  label,
  amount,
  currency,
  count,
  active,
  highlight,
  tooltip,
}: {
  href: string;
  label: string;
  amount: number;
  currency: string;
  count: number;
  active: boolean;
  highlight?: 'red' | 'green';
  tooltip?: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={cn(
        'flex flex-1 flex-col justify-between gap-2 rounded-lg border p-3 text-left transition-colors',
        active
          ? 'border-[#232b97] bg-[#c5d1f1]/[0.33]'
          : 'border-border bg-card hover:border-muted-foreground/40',
      )}
    >
      <span className="flex items-center gap-1 text-xs leading-none text-foreground">
        {label}
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoCircledIcon
                  aria-label={`${label} info`}
                  className="h-3.5 w-3.5 shrink-0 cursor-default text-muted-foreground"
                  onClick={(e) => e.preventDefault()}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-xs">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </span>
      <span
        className={cn(
          'font-extralight font-serif text-lg !leading-none md:text-2xl',
          highlight === 'red' && 'text-[#CC003F]',
          highlight === 'green' && 'text-[#00A86B]',
          !highlight && 'text-foreground',
        )}
      >
        {formatCurrency(amount, currency)}
      </span>
      <span className="text-xs leading-none text-muted-foreground">
        {count} invoices
      </span>
    </Link>
  );
}

export default function InvoiceStatTiles({
  rows,
  currency,
  activeFolder,
}: {
  /** Already scoped to whatever window the shared date filter resolves to —
   * cross-folder (every invoice, not just the current tab's), so a card
   * other than the active tab still reads its own true total. */
  rows: InvoiceRow[];
  currency: string;
  activeFolder: InvoiceFolder;
}) {
  const stats = useMemo(() => computeInvoiceStats(rows), [rows]);

  return (
    <div className="mb-8 flex flex-wrap gap-4">
      <StatCard
        href="/invoices"
        label="Total Active Invoices"
        amount={stats.all.amount}
        currency={currency}
        count={stats.all.count}
        active={activeFolder === 'all'}
      />
      <StatCard
        href="/invoices?folder=awaiting-review"
        label="Awaiting Review"
        amount={stats.awaitingReview.amount}
        currency={currency}
        count={stats.awaitingReview.count}
        active={activeFolder === 'awaiting-review'}
      />
      <StatCard
        href="/invoices?folder=potential-overbilling"
        label="Potential Billing Discrepancies"
        amount={stats.potentialDiscrepancies.amount}
        currency={currency}
        count={stats.potentialDiscrepancies.count}
        active={activeFolder === 'potential-overbilling'}
        highlight={stats.potentialDiscrepancies.count > 0 ? 'red' : undefined}
      />
      <StatCard
        href="/invoices?folder=disputed"
        label="Disputed Invoices"
        amount={stats.disputed.amount}
        currency={currency}
        count={stats.disputed.count}
        active={activeFolder === 'disputed'}
        highlight={stats.disputed.count > 0 ? 'red' : undefined}
      />
      <StatCard
        href="/invoices?folder=approved"
        label="Approved Invoices"
        amount={stats.approved.amount}
        currency={currency}
        count={stats.approved.count}
        active={activeFolder === 'approved'}
        highlight={stats.approved.count > 0 ? 'green' : undefined}
        tooltip="Includes both approved and paid invoices."
      />
    </div>
  );
}
