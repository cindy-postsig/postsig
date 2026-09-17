import { Suspense } from 'react';

import { getUser, getUserMetadata } from '@/data/users';
import { hasInvoicesAccess } from '@/lib/v2/invoices/access';
import { timed } from '@/utils/logging/timed';
import { ReportCard } from '@/components/cards/ReportCard';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BudgetSection,
  NeedsAttentionSection,
  TopVendorsSection,
  AutoRenewalsSection,
  InvoicesSection,
  UtilizationSection,
  NdaSection,
  TrialSection,
  MyContractsSection,
} from '@/components/dashboard/sections';

function CardSkeleton({ title }: { title: string }) {
  return (
    <ReportCard title={title} viewMoreHref="#">
      <div className="space-y-3">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    </ReportCard>
  );
}

function BudgetSkeleton() {
  return (
    <ReportCard
      title="Spend Overview"
      viewMoreHref="/budget"
      className="col-span-2"
    >
      <div className="space-y-6">
        <div className="mt-1 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="mt-4 h-48 w-full" />
      </div>
    </ReportCard>
  );
}

function NeedsAttentionSkeleton() {
  return (
    <ReportCard
      title="Needs Attention"
      viewMoreHref="/reports"
      className="col-span-1"
    >
      <div className="mt-1 space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </ReportCard>
  );
}

export default async function Page() {
  const user = await timed('dashboard.getUser', getUser);
  const userMetadata = await timed(
    'dashboard.getUserMetadata',
    getUserMetadata,
  );
  if (!user || !userMetadata) {
    return null;
  }
  const userName = user?.user_metadata?.full_name?.split(' ')[0] || '';
  const fiscalYearStart = userMetadata.organizationFY || 1;
  const alertRange = userMetadata.userProfile?.advance_notice_period || 90;
  const invoicesEnabled = await timed(
    'dashboard.hasInvoicesAccess',
    hasInvoicesAccess,
  );

  return (
    <div>
      <div className="mb-8 flex w-full items-center justify-between">
        <h1 className="font-serif">Welcome{userName ? `, ${userName}` : ''}</h1>
      </div>

      <div className="flex-1">
        <div className="flex flex-col gap-4">
          {/* First row - Budget and Needs Attention */}
          <div className="grid grid-cols-3 gap-3 2xl:gap-4">
            <Suspense fallback={<BudgetSkeleton />}>
              <BudgetSection />
            </Suspense>

            <Suspense fallback={<NeedsAttentionSkeleton />}>
              <NeedsAttentionSection />
            </Suspense>
          </div>

          {/* Second row - 2x2 grid */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:gap-4">
            <Suspense fallback={<CardSkeleton title="Auto-Renewals" />}>
              <AutoRenewalsSection
                userMetadata={userMetadata}
                fiscalYearStart={fiscalYearStart}
                alertRange={alertRange}
              />
            </Suspense>

            <Suspense fallback={<CardSkeleton title="Top Vendors" />}>
              <TopVendorsSection />
            </Suspense>

            {invoicesEnabled && (
              <Suspense
                fallback={<CardSkeleton title="Invoice Discrepancies" />}
              >
                <InvoicesSection userMetadata={userMetadata} />
              </Suspense>
            )}

            <Suspense fallback={<CardSkeleton title="Underutilized" />}>
              <UtilizationSection userMetadata={userMetadata} />
            </Suspense>

            <Suspense fallback={<CardSkeleton title="NDA Insights" />}>
              <NdaSection userMetadata={userMetadata} />
            </Suspense>

            <Suspense fallback={<CardSkeleton title="Trial Agreements" />}>
              <TrialSection userMetadata={userMetadata} />
            </Suspense>

            <Suspense fallback={<CardSkeleton title="My Contracts" />}>
              <MyContractsSection userMetadata={userMetadata} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
