import { getUserMetadata } from '@/data/users';
import { getOrgEmployees } from '@/data/superuser/org-employees';
import { getLatestEmployeeImportRunId } from '@/data/superuser/employee-import-runs';
import { getOrgBusinessGroupNodes } from '@/data/superuser/org-units';
import { Separator } from '@/components/ui/separator';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import { verifyAbility } from '@/data/user-permissions';
import { redirect } from 'next/navigation';
import { AuthorizationError } from '@/lib/errors';
import type { OrgEmployee } from '@/constants/types';
import { getSavedImportMapping } from '@/lib/v2/employee-import/mapping-store';
import type { EmployeeImportMapping } from '@/lib/v2/employee-import/types';
import { EmployeesPageClient } from './EmployeesPageClient';
import { SettingsPage } from '@/components/settings/SettingsPage';

export default async function EmployeesPage() {
  try {
    await verifyAbility('manage', 'Organization');
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect('/dashboard');
    }
    throw error;
  }

  const userMetadata = await getUserMetadata();
  const organizationId = userMetadata?.organizationId ?? '';

  let employees: OrgEmployee[] = [];
  let orgGroups: Array<{ id: number; name: string }> = [];
  let importMapping: EmployeeImportMapping | null = null;
  let latestImportRunId: number | null = null;

  try {
    const [employeesData, groupsData, mappingResult, latestRunId] =
      await Promise.all([
        getOrgEmployees(organizationId),
        getOrgBusinessGroupNodes(),
        getSavedImportMapping().catch((err) => {
          logger.warn(
            { error: sanitizeForLogging(err), organizationId },
            'Could not load the saved employee import mapping',
          );
          return null;
        }),
        getLatestEmployeeImportRunId(organizationId).catch((err) => {
          logger.warn(
            { error: sanitizeForLogging(err), organizationId },
            'Could not load the latest employee import run',
          );
          return null;
        }),
      ]);
    employees = employeesData;
    orgGroups = groupsData;
    importMapping = mappingResult;
    latestImportRunId = latestRunId;
  } catch (err) {
    logger.error(
      {
        error: sanitizeForLogging(err),
        organizationId,
      },
      'Error fetching organization employees',
    );
    throw err;
  }

  return (
    <SettingsPage wide className="space-y-10">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Employee Directory</h3>
            <p className="text-sm text-muted-foreground">
              Manage employee list for subscription tracking
            </p>
          </div>
        </div>
        <Separator />
      </div>

      <EmployeesPageClient
        organizationId={organizationId}
        initialEmployees={employees}
        orgGroups={orgGroups}
        initialImportMapping={importMapping}
        initialImportRunId={latestImportRunId}
      />
    </SettingsPage>
  );
}
