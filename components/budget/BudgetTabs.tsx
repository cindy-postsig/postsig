'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { tabTriggerVariants } from '@/components/ui/tabs';

export default function BudgetTabs() {
  const pathname = usePathname();

  const isActive = (href: string, exactMatch: boolean = false) => {
    if (exactMatch) {
      return pathname === href;
    }
    return pathname?.startsWith(href);
  };

  return (
    <div className="sticky top-14 z-30 -mt-8 w-full border-b bg-background">
      <div className="mx-auto w-full overflow-x-auto">
        <nav className="inline-flex items-center justify-center gap-2 font-sans">
          <Link
            href="/budget"
            data-state={isActive('/budget', true) ? 'active' : 'inactive'}
            className={cn(
              tabTriggerVariants({ size: 'sm' }),
              'h-10 whitespace-nowrap text-xs tracking-[0.01rem]',
            )}
          >
            Overview
          </Link>
          <Link
            href="/budget/monthly-report"
            data-state={
              isActive('/budget/monthly-report') ? 'active' : 'inactive'
            }
            className={cn(
              tabTriggerVariants({ size: 'sm' }),
              'h-10 whitespace-nowrap text-xs tracking-[0.01rem]',
            )}
          >
            Monthly Intelligence
          </Link>
          <Link
            href="/budget/price-history"
            data-state={
              isActive('/budget/price-history') ? 'active' : 'inactive'
            }
            className={cn(
              tabTriggerVariants({ size: 'sm' }),
              'h-10 whitespace-nowrap text-xs tracking-[0.01rem]',
            )}
          >
            Price History
          </Link>
        </nav>
      </div>
    </div>
  );
}
