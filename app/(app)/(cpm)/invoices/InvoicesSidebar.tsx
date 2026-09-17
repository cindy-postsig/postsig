'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Receipt, ArrowUpRight } from 'lucide-react';
import { ArchiveIcon } from '@/components/icons/ArchiveIcon';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { InvoiceFolder } from '@/lib/v2/invoices/service';

interface InvoicesSidebarProps {
  counts: {
    all: number;
    awaitingReview: number;
    potentialDiscrepancies: number;
    disputed: number;
    approved: number;
    archived: number;
  };
  /** Invoice Cost Allocation is its own Flagkit-gated feature; the link is
   * only real for orgs that have it, same as the Reports tab bar. */
  costAllocationEnabled?: boolean;
}

interface FolderLink {
  label: string;
  href: string;
  folder?: InvoiceFolder;
  count?: number;
}

// Matches the Reports icon used in the main navigation (navConfig.tsx).
function ReportsIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 17 17"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 0L12 17H13L13 0H12ZM0 17V6H1L1 17H0ZM4 17L4 8H5L5 17H4ZM8 17L8 3H9L9 17H8ZM16 5L16 17H17V5H16Z"
        fill="currentColor"
      />
    </svg>
  );
}

const REPORT_LINKS: FolderLink[] = [
  { label: 'Invoice Discrepancies', href: '/reports/invoices' },
  {
    label: 'Invoice Cost Allocation',
    href: '/reports/invoice-cost-allocation',
  },
];

export default function InvoicesSidebar({
  counts,
  costAllocationEnabled = false,
}: InvoicesSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeFolder: InvoiceFolder =
    (searchParams.get('folder') as InvoiceFolder | null) ?? 'all';
  const reportLinks = costAllocationEnabled
    ? REPORT_LINKS
    : REPORT_LINKS.filter(
        (link) => link.href !== '/reports/invoice-cost-allocation',
      );

  const folders: FolderLink[] = [
    {
      label: 'All Invoices',
      href: '/invoices',
      folder: 'all',
      count: counts.all,
    },
    {
      label: 'Awaiting Review',
      href: '/invoices?folder=awaiting-review',
      folder: 'awaiting-review',
      count: counts.awaitingReview,
    },
    {
      label: 'Potential Billing Discrepancies',
      href: '/invoices?folder=potential-overbilling',
      folder: 'potential-overbilling',
      count: counts.potentialDiscrepancies,
    },
    {
      label: 'Disputed',
      href: '/invoices?folder=disputed',
      folder: 'disputed',
      count: counts.disputed,
    },
    {
      label: 'Approved',
      href: '/invoices?folder=approved',
      folder: 'approved',
      count: counts.approved,
    },
  ];

  const isFolderActive = (folder?: InvoiceFolder) =>
    pathname === '/invoices' && folder === activeFolder;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] w-56 border-r border-border px-2 3xl:w-64">
      <nav className="sticky top-14 space-y-0.5 pt-4">
        <SidebarLink
          folder={{ label: 'Invoice Management', href: '/invoices' }}
          isActive={pathname === '/invoices'}
          icon="invoices"
        />
        <SidebarLink
          folder={{
            label: 'Archived Invoices',
            href: '/invoices?folder=archived',
            folder: 'archived',
            count: counts.archived,
          }}
          isActive={isFolderActive('archived')}
          icon="archive"
        />

        <Separator className="!my-2" />
        {folders.map((folder) => (
          <SidebarLink
            key={folder.href}
            folder={folder}
            isActive={isFolderActive(folder.folder)}
          />
        ))}

        <Separator className="!my-2" />
        <div className="px-3 py-1 font-label text-xs uppercase tracking-wide text-muted-foreground/80">
          Reports
        </div>
        {reportLinks.map((link) => (
          <SidebarLink
            key={link.href}
            folder={link}
            isActive={pathname === link.href}
            icon="report"
          />
        ))}
      </nav>
    </div>
  );
}

function SidebarLink({
  folder,
  isActive,
  icon = 'default',
}: {
  folder: FolderLink;
  isActive: boolean;
  icon?: 'default' | 'archive' | 'report' | 'invoices';
}) {
  const isReport = icon === 'report';

  return (
    <Link
      href={folder.href}
      prefetch={false}
      className={cn(
        'flex gap-2 rounded-sm px-3 py-2 text-sm transition-colors',
        isReport ? 'items-start' : 'items-center',
        isActive && 'bg-selected',
        !isActive && 'text-foreground/80 hover:bg-hover',
      )}
    >
      {icon === 'archive' ? (
        <ArchiveIcon className="h-4 w-4 p-[1px]" />
      ) : icon === 'invoices' ? (
        <Receipt className="h-4 w-4" strokeWidth={1.5} />
      ) : icon === 'report' ? (
        <ReportsIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : null}
      <span
        className={cn('flex-1', isReport ? 'leading-snug' : 'line-clamp-1')}
      >
        {folder.label}
      </span>
      {folder.count !== undefined && (
        <span className="font-label text-xs text-muted-foreground/80">
          {folder.count}
        </span>
      )}
      {isReport && (
        <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/70" />
      )}
    </Link>
  );
}
