import { notFound } from 'next/navigation';
import { getUserMetadata } from '@/data/users';
import { getAbilityForCurrentUser } from '@/data/user-permissions';
import { isCostAllocationEnabled } from '@/lib/v2/cost-allocation/flag';
import { loadAllocationRollupReport } from '@/lib/v2/cost-allocation/rollup-report';
import { AllocationRollupReport } from '@/components/reports/allocation-rollup/AllocationRollupReport';

export default async function AllocationRollupPage({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<{
    period?: string;
    from?: string;
    to?: string;
    filter?: string;
  }>;
}) {
  const user = await getUserMetadata();
  if (!user) return null;
  if (!(await isCostAllocationEnabled(user))) notFound();

  const searchParams = searchParamsPromise
    ? await searchParamsPromise
    : undefined;

  const [report, ability] = await Promise.all([
    loadAllocationRollupReport(user, {
      period: searchParams?.period,
      from: searchParams?.from,
      to: searchParams?.to,
    }),
    getAbilityForCurrentUser(),
  ]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="mb-2 mt-2">
        <h1 className="font-serif leading-none">Cost Allocation Summary</h1>
      </div>
      <AllocationRollupReport
        data={report}
        canEdit={ability?.can('manage', 'Organization') ?? false}
        initialExpandUnassigned={searchParams?.filter === 'unallocated'}
        baseCurrency={user.baseCurrency}
        dateFormat={user.dateFormat}
      />
    </div>
  );
}
