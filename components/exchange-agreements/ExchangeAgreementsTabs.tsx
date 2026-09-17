'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { tabTriggerVariants } from '@/components/ui/tabs';
import { useExchangeAgreementMyList } from '@/hooks/useExchangeAgreementMyList';

const TABS = [
  { href: '/exchange-agreements/product-lines', label: 'Product Lines' },
  {
    href: '/exchange-agreements/product-explorer',
    label: 'Product Explorer',
  },
  {
    href: '/exchange-agreements/version-comparison',
    label: 'Version Comparison',
  },
  { href: '/exchange-agreements/my-list', label: 'My List' },
];

export default function ExchangeAgreementsTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const { productIds } = useExchangeAgreementMyList();

  return (
    <div className="flex items-center justify-between border-b px-6">
      <nav className="inline-flex items-center gap-2 font-sans">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={query ? `${tab.href}?${query}` : tab.href}
            data-state={pathname === tab.href ? 'active' : 'inactive'}
            className={cn(
              tabTriggerVariants({ size: 'sm' }),
              'h-10 whitespace-nowrap text-xs tracking-[0.01rem]',
            )}
          >
            {tab.label}
            {tab.href === '/exchange-agreements/my-list' &&
              productIds.length > 0 && (
                <span className="ml-1">({productIds.length})</span>
              )}
          </Link>
        ))}
      </nav>
      <Link
        href="/exchange-agreements"
        className="font-medium flex items-center gap-1 text-sm text-foreground hover:text-foreground/80"
      >
        <ChevronLeft className="h-4 w-4" />
        Browse Exchanges
      </Link>
    </div>
  );
}
