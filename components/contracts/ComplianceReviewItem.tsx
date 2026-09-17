import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/app/lib/utils';
import {
  ArrowRightIcon,
  CircleIcon,
  QuestionMarkCircledIcon,
} from '@radix-ui/react-icons';
import { Badge } from '@/components/ui/badge';

interface ComplianceReviewItemProps {
  title: string;
  count: number;
  value: number;
  /** Org base display currency for `value` — the roll-up is cross-contract. */
  currency?: string;
  description: string;
  href: string;
  buttonText?: string;
  subtitle?: ReactNode;
}

export function ComplianceReviewItem({
  title,
  count,
  value,
  currency,
  description,
  href,
  buttonText = 'Review',
  subtitle,
}: ComplianceReviewItemProps) {
  return (
    <Card className="flex min-h-[80px] items-center justify-between gap-4 bg-gray-100 p-4 py-3 transition-all dark:border-border dark:bg-gray-100/5">
      <div className="flex items-center gap-4">
        <Badge
          variant="secondary"
          className="flex h-10 w-10 min-w-10 items-center justify-center p-0 font-sans-neue text-[0.85rem] leading-none"
        >
          {count}
        </Badge>
        <div>
          <div className="font-medium text-sm">
            <div className="flex items-center">
              <Link href={href} className="underline-offset-1 hover:underline">
                {title}
              </Link>
            </div>
          </div>
          <p className="font-sans text-[0.8rem] leading-tight">
            {subtitle ? (
              subtitle
            ) : (
              <>
                {title === 'DORA Analysis' && count === 0
                  ? 'Confirm vendors to see DORA report'
                  : `${count} ${count === 1 ? 'contract' : 'contracts'} worth `}
                {count !== 0 && (
                  <span className="font-medium">
                    {formatCurrency(value, currency)}
                  </span>
                )}
                {` ${description}`}
              </>
            )}
          </p>
        </div>
      </div>
      <Link
        href={href}
        className="font-medium ml-1 inline-block min-w-20 rounded-sm bg-primary/5 px-3 py-2 text-center text-[0.8rem] text-foreground hover:bg-primary/10"
      >
        {buttonText}
      </Link>
    </Card>
  );
}
