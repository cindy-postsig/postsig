import { reportConfigs } from '@/app/(app)/(cpm)/reports/reportConfigs';
import { redirect } from 'next/navigation';

export default async function ReportTypeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;

  if (!reportConfigs[type as keyof typeof reportConfigs]) {
    redirect('/reports');
  }

  const reportConfig = reportConfigs[type as keyof typeof reportConfigs];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="mb-2 mt-2">
        <h1 className="font-serif leading-none">{reportConfig.title} Report</h1>
      </div>
      {children}
    </div>
  );
}
