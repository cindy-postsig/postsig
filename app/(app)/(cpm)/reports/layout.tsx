import { getUserMetadata } from '@/data/users';
import { isCostAllocationEnabled } from '@/lib/v2/cost-allocation/flag';
import { hasInvoicesAccess } from '@/lib/v2/invoices/access';
import { ReportTabs } from './ReportTabs';
import { reportConfigs } from './reportConfigs';

export default async function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUserMetadata();
  const [costAllocationEnabled, invoicesEnabled] = await Promise.all([
    user ? isCostAllocationEnabled(user) : false,
    hasInvoicesAccess(),
  ]);
  return (
    // `contents` keeps this wrapper out of the box tree so the report page below
    // can be a flex child of the viewport-height container in LayoutWrapper.
    <div className="contents">
      <ReportTabs
        allReports={Object.entries(reportConfigs).reduce(
          (acc, [key, config]) => {
            if (key === 'invoices' && !invoicesEnabled) return acc;
            acc[key] = {
              title: config.title,
              description: config.description,
            };
            return acc;
          },
          {} as Record<string, { title: string; description?: string }>,
        )}
        costAllocationEnabled={costAllocationEnabled}
        invoicesEnabled={invoicesEnabled}
      />
      {children}
    </div>
  );
}
