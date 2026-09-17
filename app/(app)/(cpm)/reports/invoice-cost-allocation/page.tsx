import { notFound } from 'next/navigation';
import { getUserMetadata } from '@/data/users';
import { getAbilityForCurrentUser } from '@/data/user-permissions';
import { isCostAllocationEnabled } from '@/lib/v2/cost-allocation/flag';
import { hasInvoicesAccess } from '@/lib/v2/invoices/access';
import { loadInvoiceCostAllocationReport } from '@/lib/v2/cost-allocation/invoice-report';
import { InvoiceCostAllocationReport } from '@/components/reports/invoice-cost-allocation/InvoiceCostAllocationReport';

export default async function InvoiceCostAllocationPage({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const user = await getUserMetadata();
  if (!user) return null;
  // This report shows real invoice line items and amounts, so it needs both
  // flags — cost allocation being on doesn't imply the Invoices module is.
  const [costAllocationEnabled, invoicesEnabled] = await Promise.all([
    isCostAllocationEnabled(user),
    hasInvoicesAccess(),
  ]);
  if (!costAllocationEnabled || !invoicesEnabled) notFound();

  const searchParams = searchParamsPromise
    ? await searchParamsPromise
    : undefined;

  const [report, ability] = await Promise.all([
    // Passed through unvalidated, as the summary does: the loader decides what
    // an unrecognised period means, including widening past an empty month.
    loadInvoiceCostAllocationReport(user, {
      period: searchParams?.period,
      from: searchParams?.from,
      to: searchParams?.to,
    }),
    getAbilityForCurrentUser(),
  ]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="mb-2 mt-2">
        <h1 className="font-serif leading-none">
          Invoice Cost Allocation Report
        </h1>
      </div>
      <InvoiceCostAllocationReport
        data={report}
        canEdit={ability?.can('manage', 'Organization') ?? false}
        baseCurrency={user.baseCurrency}
        dateFormat={user.dateFormat}
      />
    </div>
  );
}
