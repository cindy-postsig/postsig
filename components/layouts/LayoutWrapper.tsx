'use client';

import { usePathname } from 'next/navigation';
import { isSettingsPath } from '@/lib/settings/config';
import { cn } from '@/lib/utils';

export default function LayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const useFullWidth =
    pathname?.startsWith('/investor/company') ||
    pathname?.startsWith('/account') ||
    pathname?.startsWith('/assignments') ||
    pathname?.startsWith('/contracts') ||
    pathname?.startsWith('/exchange-agreements') ||
    pathname?.startsWith('/invoices') ||
    isSettingsPath(pathname);

  // Individual report pages, and exchange-agreements' sidebar + table views,
  // own their layout inside a viewport-height container, so the page itself
  // must not grow past the fold.
  const fitToViewport =
    pathname?.startsWith('/reports/') ||
    pathname?.startsWith('/exchange-agreements');

  return (
    <div
      className={cn(
        'mx-auto',
        !useFullWidth && 'max-w-[1984px] px-6 pt-6 2xl:px-8 2xl:pt-8',
        !useFullWidth && (fitToViewport ? 'pb-6' : 'pb-24'),
        fitToViewport && 'flex h-[calc(100vh-3.5rem)] flex-col',
      )}
    >
      {children}
    </div>
  );
}
