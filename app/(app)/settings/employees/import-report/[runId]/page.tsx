import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeftIcon, ArrowRightIcon } from '@radix-ui/react-icons';
import { getEmployeeImportRun } from '@/data/superuser/employee-import-runs';
import { getUserMetadata } from '@/data/users';
import { verifyAbility } from '@/data/user-permissions';
import { AuthorizationError } from '@/lib/errors';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { Separator } from '@/components/ui/separator';
import { FormattedDate } from '@/components/FormattedDate';
import { ImportReport } from '@/components/settings/employee-import/ImportReport';

export default async function ImportReportPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  try {
    await verifyAbility('manage', 'Organization');
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect('/dashboard');
    }
    throw error;
  }

  const { runId: runIdParam } = await params;
  const runId = Number(runIdParam);
  if (!Number.isInteger(runId) || runId <= 0) notFound();

  const userMetadata = await getUserMetadata();
  const organizationId = userMetadata?.organizationId ?? '';

  const report = await getEmployeeImportRun(organizationId, runId);
  if (!report) notFound();
  const { run, baseline } = report;

  return (
    <SettingsPage wide className="space-y-10">
      <div className="space-y-6">
        <div>
          <Link
            href="/settings/employees"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            Employee Directory
          </Link>
          <h3 className="font-medium">Import Delta Report</h3>
          <p className="text-sm text-muted-foreground">
            What changed between the previous employee directory and the file
            just imported.
          </p>
        </div>
        <Separator />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded border border-border/30 bg-muted/30 px-4 py-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Baseline</p>
          <p className="font-medium">
            {baseline
              ? baseline.file_name
              : `Directory (${run.previous_employee_count} employees)`}
          </p>
          {baseline && (
            <p className="text-xs text-muted-foreground">
              <FormattedDate value={baseline.created_at} /> ·{' '}
              {baseline.row_count} rows
            </p>
          )}
        </div>
        <ArrowRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-xs text-muted-foreground">New file</p>
          <p className="font-medium">{run.file_name}</p>
          <p className="text-xs text-muted-foreground">
            <FormattedDate value={run.created_at} /> · {run.row_count} rows
          </p>
        </div>
      </div>

      <ImportReport changes={run.changes} />
    </SettingsPage>
  );
}
