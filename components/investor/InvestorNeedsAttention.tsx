'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { ReportCard } from '@/components/cards/ReportCard';
import { cn } from '@/lib/utils';

interface AttentionItem {
  title: string;
  count: number;
  totalValue?: number;
  description: string;
  href: string;
}

interface InvestorNeedsAttentionProps {
  missingDocuments: AttentionItem;
  lowCashPosition?: AttentionItem;
}

function AttentionItemCard({
  title,
  count,
  totalValue,
  description,
  href,
}: AttentionItem) {
  if (count === 0) return null;

  return (
    <Card className="flex min-h-[84px] items-center justify-between gap-4 bg-gray-100 p-4 transition-all dark:border-border dark:bg-gray-100/5">
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
            {count} {description}
          </p>
        </div>
      </div>
      <Link
        href={href}
        className={cn(buttonVariants({ variant: 'default', size: 'sm' }))}
      >
        Review
      </Link>
    </Card>
  );
}

export function InvestorNeedsAttention({
  missingDocuments,
  lowCashPosition,
}: InvestorNeedsAttentionProps) {
  const hasAnyItems =
    missingDocuments.count > 0 || (lowCashPosition?.count ?? 0) > 0;

  if (!hasAnyItems) {
    return null;
  }

  return (
    <ReportCard
      title="Needs Attention"
      viewMoreHref="/investor/portfolio"
      className="col-span-1"
    >
      <div className="mt-1 space-y-4">
        <AttentionItemCard {...missingDocuments} />
        {lowCashPosition && <AttentionItemCard {...lowCashPosition} />}
      </div>
    </ReportCard>
  );
}
