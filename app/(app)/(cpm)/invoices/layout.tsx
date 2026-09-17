import { ReactNode, Suspense } from 'react';
import { notFound } from 'next/navigation';
import Loading from '@/components/Loading';
import InvoicesSidebar from './InvoicesSidebar';
import {
  getInvoiceStats,
  getArchivedInvoiceContracts,
} from '@/lib/v2/invoices/service';
import { hasInvoicesAccess } from '@/lib/v2/invoices/access';
import { isCostAllocationEnabled } from '@/lib/v2/cost-allocation/flag';
import { getUserMetadata } from '@/data/users';

export default async function InvoicesLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!(await hasInvoicesAccess())) notFound();

  const user = await getUserMetadata();
  const [stats, archived, costAllocationEnabled] = await Promise.all([
    getInvoiceStats(),
    getArchivedInvoiceContracts(),
    user ? isCostAllocationEnabled(user) : false,
  ]);

  const counts = {
    all: stats.all.count,
    awaitingReview: stats.awaitingReview.count,
    potentialDiscrepancies: stats.potentialDiscrepancies.count,
    disputed: stats.disputed.count,
    approved: stats.approved.count,
    archived: archived.length,
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      <div className="flex">
        <InvoicesSidebar
          counts={counts}
          costAllocationEnabled={costAllocationEnabled}
        />
        <div className="min-w-0 flex-1 px-6 pb-24 pt-6 2xl:px-8 2xl:pt-8">
          <Suspense
            fallback={
              <div className="flex w-full items-center justify-center p-12">
                <Loading />
              </div>
            }
          >
            {children}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
